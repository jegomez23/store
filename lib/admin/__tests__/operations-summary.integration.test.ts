import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Integración de la Fase 9.5 — Incremento 2, contra el Supabase REAL.
 *
 * Cubre las dos piezas nuevas del data layer:
 *   1. `admin_operations_summary` (migración 0023): que agrega de verdad, que
 *      no cruza mercados y que un no-admin no obtiene datos.
 *   2. `product_variants.is_low_stock` (migración 0024): que es DERIVADA y no
 *      se puede escribir ni siquiera con la service role key.
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

/** Service role: SOLO fixtures y limpieza. */
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

/** Llama a la RPC con el JWT de un usuario, como haría el panel. */
async function rpc(token: string, fn: string, args: Record<string, unknown>) {
  const response = await fetch(`${env!.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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
  const email = `ops-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Op-${Math.random().toString(36).slice(2)}-B7`;

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
  assert.ok(user.id, `no se pudo crear el usuario: ${JSON.stringify(user)}`);

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
  assert.ok(tokens.access_token, `login del fixture falló`);
  return { id: user.id, token: tokens.access_token };
}

async function deleteUser(id: string): Promise<void> {
  await db(`profiles?id=eq.${id}`, { method: "DELETE" });
  await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

const PFX = "zz-f95-ops";
const ORDER_PFX = "YI-ES-S";

let adminUser: TestUser;
let plainUser: TestUser;
let categoryId = "";
let unsellableId = "";
let healthyId = "";
let lowVariantId = "";

async function cleanup() {
  if (!env) return;
  const { body: orders } = await db(`orders?order_number=like.${ORDER_PFX}*&select=id`);
  for (const o of (orders ?? []) as { id: string }[]) {
    await db(`order_events?order_id=eq.${o.id}`, { method: "DELETE" });
    await db(`order_items?order_id=eq.${o.id}`, { method: "DELETE" });
    await db(`orders?id=eq.${o.id}`, { method: "DELETE" });
  }
  await db(`customers?phone=like.34977*`, { method: "DELETE" });
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

  const cat = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ Ops",
      slug: `${PFX}-cat`,
      sort_order: 990,
      is_active: false,
    }),
  });
  categoryId = (cat.body as { id: string }[])[0].id;

  const prods = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Ops agotado",
        slug: `${PFX}-agotado`,
        // Nace en borrador y se publica DESPUÉS de tener variantes, igual que
        // en el panel: desde la migración 0031, confirmar un producto
        // publicado sin ninguna variante activa lanza NO_ACTIVE_VARIANT.
        status: "draft",
      },
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Ops sano",
        slug: `${PFX}-sano`,
        status: "draft",
      },
    ]),
  });
  const rows = prods.body as { id: string; slug: string }[];
  unsellableId = rows.find((r) => r.slug.endsWith("agotado"))!.id;
  healthyId = rows.find((r) => r.slug.endsWith("sano"))!.id;

  // Producto publicado SIN stock vendible → cuenta como "unsellable".
  await db("product_variants", {
    method: "POST",
    body: JSON.stringify({
      product_id: unsellableId,
      sku: `${PFX.toUpperCase()}-A1`,
      price: 10,
      stock: 0,
      low_stock_threshold: 3,
      is_active: true,
    }),
  });

  // Variante justo EN el umbral → cuenta como "low stock" pero es vendible.
  const lowVariant = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: healthyId,
      sku: `${PFX.toUpperCase()}-B1`,
      price: 20,
      stock: 3,
      low_stock_threshold: 3,
      is_active: true,
    }),
  });
  lowVariantId = (lowVariant.body as { id: string }[])[0].id;

  // Ahora que ambos tienen variantes, se publican. Este es el orden real del
  // panel (crear → variantes → publicar) y el único que acepta el trigger
  // `enforce_publishable_product` (migración 0031).
  //
  // Ojo: el producto "agotado" tiene una variante ACTIVA con stock 0, así que
  // es PUBLICABLE (su ficha responde 200 y muestra "Agotado") aunque no sea
  // VENDIBLE. Son dos conceptos distintos y esta es justo la diferencia.
  for (const id of [unsellableId, healthyId]) {
    const published = await db(`products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    assert.ok(published.status < 300, JSON.stringify(published.body));
  }
});

after(async () => {
  if (!env) return;
  await cleanup();
  if (adminUser) await deleteUser(adminUser.id);
  if (plainUser) await deleteUser(plainUser.id);
});

describe("admin_operations_summary — autorización", { skip }, () => {
  test("un ANÓNIMO no obtiene datos", async () => {
    const response = await fetch(`${env!.url}/rest/v1/rpc/admin_operations_summary`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ p_market_id: "ES" }),
    });
    assert.ok(response.status >= 400, `status=${response.status}`);
  });

  test("un autenticado SIN rol de admin es rechazado, no recibe ceros", async () => {
    const { status, body } = await rpc(plainUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    assert.ok(status >= 400, `status=${status}`);
    assert.match(JSON.stringify(body), /FORBIDDEN/);
  });

  test("un ADMIN sí obtiene el resumen (control positivo)", async () => {
    const { status, body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body !== null && typeof body === "object");
  });
});

describe("admin_operations_summary — agrega de verdad", { skip }, () => {
  /**
   * Cuenta exacta por estado SIN traerse las filas, usando la cabecera
   * `Content-Range` de PostgREST.
   *
   * NO se cuentan las filas descargadas, y esa es justamente la lección del
   * incremento: PostgREST devuelve **como máximo 1000 filas** aunque no se pida
   * límite. Contar sobre lo descargado da un número silenciosamente incorrecto
   * en cuanto la tabla pasa de 1000 registros.
   */
  async function exactCount(query: string): Promise<number> {
    const response = await fetch(`${env!.url}/rest/v1/${query}`, {
      method: "HEAD",
      headers: {
        apikey: env!.service,
        Authorization: `Bearer ${env!.service}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    const range = response.headers.get("content-range") ?? "";
    return Number.parseInt(range.split("/")[1] ?? "0", 10);
  }

  test("los conteos por estado coinciden con el conteo EXACTO de PostgreSQL", async () => {
    const { body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    const summary = body as {
      by_status: Record<string, number>;
      orders_total: number;
    };

    for (const [status, n] of Object.entries(summary.by_status)) {
      const real = await exactCount(`orders?market_id=eq.ES&status=eq.${status}&select=id`);
      assert.equal(n, real, `estado ${status}`);
    }

    const total = await exactCount("orders?market_id=eq.ES&select=id");
    assert.equal(summary.orders_total, total);
  });

  test("REGRESIÓN: contar descargando filas se rompe pasadas 1000", async () => {
    // Este test documenta el bug que motivó el incremento. Si algún día alguien
    // vuelve a contar en JavaScript sobre `select(...)`, esta comprobación
    // explica por qué está mal.
    const response = await fetch(`${env!.url}/rest/v1/orders?market_id=eq.ES&select=status`, {
      headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
    });
    const rows = (await response.json()) as unknown[];
    const total = await exactCount("orders?market_id=eq.ES&select=id");

    assert.ok(rows.length <= 1000, "PostgREST no devuelve más de 1000 filas por defecto");
    if (total > 1000) {
      assert.ok(
        rows.length < total,
        "con más de 1000 pedidos, descargar filas da un conteo TRUNCADO",
      );
    }
  });

  test("devuelve un objeto de tamaño FIJO, no una fila por pedido", async () => {
    const { body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    // Ese es el punto entero del incremento: 5 claves, pase lo que pase.
    assert.deepEqual(Object.keys(body as object).sort(), [
      "by_status",
      "low_stock_variants",
      "oldest_waiting_at",
      "orders_total",
      "unsellable_products",
    ]);
  });

  test("no cruza mercados: CO no ve los pedidos de ES", async () => {
    const { body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "CO",
    });
    const summary = body as { orders_total: number; unsellable_products: number };
    assert.equal(summary.orders_total, 0);
    assert.equal(summary.unsellable_products, 0);
  });

  test("un mercado inexistente devuelve ceros en vez de fallar", async () => {
    const { status, body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "XX",
    });
    assert.equal(status, 200);
    assert.equal((body as { orders_total: number }).orders_total, 0);
  });

  test("cuenta el producto publicado que NO se puede comprar", async () => {
    const { body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    assert.ok(
      (body as { unsellable_products: number }).unsellable_products >= 1,
      "el producto con stock 0 debería contarse",
    );
  });

  test("cuenta la variante que está EN el umbral (<=, no <)", async () => {
    const { body } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    assert.ok(
      (body as { low_stock_variants: number }).low_stock_variants >= 1,
      "stock == threshold debe contar como bajo",
    );
  });

  test("un producto en BORRADOR no cuenta como invendible", async () => {
    await db(`products?id=eq.${unsellableId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "draft" }),
    });
    const { body: draft } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    const withDraft = (draft as { unsellable_products: number }).unsellable_products;

    await db(`products?id=eq.${unsellableId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const { body: active } = await rpc(adminUser.token, "admin_operations_summary", {
      p_market_id: "ES",
    });
    const withActive = (active as { unsellable_products: number }).unsellable_products;

    assert.equal(withActive, withDraft + 1, "publicarlo debe sumarlo, despublicarlo restarlo");
  });
});

describe("is_low_stock: columna DERIVADA, no escribible", { skip }, () => {
  test("PostgreSQL la calcula sola al crear la variante", async () => {
    const { body } = await db(
      `product_variants?id=eq.${lowVariantId}&select=stock,low_stock_threshold,is_low_stock`,
    );
    const row = (body as { stock: number; low_stock_threshold: number; is_low_stock: boolean }[])[0];
    assert.equal(row.stock, 3);
    assert.equal(row.low_stock_threshold, 3);
    assert.equal(row.is_low_stock, true, "stock == threshold es stock bajo");
  });

  test("se recalcula al reponer, sin que nadie la toque", async () => {
    await db(`product_variants?id=eq.${lowVariantId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: 50 }),
    });
    const { body } = await db(`product_variants?id=eq.${lowVariantId}&select=is_low_stock`);
    assert.equal((body as { is_low_stock: boolean }[])[0].is_low_stock, false);

    await db(`product_variants?id=eq.${lowVariantId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: 3 }),
    });
    const { body: back } = await db(`product_variants?id=eq.${lowVariantId}&select=is_low_stock`);
    assert.equal((back as { is_low_stock: boolean }[])[0].is_low_stock, true);
  });

  test("NO se puede mentir sobre ella ni con la service role key", async () => {
    const response = await db(`product_variants?id=eq.${lowVariantId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_low_stock: false }),
    });
    assert.ok(
      response.status >= 400,
      `PostgreSQL debería rechazar escribir una columna generada (status=${response.status})`,
    );
  });
});
