import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { relaxCheckoutLimits } from "../../checkout/__tests__/checkout-limits.helper.ts";

/**
 * `admin_set_variant_stock` (migración 0038) contra el Supabase REAL.
 *
 * Lo que protegen estos tests, por orden de importancia:
 *
 *   1. **NO PERDER CAMBIOS.** Un testigo caducado NUNCA escribe. Es la razón
 *      de existir del incremento: el administrador copia un número que le han
 *      dictado, y mientras lo escribe otra persona —o una venta— puede haber
 *      dejado otro más nuevo.
 *   2. **TODO O NADA.** Un lote con una sola variante en conflicto no aplica
 *      ninguna de las demás.
 *   3. **AGOTAR ES IDEMPOTENTE** y solo toca su variante.
 *   4. **AUTORIZACIÓN Y MERCADO.** Anónimo, autenticado sin rol y mercado
 *      ajeno, rechazados; con control positivo de que el admin sí puede.
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

/** Llama a la RPC con el token dado (o anónimo si no hay token). */
async function setStock(token: string | null, marketId: string, items: unknown) {
  const response = await fetch(`${env!.url}/rest/v1/rpc/admin_set_variant_stock`, {
    method: "POST",
    headers: {
      apikey: env!.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_market_id: marketId, p_items: items }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `stock-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `St-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Stock" }),
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
const PFX = "zz-stock";

let adminA: TestUser;
let adminB: TestUser;
let plainUser: TestUser;
let categoryId = "";
let productId = "";
let coProductId = "";
/** Tres variantes del mismo producto, como un color con tres tallas. */
let vA = "";
let vB = "";
let vC = "";
let coVariantId = "";

async function stockOf(variantId: string): Promise<number> {
  const row = await db(`product_variants?id=eq.${variantId}&select=stock`);
  return (row.body as { stock: number }[])[0].stock;
}

async function witnessOf(variantId: string): Promise<string> {
  const row = await db(`product_variants?id=eq.${variantId}&select=updated_at`);
  return (row.body as { updated_at: string }[])[0].updated_at;
}

async function reset(variantId: string, stock: number): Promise<void> {
  await db(`product_variants?id=eq.${variantId}`, {
    method: "PATCH",
    body: JSON.stringify({ stock }),
  });
}

const setItem = (variantId: string, stock: number, expectedUpdatedAt: string) => ({
  variant_id: variantId,
  mode: "set",
  stock,
  expected_updated_at: expectedUpdatedAt,
});

before(async () => {
  if (skip) return;

  [adminA, adminB, plainUser] = await Promise.all([
    createUser(true),
    createUser(true),
    createUser(false),
  ]);

  const category = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ Stock",
      slug: `${PFX}-cat`,
      sort_order: 99,
    }),
  });
  categoryId = (category.body as { id: string }[])[0].id;

  const product = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: categoryId,
      name: "ZZ Stock Producto",
      slug: `${PFX}-prod`,
      status: "draft",
    }),
  });
  productId = (product.body as { id: string }[])[0].id;

  const stamp = Date.now();
  const variants = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      { product_id: productId, sku: `ZZSTOCK-${stamp}-A`, price: "10.00", stock: 10, is_active: true },
      { product_id: productId, sku: `ZZSTOCK-${stamp}-B`, price: "10.00", stock: 10, is_active: true },
      { product_id: productId, sku: `ZZSTOCK-${stamp}-C`, price: "10.00", stock: 10, is_active: true },
    ]),
  });
  [vA, vB, vC] = (variants.body as { id: string }[]).map((v) => v.id);

  // Producto en CO, que es un mercado INACTIVO: sirve para el cruce de mercado.
  const coProduct = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "CO",
      category_id: categoryId,
      name: "ZZ Stock CO",
      slug: `${PFX}-prod-co`,
      status: "draft",
    }),
  });
  coProductId = (coProduct.body as { id: string }[])[0].id;
  const coVariant = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: coProductId,
      sku: `ZZSTOCK-${stamp}-CO`,
      price: "10.00",
      stock: 10,
      is_active: true,
    }),
  });
  coVariantId = (coVariant.body as { id: string }[])[0].id;
});

after(async () => {
  if (skip) return;
  for (const id of [productId, coProductId]) {
    if (!id) continue;
    await db(`admin_change_log?product_id=eq.${id}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${id}`, { method: "DELETE" });
    await db(`products?id=eq.${id}`, { method: "DELETE" });
  }
  if (categoryId) await db(`categories?id=eq.${categoryId}`, { method: "DELETE" });
  for (const user of [adminA, adminB, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("admin_set_variant_stock · autorización", { skip }, () => {
  test("anónimo: rechazado", async () => {
    const before = await stockOf(vA);
    const response = await setStock(null, "ES", [setItem(vA, 99, await witnessOf(vA))]);
    assert.notEqual(response.status, 200);
    assert.equal(await stockOf(vA), before, "el anónimo no puede haber escrito");
  });

  test("autenticado SIN rol admin: rechazado", async () => {
    const before = await stockOf(vA);
    const response = await setStock(plainUser.token, "ES", [
      setItem(vA, 99, await witnessOf(vA)),
    ]);
    assert.notEqual(response.status, 200);
    assert.match(JSON.stringify(response.body), /FORBIDDEN/);
    assert.equal(await stockOf(vA), before);
  });

  test("admin: permitido (control positivo)", async () => {
    await reset(vA, 4);
    const response = await setStock(adminA.token, "ES", [
      setItem(vA, 12, await witnessOf(vA)),
    ]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(await stockOf(vA), 12);
  });
});

describe("admin_set_variant_stock · valor absoluto", { skip }, () => {
  test("4 → 12, 12 → 0 y 0 → 7: se ESCRIBE el número, no se suma", async () => {
    await reset(vA, 4);
    for (const target of [12, 0, 7]) {
      const response = await setStock(adminA.token, "ES", [
        setItem(vA, target, await witnessOf(vA)),
      ]);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(await stockOf(vA), target, `debería quedar en ${target}`);
    }
  });

  test("el mismo valor no se escribe: no mueve el testigo ni deja auditoría", async () => {
    await reset(vA, 7);
    const witness = await witnessOf(vA);
    const before = await db(
      `admin_change_log?variant_id=eq.${vA}&select=id`,
    );

    const response = await setStock(adminA.token, "ES", [setItem(vA, 7, witness)]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { applied: number }).applied, 0);
    assert.equal((response.body as { unchanged: number }).unchanged, 1);
    assert.equal(await witnessOf(vA), witness, "escribir lo mismo caducaría los testigos ajenos");

    const after = await db(`admin_change_log?variant_id=eq.${vA}&select=id`);
    assert.equal(
      (after.body as unknown[]).length,
      (before.body as unknown[]).length,
      "20 → 20 no es una decisión y no se audita",
    );
  });

  test("un valor negativo o con decimales no llega a la tabla", async () => {
    await reset(vA, 5);
    for (const bad of [-1, 4.5, "8"] as unknown[]) {
      const witness = await witnessOf(vA);
      const response = await setStock(adminA.token, "ES", [
        { variant_id: vA, mode: "set", stock: bad, expected_updated_at: witness },
      ]);
      if (bad === "8") {
        // Una cadena de dígitos sí es aceptable: PostgREST manda JSON y el
        // formulario podría enviarlo así.
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert.equal(await stockOf(vA), 8);
        await reset(vA, 5);
      } else {
        assert.notEqual(response.status, 200, `${bad} no debería escribirse`);
        assert.equal(await stockOf(vA), 5);
      }
    }
  });

  test("por encima del tope se rechaza", async () => {
    await reset(vA, 5);
    const response = await setStock(adminA.token, "ES", [
      setItem(vA, 100001, await witnessOf(vA)),
    ]);
    assert.match(JSON.stringify(response.body), /STOCK_OUT_OF_RANGE/);
    assert.equal(await stockOf(vA), 5);
  });

  test("un `set` SIN testigo es un error, no una escritura libre", async () => {
    await reset(vA, 5);
    const response = await setStock(adminA.token, "ES", [
      { variant_id: vA, mode: "set", stock: 99 },
    ]);
    assert.match(JSON.stringify(response.body), /EXPECTED_UPDATED_AT_REQUIRED/);
    assert.equal(await stockOf(vA), 5);
  });
});

describe("admin_set_variant_stock · agotar", { skip }, () => {
  test("7 → 0", async () => {
    await reset(vA, 7);
    const response = await setStock(adminA.token, "ES", [
      { variant_id: vA, mode: "exhaust" },
    ]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(await stockOf(vA), 0);
  });

  test("0 → 0: repetir Agotar no es un error", async () => {
    await reset(vA, 0);
    const response = await setStock(adminA.token, "ES", [
      { variant_id: vA, mode: "exhaust" },
    ]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { applied: number }).applied, 0);
    assert.equal((response.body as { unchanged: number }).unchanged, 1);
    assert.equal(await stockOf(vA), 0);
  });

  test("solo toca SU variante", async () => {
    await reset(vA, 5);
    await reset(vB, 9);
    await reset(vC, 3);
    await setStock(adminA.token, "ES", [{ variant_id: vB, mode: "exhaust" }]);
    assert.equal(await stockOf(vA), 5);
    assert.equal(await stockOf(vB), 0);
    assert.equal(await stockOf(vC), 3);
  });

  test("no despublica ni desactiva: agotado NO es retirado", async () => {
    await reset(vA, 4);
    await db(`products?id=eq.${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    await setStock(adminA.token, "ES", [{ variant_id: vA, mode: "exhaust" }]);

    const product = await db(`products?id=eq.${productId}&select=status,deleted_at`);
    assert.equal((product.body as { status: string }[])[0].status, "active");
    assert.equal((product.body as { deleted_at: string | null }[])[0].deleted_at, null);

    const variant = await db(`product_variants?id=eq.${vA}&select=is_active`);
    assert.equal((variant.body as { is_active: boolean }[])[0].is_active, true);
  });

  test("`exhaust` no acepta un valor: no es «escribir sin testigo»", async () => {
    await reset(vA, 5);
    const response = await setStock(adminA.token, "ES", [
      { variant_id: vA, mode: "exhaust", stock: 99 },
    ]);
    assert.notEqual(response.status, 200);
    assert.equal(await stockOf(vA), 5);
  });
});

describe("admin_set_variant_stock · concurrencia", { skip }, () => {
  test("dos administradores con el MISMO testigo: uno gana, el otro se entera", async () => {
    await reset(vA, 10);
    const witness = await witnessOf(vA);

    const [a, b] = await Promise.all([
      setStock(adminA.token, "ES", [setItem(vA, 5, witness)]),
      setStock(adminB.token, "ES", [setItem(vA, 7, witness)]),
    ]);

    const oks = [a, b].filter((r) => r.status === 200);
    const conflicts = [a, b].filter((r) => JSON.stringify(r.body).includes("STOCK_CHANGED"));
    assert.equal(oks.length, 1, `esperaba un ganador: ${JSON.stringify([a.body, b.body])}`);
    assert.equal(conflicts.length, 1, "el perdedor tiene que recibir STOCK_CHANGED");

    const final = await stockOf(vA);
    assert.ok(final === 5 || final === 7, `quedó ${final}`);
  });

  test("un testigo viejo NO pisa el valor nuevo", async () => {
    await reset(vA, 10);
    const stale = await witnessOf(vA);

    // Alguien escribe en medio.
    const fresh = await setStock(adminB.token, "ES", [setItem(vA, 2, stale)]);
    assert.equal(fresh.status, 200);
    assert.equal(await stockOf(vA), 2);

    // El primero llega tarde con lo que él creía.
    const late = await setStock(adminA.token, "ES", [setItem(vA, 12, stale)]);
    assert.match(JSON.stringify(late.body), /STOCK_CHANGED/);
    assert.equal(await stockOf(vA), 2, "el dato nuevo sigue ahí");
  });

  test("una VENTA también caduca el testigo del administrador", async () => {
    await reset(vA, 10);
    await db(`products?id=eq.${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const witness = await witnessOf(vA);

    const method = await db("shipping_methods?market_id=eq.ES&select=id&limit=1");
    const shippingMethodId = (method.body as { id: string }[])[0].id;

    const order = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_market_id: "ES",
        p_items: [{ variant_id: vA, quantity: 2 }],
        p_customer_phone: "34600999888",
        p_customer_name: "ZZ Stock",
        p_client_request_id: crypto.randomUUID(),
        p_shipping_method_id: shippingMethodId,
      }),
    });
    assert.equal(order.status, 200, await order.text());
    assert.equal(await stockOf(vA), 8, "la venta descuenta");

    // El administrador guarda lo que tenía escrito ANTES de la venta.
    const late = await setStock(adminA.token, "ES", [setItem(vA, 12, witness)]);
    assert.match(
      JSON.stringify(late.body),
      /STOCK_CHANGED/,
      "escribir 12 aquí habría borrado la venta en silencio",
    );
    assert.equal(await stockOf(vA), 8);

    // Limpieza del pedido que acaba de crearse.
    const orders = await db(
      `orders?select=id,customer_id&customer_id=not.is.null&order=created_at.desc&limit=5`,
    );
    for (const row of (orders.body as { id: string }[]) ?? []) {
      await db(`order_items?order_id=eq.${row.id}`, { method: "DELETE" });
      await db(`order_events?order_id=eq.${row.id}`, { method: "DELETE" });
      await db(`orders?id=eq.${row.id}`, { method: "DELETE" });
    }
    await db(`customers?phone=eq.34600999888`, { method: "DELETE" });
  });
});

describe("admin_set_variant_stock · el lote es todo o nada", { skip }, () => {
  test("tres válidas: se aplican las tres", async () => {
    await reset(vA, 1);
    await reset(vB, 1);
    await reset(vC, 1);
    const response = await setStock(adminA.token, "ES", [
      setItem(vA, 4, await witnessOf(vA)),
      setItem(vB, 0, await witnessOf(vB)),
      setItem(vC, 7, await witnessOf(vC)),
    ]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(
      [await stockOf(vA), await stockOf(vB), await stockOf(vC)],
      [4, 0, 7],
    );
  });

  test("una en conflicto: NO se aplica NINGUNA", async () => {
    await reset(vA, 1);
    await reset(vB, 1);
    await reset(vC, 1);
    const staleB = await witnessOf(vB);
    // B cambia por debajo mientras el administrador escribe.
    await reset(vB, 2);

    const response = await setStock(adminA.token, "ES", [
      setItem(vA, 4, await witnessOf(vA)),
      setItem(vB, 5, staleB),
      setItem(vC, 7, await witnessOf(vC)),
    ]);

    assert.match(JSON.stringify(response.body), /STOCK_CHANGED/);
    assert.deepEqual(
      [await stockOf(vA), await stockOf(vB), await stockOf(vC)],
      [1, 2, 1],
      "A y C no pueden haberse guardado: el lote es atómico",
    );
  });

  test("una variante que no existe tumba el lote entero", async () => {
    await reset(vA, 3);
    const response = await setStock(adminA.token, "ES", [
      setItem(vA, 9, await witnessOf(vA)),
      setItem("00000000-0000-4000-8000-000000000000", 9, await witnessOf(vA)),
    ]);
    assert.match(JSON.stringify(response.body), /VARIANT_NOT_IN_MARKET/);
    assert.equal(await stockOf(vA), 3);
  });

  test("un lote vacío o gigante se rechaza", async () => {
    const empty = await setStock(adminA.token, "ES", []);
    assert.match(JSON.stringify(empty.body), /INVALID_BATCH_SIZE/);

    const witness = await witnessOf(vA);
    const huge = Array.from({ length: 101 }, () => setItem(vA, 1, witness));
    const response = await setStock(adminA.token, "ES", huge);
    assert.match(JSON.stringify(response.body), /INVALID_BATCH_SIZE/);
  });
});

describe("admin_set_variant_stock · mercado", { skip }, () => {
  test("una variante de CO enviada como ES: rechazada", async () => {
    const response = await setStock(adminA.token, "ES", [
      setItem(coVariantId, 99, await witnessOf(coVariantId)),
    ]);
    assert.match(JSON.stringify(response.body), /VARIANT_NOT_IN_MARKET/);
    assert.equal(await stockOf(coVariantId), 10);
  });

  test("decir `p_market_id: CO` tampoco abre la puerta: RLS exige mercado ACTIVO", async () => {
    const response = await setStock(adminA.token, "CO", [
      setItem(coVariantId, 99, await witnessOf(coVariantId)),
    ]);
    assert.notEqual(response.status, 200);
    assert.equal(await stockOf(coVariantId), 10, "CO está inactivo: nadie escribe ahí");
  });
});

describe("admin_set_variant_stock · auditoría", { skip }, () => {
  test("queda registrado como `correccion`, con actor, variante y los dos valores", async () => {
    await reset(vC, 3);
    await db(`admin_change_log?variant_id=eq.${vC}`, { method: "DELETE" });

    const response = await setStock(adminA.token, "ES", [
      setItem(vC, 11, await witnessOf(vC)),
    ]);
    assert.equal(response.status, 200, JSON.stringify(response.body));

    const log = await db(
      `admin_change_log?variant_id=eq.${vC}&select=field_name,old_value,new_value,source,actor_id`,
    );
    const rows = log.body as {
      field_name: string;
      old_value: string;
      new_value: string;
      source: string;
      actor_id: string;
    }[];
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].field_name, "stock");
    assert.equal(rows[0].old_value, "3");
    assert.equal(rows[0].new_value, "11");
    assert.equal(rows[0].source, "correccion");
    assert.equal(rows[0].actor_id, adminA.id);
  });

  test("agotar también deja rastro, y con el mismo origen", async () => {
    await reset(vC, 6);
    await db(`admin_change_log?variant_id=eq.${vC}`, { method: "DELETE" });

    await setStock(adminA.token, "ES", [{ variant_id: vC, mode: "exhaust" }]);

    const log = await db(
      `admin_change_log?variant_id=eq.${vC}&select=old_value,new_value,source`,
    );
    const rows = log.body as { old_value: string; new_value: string; source: string }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].old_value, "6");
    assert.equal(rows[0].new_value, "0");
    assert.equal(rows[0].source, "correccion");
  });
});
