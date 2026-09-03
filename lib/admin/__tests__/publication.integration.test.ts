import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Integración de la publicación consistente (Fase 9.5, 5B) contra el Supabase
 * REAL. Migraciones 0029 (funciones + resumen + listado) y 0031 (trigger).
 *
 * Lo que protegen, por orden de importancia:
 *   1. **NO SE PUBLICA LO QUE DARÍA 404.** Un producto sin ninguna variante
 *      activa no puede pasar a `active`, ni por la Server Action ni por POST
 *      directo a PostgREST.
 *   2. **EL AGOTADO SIGUE SIENDO LEGAL.** Stock 0 con variante activa se
 *      publica sin problema: la ficha responde 200 y muestra "Agotado". Es
 *      comportamiento intencionado y documentado (01-PRODUCT.md).
 *   3. **NO SE CASTIGA AL QUE ARREGLA.** Un producto ya publicado que se quedó
 *      sin variantes activas se puede seguir editando y despublicando.
 *   4. **LA LISTA Y EL NÚMERO NO DISCREPAN**: `admin_unsellable_products` usa
 *      el mismo predicado que `unsellable_products` del resumen.
 *
 * Los fixtures se crean y se BORRAN aquí; la BD vuelve a su baseline.
 */

interface Env {
  url: string;
  anon: string;
  service: string;
}

function readEnv(): Env | null {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    const map = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const i = line.indexOf("=");
          return [
            line.slice(0, i).trim(),
            line.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
          ];
        }),
    );
    const url = map.NEXT_PUBLIC_SUPABASE_URL;
    const anon = map.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = map.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !service) return null;
    return { url, anon, service };
  } catch {
    return null;
  }
}

const env = readEnv();
const skip = env === null ? "sin .env.local: integración NO VALIDADA" : false;

async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function as(token: string | null, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    apikey: env!.anon,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${env!.url}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function rpc(token: string | null, fn: string, args: unknown) {
  const headers: Record<string, string> = {
    apikey: env!.anon,
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${env!.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `pub-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Pb-${Math.random().toString(36).slice(2)}-D5`;

  const created = await fetch(`${env!.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = (await created.json()) as { id?: string };
  assert.ok(user.id, "no se pudo crear el usuario");

  if (isAdmin) {
    const profile = await db("profiles", {
      method: "POST",
      body: JSON.stringify({ id: user.id, role: "admin" }),
    });
    assert.equal(profile.status, 201, JSON.stringify(profile.body));
  }

  const session = await fetch(`${env!.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokens = (await session.json()) as { access_token?: string };
  assert.ok(tokens.access_token, "login del fixture falló");
  return { id: user.id, token: tokens.access_token };
}

async function deleteUser(id: string): Promise<void> {
  await db(`profiles?id=eq.${id}`, { method: "DELETE" });
  await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

const PFX = "zz-5b-pub";

let adminUser: TestUser;
let plainUser: TestUser;
let categoryEs = "";
let categoryCo = "";

async function makeProduct(
  market: string,
  suffix: string,
  status = "draft",
): Promise<string> {
  const { body } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: market,
      category_id: market === "ES" ? categoryEs : categoryCo,
      name: `ZZ 5B ${suffix}`,
      slug: `${PFX}-${suffix}-${Math.random().toString(36).slice(2, 7)}`,
      status,
    }),
  });
  return (body as { id: string }[])[0].id;
}

async function addVariant(productId: string, stock: number, isActive: boolean) {
  const { status, body } = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: productId,
      sku: `${PFX}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
      price: 10,
      stock,
      is_active: isActive,
    }),
  });
  assert.equal(status, 201, JSON.stringify(body));
  return (body as { id: string }[])[0].id;
}

async function publish(token: string | null, productId: string) {
  return as(token, `products?id=eq.${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
}

async function cleanup() {
  if (!env) return;
  const { body: products } = await db(`products?slug=like.${PFX}*&select=id`);
  for (const p of (products ?? []) as { id: string }[]) {
    await db(`product_variants?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`products?id=eq.${p.id}`, { method: "DELETE" });
  }
  await db(`categories?slug=like.${PFX}*`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();
  adminUser = await createUser(true);
  plainUser = await createUser(false);

  for (const market of ["ES", "CO"]) {
    const { body } = await db("categories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: market,
        name: `ZZ 5B ${market}`,
        slug: `${PFX}-cat-${market.toLowerCase()}`,
        sort_order: 999,
      }),
    });
    const id = (body as { id: string }[])[0].id;
    if (market === "ES") categoryEs = id;
    else categoryCo = id;
  }
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [adminUser, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

// ────────────────────────────────── la barrera de publicación

describe("publicar · lo que daría 404 no se publica", { skip }, () => {
  test("un producto SIN NINGUNA variante no se puede publicar", async () => {
    const id = await makeProduct("ES", "sin-variantes");
    const { status, body } = await publish(adminUser.token, id);

    assert.ok(status >= 400, `esperaba rechazo, dio ${status}`);
    assert.match(JSON.stringify(body), /NO_ACTIVE_VARIANT/);

    const { body: after } = await db(`products?id=eq.${id}&select=status`);
    assert.equal(
      (after as { status: string }[])[0].status,
      "draft",
      "debe seguir en borrador",
    );
  });

  test("con todas sus variantes INACTIVAS tampoco", async () => {
    const id = await makeProduct("ES", "solo-inactivas");
    await addVariant(id, 10, false);
    await addVariant(id, 10, false);

    const { status } = await publish(adminUser.token, id);
    assert.ok(status >= 400, "una variante inactiva no hace comprable nada");
  });

  test("el POST DIRECTO a PostgREST tampoco lo consigue", async () => {
    // El trigger vive en PostgreSQL justamente para esto: saltarse la Server
    // Action no sirve de nada.
    const { status, body } = await as(adminUser.token, "products", {
      method: "POST",
      body: JSON.stringify({
        market_id: "ES",
        category_id: categoryEs,
        name: "ZZ 5B insert directo",
        slug: `${PFX}-insert-directo-${Math.random().toString(36).slice(2, 7)}`,
        status: "active",
      }),
    });

    assert.ok(status >= 400, `esperaba rechazo, dio ${status}`);
    assert.match(JSON.stringify(body), /NO_ACTIVE_VARIANT/);
  });

  test("CONTROL POSITIVO: con una variante activa sí se publica", async () => {
    const id = await makeProduct("ES", "publicable");
    await addVariant(id, 7, true);

    const { status } = await publish(adminUser.token, id);
    assert.ok(status < 300, `debía publicarse, dio ${status}`);
  });
});

describe("publicar · el agotado sigue siendo legal", { skip }, () => {
  test("stock 0 con variante activa SE PUBLICA", async () => {
    // Es la línea que separa PUBLICABLE de VENDIBLE. Bloquear esto sería
    // inventar una regla comercial: el escaparate ya muestra "Agotado" a
    // propósito y `01-PRODUCT.md` lo lista como caso previsto.
    const id = await makeProduct("ES", "agotado");
    await addVariant(id, 0, true);

    const { status } = await publish(adminUser.token, id);
    assert.ok(status < 300, `un agotado debe poder publicarse, dio ${status}`);

    const { body } = await rpc(adminUser.token, "product_is_sellable", {
      p_product_id: id,
    });
    assert.equal(body, false, "publicable, pero no vendible ahora mismo");
  });
});

describe("publicar · no se castiga al que arregla", { skip }, () => {
  test("un publicado que se quedó sin variantes activas SE PUEDE EDITAR", async () => {
    // Corrección de la migración 0031: la versión anterior revalidaba en
    // CUALQUIER update, así que corregirle el nombre a un producto roto
    // fallaba y obligaba a despublicarlo primero.
    const id = await makeProduct("ES", "roto-editable");
    const variantId = await addVariant(id, 5, true);
    assert.ok((await publish(adminUser.token, id)).status < 300);

    // Se desactiva la última variante: el estado roto, alcanzado por detrás.
    await db(`product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const { status } = await as(adminUser.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "ZZ 5B roto editable (corregido)" }),
    });
    assert.ok(status < 300, `editar un producto roto debe funcionar, dio ${status}`);
  });

  test("y SE PUEDE DESPUBLICAR", async () => {
    const id = await makeProduct("ES", "roto-despublicable");
    const variantId = await addVariant(id, 5, true);
    await publish(adminUser.token, id);
    await db(`product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const { status } = await as(adminUser.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "draft" }),
    });
    assert.ok(status < 300, `despublicar debe funcionar, dio ${status}`);
  });

  test("desactivar la última variante NO despublica automáticamente", async () => {
    // Comportamiento deliberado: la despublicación automática está fuera de
    // alcance. El estado roto lo señala la alerta, no lo arregla el sistema.
    const id = await makeProduct("ES", "sigue-publicado");
    const variantId = await addVariant(id, 5, true);
    await publish(adminUser.token, id);
    await db(`product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const { body } = await db(`products?id=eq.${id}&select=status`);
    assert.equal((body as { status: string }[])[0].status, "active");
  });
});

// ────────────────────────────────── quiénes son, no solo cuántos

describe("admin_unsellable_products", { skip }, () => {
  test("un ANÓNIMO no obtiene nada", async () => {
    const { status } = await rpc(null, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    assert.ok(status >= 400, `status=${status}`);
  });

  test("un autenticado SIN rol de admin es rechazado", async () => {
    const { status, body } = await rpc(plainUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    assert.ok(status >= 400, JSON.stringify(body));
  });

  test("distingue los dos motivos, que se arreglan distinto", async () => {
    const roto = await makeProduct("ES", "motivo-roto");
    const variantId = await addVariant(roto, 5, true);
    await publish(adminUser.token, roto);
    await db(`product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const agotado = await makeProduct("ES", "motivo-agotado");
    await addVariant(agotado, 0, true);
    await publish(adminUser.token, agotado);

    const { body } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    const list = body as { id: string; reason: string }[];

    assert.equal(
      list.find((p) => p.id === roto)?.reason,
      "sin_variante_activa",
      "sin variantes activas la ficha da 404",
    );
    assert.equal(
      list.find((p) => p.id === agotado)?.reason,
      "agotado",
      "con variante activa y stock 0 la ficha funciona",
    );
  });

  test("lo roto va ANTES que lo agotado: un 404 es peor", async () => {
    const { body } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    const reasons = (body as { reason: string }[]).map((p) => p.reason);
    const ultimoRoto = reasons.lastIndexOf("sin_variante_activa");
    const primerAgotado = reasons.indexOf("agotado");
    if (ultimoRoto >= 0 && primerAgotado >= 0) {
      assert.ok(ultimoRoto < primerAgotado, `orden inesperado: ${reasons.join(",")}`);
    }
  });

  test("un producto VENDIBLE no aparece", async () => {
    const sano = await makeProduct("ES", "sano");
    await addVariant(sano, 20, true);
    await publish(adminUser.token, sano);

    const { body } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    assert.ok(!(body as { id: string }[]).some((p) => p.id === sano));
  });

  test("un BORRADOR roto no aparece: todavía no lo ve nadie", async () => {
    const borrador = await makeProduct("ES", "borrador-roto");

    const { body } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    assert.ok(!(body as { id: string }[]).some((p) => p.id === borrador));
  });

  test("no cruza mercados: los de ES no salen al pedir CO", async () => {
    const { body: es } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
    });
    const { body: co } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "CO",
    });
    const esIds = new Set((es as { id: string }[]).map((p) => p.id));
    for (const p of co as { id: string }[]) {
      assert.ok(!esIds.has(p.id), "un producto no puede estar en los dos mercados");
    }
  });

  test("el NÚMERO del resumen y la LISTA usan el mismo predicado", async () => {
    // Si divergen, la alerta dice "3" y el filtro enseña otra cosa: el aviso
    // dejaría de ser creíble.
    const { body: summary } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    const { body: list } = await rpc(adminUser.token, "admin_unsellable_products", {
      p_market_id: "ES",
      p_limit: 200,
    });

    assert.equal(
      (summary as { unsellable_products: number }).unsellable_products,
      (list as unknown[]).length,
    );
  });
});
