import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { relaxCheckoutLimits } from "../../checkout/__tests__/checkout-limits.helper.ts";

/**
 * CRUD de métodos de entrega contra el Supabase REAL (incremento 9).
 *
 * Lo que protegen, por orden de importancia:
 *
 *   1. **LO QUE SE ESCRIBE AQUÍ DECIDE LO QUE COBRA LA TIENDA.** Un umbral
 *      negativo haría el envío gratis para todos; un nombre vacío pinta una
 *      opción en blanco en el checkout; dos nombres iguales son dos radios
 *      indistinguibles. Los tres los impide PostgreSQL desde la 0036.
 *   2. **BORRAR NO REESCRIBE PEDIDOS.** `on delete set null` + el snapshot del
 *      nombre: el pedido conserva qué envío se le cobró y cuánto.
 *   3. **anon y autenticado-sin-admin no escriben**, y el admin no puede tocar
 *      un mercado inactivo (DEC-035).
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

// Esta suite crea pedidos más deprisa de lo que la 0046 deja a un cliente real:
// se relajan los umbrales y se restauran al terminar (DEC-088).
let restoreCheckoutLimits: (() => Promise<void>) | null = null;
before(async () => {
  if (env) restoreCheckoutLimits = await relaxCheckoutLimits(env);
});
after(async () => {
  await restoreCheckoutLimits?.();
});

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

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `envio-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `En-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Envio" }),
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

/** Prefijo de TODO lo que crea este archivo. */
const PFX = "ZZ ENV";
const SLUG_PFX = "zz-env";

let admin: TestUser;
let plainUser: TestUser;
let variantId = "";

const uniq = () => Math.random().toString(36).slice(2, 7);
const methodName = () => `${PFX} ${uniq()}`;

/** Crea un método con la sesión del ADMIN, que es el camino real del panel. */
async function createMethod(over: Record<string, unknown> = {}) {
  return as(admin.token, "shipping_methods", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: methodName(),
      price: 4.9,
      sort_order: 900,
      ...over,
    }),
  });
}

async function cleanup() {
  if (!env) return;
  const { body: customers } = await db(
    `customers?name=like.${encodeURIComponent(PFX)}*&select=id`,
  );
  for (const c of (customers ?? []) as { id: string }[]) {
    const { body: orders } = await db(`orders?customer_id=eq.${c.id}&select=id`);
    for (const o of (orders ?? []) as { id: string }[]) {
      await db(`order_events?order_id=eq.${o.id}`, { method: "DELETE" });
      await db(`order_items?order_id=eq.${o.id}`, { method: "DELETE" });
      await db(`orders?id=eq.${o.id}`, { method: "DELETE" });
    }
    await db(`customers?id=eq.${c.id}`, { method: "DELETE" });
  }
  const { body: products } = await db(`products?slug=like.${SLUG_PFX}*&select=id`);
  for (const p of (products ?? []) as { id: string }[]) {
    await db(`admin_change_log?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`products?id=eq.${p.id}`, { method: "DELETE" });
  }
  await db(`categories?slug=like.${SLUG_PFX}*`, { method: "DELETE" });
  await db(`shipping_methods?name=like.${encodeURIComponent(PFX)}*`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();
  admin = await createUser(true);
  plainUser = await createUser(false);

  const { body: cat } = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ env",
      slug: `${SLUG_PFX}-cat`,
      sort_order: 973,
    }),
  });
  const { body: prod } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: (cat as { id: string }[])[0].id,
      name: "ZZ ENV producto",
      slug: `${SLUG_PFX}-prod`,
      status: "draft",
    }),
  });
  const { body: variant } = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: (prod as { id: string }[])[0].id,
      sku: `${SLUG_PFX}-SKU`.toUpperCase(),
      price: 10,
      stock: 500,
      is_active: true,
    }),
  });
  variantId = (variant as { id: string }[])[0].id;
  await db(`products?id=eq.${(prod as { id: string }[])[0].id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [admin, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("métodos de entrega · quién puede escribir", { skip }, () => {
  test("ANON no crea", async () => {
    const result = await as(null, "shipping_methods", {
      method: "POST",
      body: JSON.stringify({ market_id: "ES", name: methodName(), price: 1 }),
    });
    assert.equal(result.body.code, "42501", JSON.stringify(result.body));
  });

  test("un AUTENTICADO SIN rol de admin tampoco", async () => {
    const result = await as(plainUser.token, "shipping_methods", {
      method: "POST",
      body: JSON.stringify({ market_id: "ES", name: methodName(), price: 1 }),
    });
    assert.equal(result.body.code, "42501");
  });

  test("un no-admin no puede cambiar el PRECIO de un método existente", async () => {
    const created = await createMethod({ price: 4.9 });
    const id = (created.body as { id: string }[])[0].id;

    await as(plainUser.token, `shipping_methods?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 0 }),
    });

    const { body } = await db(`shipping_methods?id=eq.${id}&select=price`);
    assert.equal(
      Number.parseFloat(String((body as { price: unknown }[])[0].price)),
      4.9,
      "el precio sigue intacto",
    );
  });

  test("CONTROL POSITIVO: el admin crea, edita y borra", async () => {
    const created = await createMethod({ price: 3.5 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = (created.body as { id: string }[])[0].id;

    const patched = await as(admin.token, `shipping_methods?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ price: 6.25, is_active: false }),
    });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(Number.parseFloat(String((patched.body as { price: unknown }[])[0].price)), 6.25);

    const deleted = await as(admin.token, `shipping_methods?id=eq.${id}`, { method: "DELETE" });
    assert.ok(deleted.status < 300, JSON.stringify(deleted.body));
  });

  test("el admin NO puede crear ni mover un método a un mercado INACTIVO", async () => {
    // DEC-035: CO está inactivo, así que RLS lo rechaza venga de donde venga.
    const created = await as(admin.token, "shipping_methods", {
      method: "POST",
      body: JSON.stringify({ market_id: "CO", name: methodName(), price: 1 }),
    });
    assert.equal(created.body.code, "42501", JSON.stringify(created.body));

    const own = await createMethod();
    const id = (own.body as { id: string }[])[0].id;
    const moved = await as(admin.token, `shipping_methods?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ market_id: "CO" }),
    });
    assert.equal(moved.body.code, "42501");
  });
});

describe("métodos de entrega · lo que impide PostgreSQL (0036)", { skip }, () => {
  test("un UMBRAL NEGATIVO se rechaza", async () => {
    // ANTES de la 0036 esto devolvía 201, y dejaba el envío gratis para todos
    // porque `subtotal >= -50` es siempre cierto.
    const result = await createMethod({ free_shipping_threshold: -50 });
    assert.equal(result.body.code, "23514", JSON.stringify(result.body));
  });

  test("un umbral de 0 SÍ se acepta: significa gratis siempre", async () => {
    const result = await createMethod({ free_shipping_threshold: 0 });
    assert.equal(result.status, 201, JSON.stringify(result.body));
  });

  test("un NOMBRE VACÍO o de solo espacios se rechaza", async () => {
    // ANTES devolvía 201 y pintaba una opción en blanco en el checkout.
    for (const bad of ["", "   "]) {
      const result = await createMethod({ name: bad });
      assert.equal(result.body.code, "23514", `${JSON.stringify(bad)}: ${JSON.stringify(result.body)}`);
    }
  });

  test("dos métodos con el MISMO nombre en el mismo mercado se rechazan", async () => {
    const name = methodName();
    const first = await createMethod({ name });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const second = await createMethod({ name });
    assert.equal(second.body.code, "23505", JSON.stringify(second.body));
  });

  test("el PRECIO negativo sigue rechazándose (CHECK de la 0012)", async () => {
    const result = await createMethod({ price: -1 });
    assert.equal(result.body.code, "23514");
  });

  test("renombrar a un nombre ya usado también se rechaza", async () => {
    const taken = methodName();
    await createMethod({ name: taken });
    const other = await createMethod();
    const id = (other.body as { id: string }[])[0].id;

    const renamed = await as(admin.token, `shipping_methods?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: taken }),
    });
    assert.equal(renamed.body.code, "23505", JSON.stringify(renamed.body));
  });

  test("los dos métodos REALES del seed cumplen las tres reglas nuevas", async () => {
    // Si no las cumplieran, la 0036 no habría podido aplicarse. Se comprueba
    // explícitamente porque es la premisa de que entrara sin tocar datos.
    const { body } = await db(
      "shipping_methods?select=name,price,free_shipping_threshold,market_id&name=not.like.ZZ*",
    );
    const rows = body as {
      name: string;
      price: unknown;
      free_shipping_threshold: unknown;
      market_id: string;
    }[];
    assert.ok(rows.length >= 2);
    const keys = new Set<string>();
    for (const row of rows) {
      assert.notEqual(row.name.trim(), "");
      assert.ok(Number.parseFloat(String(row.price)) >= 0);
      if (row.free_shipping_threshold !== null) {
        assert.ok(Number.parseFloat(String(row.free_shipping_threshold)) >= 0);
      }
      keys.add(`${row.market_id}|${row.name}`);
    }
    assert.equal(keys.size, rows.length, "no puede haber nombres repetidos por mercado");
  });
});

describe("métodos de entrega · borrar NO reescribe pedidos", { skip }, () => {
  test("un pedido conserva método, envío y total cuando se borra el método", async () => {
    const created = await createMethod({ name: `${PFX} borrable`, price: 7.5 });
    const id = (created.body as { id: string }[])[0].id;

    const order = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_market_id: "ES",
        p_items: [{ variant_id: variantId, quantity: 1 }],
        p_customer_phone: "34600444111",
        p_customer_name: `${PFX} Cliente`,
        p_client_request_id: crypto.randomUUID(),
        p_shipping_method_id: id,
      }),
    });
    const body = (await order.json()) as { order_number: string };
    assert.ok(order.status < 300, JSON.stringify(body));

    const deleted = await as(admin.token, `shipping_methods?id=eq.${id}`, { method: "DELETE" });
    assert.ok(deleted.status < 300, "borrar un método CON pedidos debe funcionar");

    const { body: rows } = await db(
      `orders?order_number=eq.${body.order_number}&select=shipping_method_id,shipping_method_name,shipping_total,total,subtotal`,
    );
    const row = (rows as Record<string, unknown>[])[0];
    assert.equal(row.shipping_method_id, null, "pierde el enlace, que es lo esperado");
    assert.equal(row.shipping_method_name, `${PFX} borrable`, "pero CONSERVA el nombre");
    assert.equal(Number.parseFloat(String(row.shipping_total)), 7.5, "y el importe cobrado");
    assert.equal(
      Number.parseFloat(String(row.total)),
      Number.parseFloat(String(row.subtotal)) + 7.5,
      "y el total sigue cuadrando",
    );
  });

  test("DESACTIVAR no borra: el método sigue ahí y deja de ofrecerse", async () => {
    const created = await createMethod({ name: `${PFX} retirado` });
    const id = (created.body as { id: string }[])[0].id;

    await as(admin.token, `shipping_methods?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    // El admin lo sigue viendo (para poder reactivarlo)…
    const forAdmin = await as(admin.token, `shipping_methods?id=eq.${id}&select=id,is_active`);
    assert.equal((forAdmin.body as unknown[]).length, 1);

    // …y el público no.
    const forAnon = await as(null, `shipping_methods?id=eq.${id}&select=id`);
    assert.deepEqual(forAnon.body, [], "un método retirado no se ofrece");

    // Y el checkout lo rechaza aunque alguien mande su id a mano.
    const order = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_market_id: "ES",
        p_items: [{ variant_id: variantId, quantity: 1 }],
        p_customer_phone: "34600444222",
        p_customer_name: `${PFX} Cliente`,
        p_client_request_id: crypto.randomUUID(),
        p_shipping_method_id: id,
      }),
    });
    assert.match(JSON.stringify(await order.json()), /INVALID_SHIPPING_METHOD/);
  });
});

describe("métodos de entrega · concurrencia", { skip }, () => {
  test("dos altas simultáneas del MISMO nombre dejan UNA fila", async () => {
    const name = methodName();
    const payload = JSON.stringify({
      market_id: "ES",
      name,
      price: 2,
      sort_order: 900,
    });
    const [a, b] = await Promise.all([
      as(admin.token, "shipping_methods", { method: "POST", body: payload }),
      as(admin.token, "shipping_methods", { method: "POST", body: payload }),
    ]);

    assert.equal(
      [a, b].filter((r) => r.status === 201).length,
      1,
      `esperaba 1 alta: ${JSON.stringify([a.body, b.body])}`,
    );
    const { body } = await db(
      `shipping_methods?name=eq.${encodeURIComponent(name)}&select=id`,
    );
    assert.equal((body as unknown[]).length, 1, "nunca dos filas con el mismo nombre");
  });

  test("el doble submit del alta no crea dos métodos", async () => {
    const name = methodName();
    const payload = JSON.stringify({ market_id: "ES", name, price: 2, sort_order: 900 });

    const first = await as(admin.token, "shipping_methods", { method: "POST", body: payload });
    const second = await as(admin.token, "shipping_methods", { method: "POST", body: payload });

    assert.equal(first.status, 201);
    assert.equal(second.body.code, "23505", "el segundo lo para la BD, no el botón");
  });

  test("dos ediciones simultáneas del precio dejan uno de los dos, no una mezcla", async () => {
    const created = await createMethod({ price: 1 });
    const id = (created.body as { id: string }[])[0].id;

    await Promise.all([
      as(admin.token, `shipping_methods?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ price: 10, sort_order: 10 }),
      }),
      as(admin.token, `shipping_methods?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ price: 20, sort_order: 20 }),
      }),
    ]);

    const { body } = await db(`shipping_methods?id=eq.${id}&select=price,sort_order`);
    const row = (body as { price: unknown; sort_order: number }[])[0];
    const price = Number.parseFloat(String(row.price));
    const coherent = (price === 10 && row.sort_order === 10) || (price === 20 && row.sort_order === 20);
    assert.ok(coherent, `fila incoherente: ${JSON.stringify(row)}`);
  });
});
