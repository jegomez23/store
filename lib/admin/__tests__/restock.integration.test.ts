import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Integración de la reposición de stock (Fase 9.5, Incremento 4) contra el
 * Supabase REAL.
 *
 * Lo que estos tests protegen, por orden de importancia:
 *   1. **CONCURRENCIA.** Diez reposiciones simultáneas suman las diez. Es la
 *      razón de existir de la migración 0026: el `UPDATE` absoluto anterior
 *      perdía unidades en silencio, y está demostrado abajo.
 *   2. **ATOMICIDAD.** Un elemento inválido en el lote deja CERO cambios.
 *   3. **AISLAMIENTO DE MERCADO.** Una variante de CO en el lote hace fallar la
 *      operación completa, no se ignora.
 *   4. **AUTORIZACIÓN.** Anónimo y autenticado-sin-rol rechazados.
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

async function restock(token: string, marketId: string, items: unknown) {
  const response = await fetch(`${env!.url}/rest/v1/rpc/admin_restock_variants`, {
    method: "POST",
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${token}`,
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
  const email = `stk-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Sk-${Math.random().toString(36).slice(2)}-D5`;

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
  assert.ok(user.id, `no se pudo crear el usuario`);

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

const PFX = "zz-f95-stk";

let adminUser: TestUser;
let plainUser: TestUser;
let esVariant = "";
let esVariant2 = "";
let coVariant = "";

async function stockOf(variantId: string): Promise<number> {
  const { body } = await db(`product_variants?id=eq.${variantId}&select=stock`);
  return (body as { stock: number }[])[0].stock;
}

async function setStock(variantId: string, stock: number): Promise<void> {
  await db(`product_variants?id=eq.${variantId}`, {
    method: "PATCH",
    body: JSON.stringify({ stock }),
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

  async function makeCategory(market: string, suffix: string) {
    const cat = await db("categories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: market,
        name: `ZZ Stock ${market}`,
        slug: `${PFX}-cat-${suffix}`,
        sort_order: 980,
        is_active: false,
      }),
    });
    return (cat.body as { id: string }[])[0].id;
  }

  async function makeProduct(market: string, categoryId: string, suffix: string) {
    const prod = await db("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: market,
        category_id: categoryId,
        name: `ZZ Stock ${suffix}`,
        slug: `${PFX}-${suffix}`,
        status: "draft",
      }),
    });
    return (prod.body as { id: string }[])[0].id;
  }

  async function makeVariant(productId: string, sku: string, stock: number) {
    const v = await db("product_variants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_id: productId,
        sku,
        price: 10,
        stock,
        low_stock_threshold: 3,
        is_active: true,
      }),
    });
    return (v.body as { id: string }[])[0].id;
  }

  const esCat = await makeCategory("ES", "es");
  const esProd = await makeProduct("ES", esCat, "es");
  esVariant = await makeVariant(esProd, `${PFX.toUpperCase()}-ES-1`, 12);
  esVariant2 = await makeVariant(esProd, `${PFX.toUpperCase()}-ES-2`, 5);

  // Mercado CO: existe en el seed pero está INACTIVO. Sirve para comprobar el
  // aislamiento sin depender de que CO esté apagado.
  const coCat = await makeCategory("CO", "co");
  const coProd = await makeProduct("CO", coCat, "co");
  coVariant = await makeVariant(coProd, `${PFX.toUpperCase()}-CO-1`, 50);
});

after(async () => {
  if (!env) return;
  await cleanup();
  if (adminUser) await deleteUser(adminUser.id);
  if (plainUser) await deleteUser(plainUser.id);
});

describe("autorización", { skip }, () => {
  test("un ANÓNIMO no puede reponer", async () => {
    const response = await fetch(`${env!.url}/rest/v1/rpc/admin_restock_variants`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_market_id: "ES",
        p_items: [{ variant_id: esVariant, delta: 5 }],
      }),
    });
    assert.ok(response.status >= 400, `status=${response.status}`);
    assert.equal(await stockOf(esVariant), 12, "el stock no debe haber cambiado");
  });

  test("un autenticado SIN rol de admin es rechazado", async () => {
    const { status, body } = await restock(plainUser.token, "ES", [
      { variant_id: esVariant, delta: 5 },
    ]);
    assert.ok(status >= 400, `status=${status}`);
    assert.match(JSON.stringify(body), /FORBIDDEN/);
    assert.equal(await stockOf(esVariant), 12);
  });

  test("un ADMIN sí puede (control positivo)", async () => {
    const { status, body } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: 3 },
    ]);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(await stockOf(esVariant), 15);
    await setStock(esVariant, 12);
  });
});

describe("CONCURRENCIA: el delta acumula, el absoluto perdía", { skip }, () => {
  test("dos reposiciones simultáneas suman las DOS", async () => {
    await setStock(esVariant, 12);
    await Promise.all([
      restock(adminUser.token, "ES", [{ variant_id: esVariant, delta: 10 }]),
      restock(adminUser.token, "ES", [{ variant_id: esVariant, delta: 7 }]),
    ]);
    // El UPDATE absoluto anterior daba 19 o 22 según quién escribiera último.
    assert.equal(await stockOf(esVariant), 29, "12 + 10 + 7");
    await setStock(esVariant, 12);
  });

  test("DIEZ simultáneas suman las diez", async () => {
    await setStock(esVariant, 0);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        restock(adminUser.token, "ES", [{ variant_id: esVariant, delta: 4 }]),
      ),
    );
    assert.equal(await stockOf(esVariant), 40, "10 × 4, ninguna perdida");
    await setStock(esVariant, 12);
  });

  test("DEMOSTRACIÓN del bug que se corrige: el absoluto pierde unidades", async () => {
    // Reproduce lo que hacía `updateVariantAction`: leer, sumar en JavaScript,
    // escribir un valor absoluto. Se ejecuta con service role a propósito —
    // no es el flujo bajo prueba, es la prueba de que el flujo viejo fallaba.
    await setStock(esVariant, 12);
    const leido = await stockOf(esVariant);
    await Promise.all([setStock(esVariant, leido + 10), setStock(esVariant, leido + 7)]);
    const resultado = await stockOf(esVariant);
    assert.notEqual(resultado, 29, "si esto llega a 29, el bug ya no existe y sobra el test");
    assert.ok([19, 22].includes(resultado), `una reposición se perdió: ${resultado}`);
    await setStock(esVariant, 12);
  });

  test("restar concurrentemente también acumula", async () => {
    await setStock(esVariant, 100);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        restock(adminUser.token, "ES", [{ variant_id: esVariant, delta: -6 }]),
      ),
    );
    assert.equal(await stockOf(esVariant), 70, "100 − 5×6");
    await setStock(esVariant, 12);
  });
});

describe("ATOMICIDAD: todo o nada", { skip }, () => {
  test("un delta inválido deja CERO cambios en todo el lote", async () => {
    await setStock(esVariant, 12);
    await setStock(esVariant2, 5);
    const { status } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: 10 },
      { variant_id: esVariant2, delta: "dos" },
    ]);
    assert.ok(status >= 400, `status=${status}`);
    assert.equal(await stockOf(esVariant), 12, "la primera variante NO debe haberse tocado");
    assert.equal(await stockOf(esVariant2), 5);
  });

  test("un delta decimal se rechaza en vez de redondearse", async () => {
    await setStock(esVariant, 12);
    const { status } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: "5.5" },
    ]);
    assert.ok(status >= 400, `status=${status}`);
    assert.equal(await stockOf(esVariant), 12);
  });

  test("un lote que dejaría stock NEGATIVO no aplica nada", async () => {
    await setStock(esVariant, 12);
    await setStock(esVariant2, 5);
    const { status, body } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: 10 },
      { variant_id: esVariant2, delta: -999 },
    ]);
    assert.ok(status >= 400, `status=${status}`);
    assert.match(JSON.stringify(body), /NEGATIVE_STOCK|check/i);
    assert.equal(await stockOf(esVariant), 12, "la primera no debe haberse aplicado");
    assert.equal(await stockOf(esVariant2), 5);
  });

  test("un lote vacío se rechaza", async () => {
    const { status } = await restock(adminUser.token, "ES", []);
    assert.ok(status >= 400, `status=${status}`);
  });

  test("un lote de más de 100 se rechaza", async () => {
    const many = Array.from({ length: 101 }, () => ({ variant_id: esVariant, delta: 1 }));
    const { status } = await restock(adminUser.token, "ES", many);
    assert.ok(status >= 400, `status=${status}`);
    assert.equal(await stockOf(esVariant), 12);
  });

  test("un payload que no es un array se rechaza", async () => {
    const { status } = await restock(adminUser.token, "ES", { variant_id: esVariant, delta: 1 });
    assert.ok(status >= 400, `status=${status}`);
  });
});

describe("AISLAMIENTO DE MERCADO", { skip }, () => {
  test("una variante de CO en un lote de ES tumba el lote entero", async () => {
    await setStock(esVariant, 12);
    const coBefore = await stockOf(coVariant);

    const { status, body } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: 10 },
      { variant_id: coVariant, delta: 10 },
    ]);

    assert.ok(status >= 400, `status=${status}`);
    assert.match(JSON.stringify(body), /VARIANT_NOT_IN_MARKET/);
    assert.equal(await stockOf(coVariant), coBefore, "CO NO puede cambiar desde ES");
    assert.equal(
      await stockOf(esVariant),
      12,
      "y la variante legítima tampoco: el lote es atómico",
    );
  });

  test("declarar el mercado CO no basta: RLS lo impide igual", async () => {
    // `p_market_id` lo pone el servidor, pero si alguien lograra forzarlo,
    // la policy de la 0020 exige mercado ACTIVO y CO no lo está.
    const coBefore = await stockOf(coVariant);
    const { status } = await restock(adminUser.token, "CO", [
      { variant_id: coVariant, delta: 10 },
    ]);
    assert.ok(status >= 400, `escribir en CO debería fallar (status=${status})`);
    assert.equal(await stockOf(coVariant), coBefore);
  });

  test("una variante inexistente tumba el lote", async () => {
    await setStock(esVariant, 12);
    const { status } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: 5 },
      { variant_id: "00000000-0000-4000-8000-000000000000", delta: 5 },
    ]);
    assert.ok(status >= 400, `status=${status}`);
    assert.equal(await stockOf(esVariant), 12);
  });
});

describe("resultado devuelto", { skip }, () => {
  test("informa de cuántas se aplicaron y de los slugs a invalidar", async () => {
    await setStock(esVariant, 12);
    await setStock(esVariant2, 5);
    const { body } = await restock(adminUser.token, "ES", [
      { variant_id: esVariant, delta: 1 },
      { variant_id: esVariant2, delta: 1 },
    ]);
    const result = body as { applied: number; slugs: string[] };
    assert.equal(result.applied, 2);
    // Las dos variantes son del mismo producto: un solo slug, sin repetir.
    assert.deepEqual(result.slugs, [`${PFX}-es`]);
    await setStock(esVariant, 12);
    await setStock(esVariant2, 5);
  });
});
