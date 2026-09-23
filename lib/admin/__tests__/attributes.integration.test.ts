import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Colores y tallas contra el Supabase REAL (Fase 9.5, incremento 6).
 *
 * Lo que protegen, por orden de importancia:
 *
 *   1. **LA UNICIDAD LA IMPONE POSTGRESQL**, no el formulario. Dos altas
 *      simultáneas del mismo slug dejan UNA fila, no dos.
 *   2. **NO SE BORRA LO QUE ESTÁ EN USO.** La FK devuelve 23503 y la variante
 *      sobrevive intacta.
 *   3. **RETIRAR ES SEGURO Y NO ES UN BORRADO.** La variante existente
 *      conserva su color; lo que desaparece es la opción para crear nuevas, y
 *      eso lo impone la RPC desde la 0034, no la interfaz.
 *   4. **RENOMBRAR NO TOCA EL HISTORIAL.** `order_items` guarda un snapshot.
 *   5. **anon y autenticado-sin-admin no escriben.**
 *
 * Todos los fixtures llevan prefijo y se borran en `after`; la BD vuelve a su
 * baseline exacto.
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

/**
 * Un método de entrega ACTIVO del mercado, resuelto en tiempo real.
 *
 * `create_order` exige método desde el incremento 8. No se fija ningún uuid
 * aquí: se lee el que haya, para que estos tests no dependan de qué métodos
 * tenga sembrados la tienda.
 */
let cachedShippingMethodId: string | null = null;
async function anyShippingMethodId(): Promise<string> {
  if (cachedShippingMethodId) return cachedShippingMethodId;
  const response = await fetch(
    `${env!.url}/rest/v1/shipping_methods?select=id&market_id=eq.ES&is_active=eq.true&order=sort_order&limit=1`,
    { headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` } },
  );
  const rows = (await response.json()) as { id: string }[];
  if (!rows[0]) throw new Error("no hay ningún método de envío activo en ES");
  cachedShippingMethodId = rows[0].id;
  return cachedShippingMethodId;
}

/** Service role: SOLO para montar y limpiar fixtures y para leer resultados. */
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

/** Anon key + token: el camino REAL del panel. */
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
  const email = `attr-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `At-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Attr" }),
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

/** Prefijo de TODO lo que crea este archivo. Colores por slug, tallas por label. */
const PFX = "zz-attr";
const SIZE_PFX = "ZZT";

let adminA: TestUser;
let adminB: TestUser;
let plainUser: TestUser;
let categoryId = "";

/** Slug/label únicos por test: dos tests no pueden pisarse entre sí. */
const uniq = () => Math.random().toString(36).slice(2, 8);
const colorSlug = () => `${PFX}-${uniq()}`;
const sizeLabel = () => `${SIZE_PFX}${uniq()}`.slice(0, 20);

async function makeColor(over: Record<string, unknown> = {}) {
  const { body } = await db("colors", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: "ZZ Color",
      slug: colorSlug(),
      hex_code: "#123456",
      sort_order: 900,
      ...over,
    }),
  });
  return (body as { id: string; slug: string }[])[0];
}

async function makeSize(over: Record<string, unknown> = {}) {
  const { body } = await db("sizes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      label: sizeLabel(),
      size_group: "apparel",
      sort_order: 900,
      ...over,
    }),
  });
  return (body as { id: string; label: string }[])[0];
}

/** Producto publicado con una variante que usa el color y la talla dados. */
async function makeProductUsing(colorId: string | null, sizeId: string | null) {
  const { body: p } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: categoryId,
      name: "ZZ ATTR producto",
      slug: `${PFX}-${uniq()}`,
      status: "draft",
    }),
  });
  const productId = (p as { id: string }[])[0].id;

  const { body: v } = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: productId,
      color_id: colorId,
      size_id: sizeId,
      sku: `${PFX}-${uniq()}`.toUpperCase(),
      price: 30,
      stock: 5,
      is_active: true,
    }),
  });
  const variantId = (v as { id: string }[])[0].id;

  await db(`products?id=eq.${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });

  return { productId, variantId };
}

async function cleanup() {
  if (!env) return;
  const { body: products } = await db(`products?slug=like.${PFX}*&select=id`);
  for (const p of (products ?? []) as { id: string }[]) {
    const { body: variants } = await db(`product_variants?product_id=eq.${p.id}&select=id`);
    for (const v of (variants ?? []) as { id: string }[]) {
      const { body: items } = await db(`order_items?variant_id=eq.${v.id}&select=order_id`);
      for (const item of (items ?? []) as { order_id: string }[]) {
        await db(`order_events?order_id=eq.${item.order_id}`, { method: "DELETE" });
        await db(`order_items?order_id=eq.${item.order_id}`, { method: "DELETE" });
        await db(`orders?id=eq.${item.order_id}`, { method: "DELETE" });
      }
    }
    await db(`admin_change_log?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`products?id=eq.${p.id}`, { method: "DELETE" });
  }
  await db(`customers?name=like.ZZ ATTR*`, { method: "DELETE" });
  await db(`categories?slug=like.${PFX}*`, { method: "DELETE" });
  // Los atributos van AL FINAL: las variantes que los referencian ya no existen.
  await db(`colors?slug=like.${PFX}*`, { method: "DELETE" });
  await db(`sizes?label=like.${SIZE_PFX}*`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();
  adminA = await createUser(true);
  adminB = await createUser(true);
  plainUser = await createUser(false);

  const { body } = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ attr",
      slug: `${PFX}-cat`,
      sort_order: 992,
    }),
  });
  categoryId = (body as { id: string }[])[0].id;
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [adminA, adminB, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

// ─────────────────────────────────── el esquema es el que creemos que es

describe("colors/sizes · premisas del esquema", { skip }, () => {
  test("NO tienen market_id: son globales", async () => {
    // Si algún día alguien añade mercado a estos catálogos, este test falla y
    // obliga a revisar `atributos/actions.ts`, que hoy NO resuelve mercado a
    // propósito. Es la premisa entera de la feature.
    const spec = (await (
      await fetch(`${env!.url}/rest/v1/`, {
        headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
      })
    ).json()) as { definitions: Record<string, { properties: Record<string, unknown> }> };

    assert.equal(
      Object.keys(spec.definitions.colors.properties).includes("market_id"),
      false,
      "colors ha dejado de ser global",
    );
    assert.equal(
      Object.keys(spec.definitions.sizes.properties).includes("market_id"),
      false,
      "sizes ha dejado de ser global",
    );
  });

  test("`sizes` NO tiene slug: su identidad es (label, size_group)", async () => {
    const spec = (await (
      await fetch(`${env!.url}/rest/v1/`, {
        headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
      })
    ).json()) as { definitions: Record<string, { properties: Record<string, unknown> }> };
    assert.equal(Object.keys(spec.definitions.sizes.properties).includes("slug"), false);
  });
});

// ─────────────────────────────────── quién puede escribir

describe("colors/sizes · autorización", { skip }, () => {
  test("ANON no escribe ni colores ni tallas", async () => {
    const color = await as(null, "colors", {
      method: "POST",
      body: JSON.stringify({ name: "ZZ anon", slug: colorSlug(), hex_code: "#123456" }),
    });
    assert.equal(color.body.code, "42501", JSON.stringify(color.body));

    const size = await as(null, "sizes", {
      method: "POST",
      body: JSON.stringify({ label: sizeLabel(), size_group: "apparel" }),
    });
    assert.equal(size.body.code, "42501", JSON.stringify(size.body));
  });

  test("un AUTENTICADO SIN rol de admin tampoco", async () => {
    const color = await as(plainUser.token, "colors", {
      method: "POST",
      body: JSON.stringify({ name: "ZZ user", slug: colorSlug(), hex_code: "#123456" }),
    });
    assert.equal(color.body.code, "42501");

    const size = await as(plainUser.token, "sizes", {
      method: "POST",
      body: JSON.stringify({ label: sizeLabel(), size_group: "apparel" }),
    });
    assert.equal(size.body.code, "42501");
  });

  test("un no-admin tampoco puede EDITAR ni BORRAR lo existente", async () => {
    const color = await makeColor();
    const patch = await as(plainUser.token, `colors?id=eq.${color.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "secuestrado" }),
    });
    assert.ok(patch.status >= 400 || (patch.body ?? []).length === 0, JSON.stringify(patch));

    await as(plainUser.token, `colors?id=eq.${color.id}`, { method: "DELETE" });
    const { body } = await db(`colors?id=eq.${color.id}&select=name`);
    assert.equal((body as { name: string }[])[0]?.name, "ZZ Color", "el color debe seguir intacto");
  });

  test("CONTROL POSITIVO: el admin sí crea color y talla", async () => {
    const slug = colorSlug();
    const color = await as(adminA.token, "colors", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: "ZZ Admin", slug, hex_code: "#0044AA", sort_order: 900 }),
    });
    assert.equal(color.status, 201, JSON.stringify(color.body));

    const label = sizeLabel();
    const size = await as(adminA.token, "sizes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ label, size_group: "footwear", sort_order: 900 }),
    });
    assert.equal(size.status, 201, JSON.stringify(size.body));
  });

  test("el admin EDITA color y talla", async () => {
    const color = await makeColor();
    const size = await makeSize();

    const c = await as(adminA.token, `colors?id=eq.${color.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: "ZZ Renombrado", hex_code: "#ABCDEF", sort_order: 901 }),
    });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal((c.body as { name: string }[])[0].name, "ZZ Renombrado");

    const s = await as(adminA.token, `sizes?id=eq.${size.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ size_group: "accessory" }),
    });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal((s.body as { size_group: string }[])[0].size_group, "accessory");
  });
});

// ─────────────────────────────────── lo que impone PostgreSQL

describe("colors/sizes · constraints de la base de datos", { skip }, () => {
  test("el slug de color es único", async () => {
    const color = await makeColor();
    const dup = await as(adminA.token, "colors", {
      method: "POST",
      body: JSON.stringify({ name: "Otro", slug: color.slug, hex_code: "#111111" }),
    });
    assert.equal(dup.body.code, "23505", JSON.stringify(dup.body));
  });

  test("el NOMBRE de color NO es único, y por eso la acción deriva el slug", async () => {
    // Documenta una realidad del esquema: dos colores homónimos son legales.
    // La defensa está en derivar el slug del nombre, no en un constraint.
    const first = await makeColor({ name: "ZZ Homónimo" });
    const second = await as(adminA.token, "colors", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: "ZZ Homónimo", slug: colorSlug(), hex_code: "#222222" }),
    });
    assert.equal(second.status, 201, "el esquema lo permite: no se inventa un constraint");
    assert.ok(first.id);
  });

  test("(label, size_group) es único, pero la misma etiqueta en OTRO grupo se permite", async () => {
    const size = await makeSize({ size_group: "apparel" });

    const dup = await as(adminA.token, "sizes", {
      method: "POST",
      body: JSON.stringify({ label: size.label, size_group: "apparel" }),
    });
    assert.equal(dup.body.code, "23505", JSON.stringify(dup.body));

    const other = await as(adminA.token, "sizes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ label: size.label, size_group: "footwear", sort_order: 901 }),
    });
    assert.equal(other.status, 201, JSON.stringify(other.body));
  });

  test("un grupo de talla inventado lo rechaza el CHECK", async () => {
    const bad = await as(adminA.token, "sizes", {
      method: "POST",
      body: JSON.stringify({ label: sizeLabel(), size_group: "kids" }),
    });
    assert.equal(bad.body.code, "23514", JSON.stringify(bad.body));
  });

  test("`hex_code` ya no admite basura (migración 0034)", async () => {
    // ANTES de la 0034 esto devolvía 201 y se guardaba como 'rojo   ':
    // `character(7)` rellena con espacios en vez de rechazar.
    const bad = await as(adminA.token, "colors", {
      method: "POST",
      body: JSON.stringify({ name: "ZZ malo", slug: colorSlug(), hex_code: "rojo" }),
    });
    assert.equal(bad.body.code, "23514", JSON.stringify(bad.body));

    const noHash = await as(adminA.token, "colors", {
      method: "POST",
      body: JSON.stringify({ name: "ZZ malo", slug: colorSlug(), hex_code: "3A4A3E" }),
    });
    assert.equal(noHash.body.code, "23514");

    // CONTROL POSITIVO: mayúsculas y minúsculas siguen siendo válidas.
    for (const hex of ["#3a4a3e", "#3A4A3E"]) {
      const ok = await as(adminA.token, "colors", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name: "ZZ ok", slug: colorSlug(), hex_code: hex }),
      });
      assert.equal(ok.status, 201, `${hex}: ${JSON.stringify(ok.body)}`);
    }
  });

  test("las 4 filas del seed cumplen el CHECK nuevo", async () => {
    // Si no lo cumplieran, la migración 0034 no habría podido aplicarse; se
    // comprueba explícitamente porque es la premisa de que entrara sin datos.
    const { body } = await db("colors?select=hex_code&slug=in.(negro,blanco,piedra,verde-bosque)");
    const rows = body as { hex_code: string }[];
    assert.equal(rows.length, 4);
    for (const row of rows) assert.match(row.hex_code, /^#[0-9A-Fa-f]{6}$/);
  });
});

// ─────────────────────────────────── el valor en uso no se borra

describe("colors/sizes · retirada segura", { skip }, () => {
  test("BORRAR un color en uso lo rechaza la FK y la variante sobrevive", async () => {
    const color = await makeColor();
    const { variantId } = await makeProductUsing(color.id, null);

    const del = await as(adminA.token, `colors?id=eq.${color.id}`, { method: "DELETE" });
    assert.equal(del.body.code, "23503", JSON.stringify(del.body));

    const { body: variant } = await db(`product_variants?id=eq.${variantId}&select=id,color_id`);
    assert.equal((variant as { color_id: string }[])[0].color_id, color.id, "intacta");
  });

  test("BORRAR una talla en uso, igual", async () => {
    const size = await makeSize();
    const { variantId } = await makeProductUsing(null, size.id);

    const del = await as(adminA.token, `sizes?id=eq.${size.id}`, { method: "DELETE" });
    assert.equal(del.body.code, "23503", JSON.stringify(del.body));

    const { body: variant } = await db(`product_variants?id=eq.${variantId}&select=size_id`);
    assert.equal((variant as { size_id: string }[])[0].size_id, size.id);
  });

  test("borrar un color SIN usar sí funciona", async () => {
    const color = await makeColor();
    const del = await as(adminA.token, `colors?id=eq.${color.id}`, { method: "DELETE" });
    assert.ok(del.status < 300, JSON.stringify(del.body));

    const { body } = await db(`colors?id=eq.${color.id}&select=id`);
    assert.deepEqual(body, []);
  });

  test("DESACTIVAR no borra: la variante conserva su color y su talla", async () => {
    const color = await makeColor();
    const size = await makeSize();
    const { variantId } = await makeProductUsing(color.id, size.id);

    await as(adminA.token, `colors?id=eq.${color.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    await as(adminA.token, `sizes?id=eq.${size.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const { body } = await db(
      `product_variants?id=eq.${variantId}&select=color:colors(name,is_active),size:sizes(label,is_active)`,
    );
    const row = (body as { color: { name: string; is_active: boolean }; size: { label: string } }[])[0];
    assert.equal(row.color.name, "ZZ Color", "la variante sigue mostrando su color");
    assert.equal(row.color.is_active, false);
    assert.equal(row.size.label, size.label);
  });

  test("el ADMIN ve los inactivos; ANON no", async () => {
    const color = await makeColor({ is_active: false });

    const forAdmin = await as(adminA.token, `colors?id=eq.${color.id}&select=id`);
    assert.equal((forAdmin.body as unknown[]).length, 1, "el admin debe poder reactivarlo");

    const forAnon = await as(null, `colors?id=eq.${color.id}&select=id`);
    assert.deepEqual(forAnon.body, [], "la tienda no ve un color retirado");
  });
});

// ─────────────────────────────────── el retirado no crea variantes nuevas

describe("colors/sizes · un valor retirado no entra en variantes nuevas (0034)", { skip }, () => {
  test("la RPC rechaza un color INACTIVO", async () => {
    // ANTES de la 0034 esto devolvía {"created":1}: la única defensa era el
    // `.eq("is_active", true)` de `listColors()`, es decir la aplicación.
    const color = await makeColor({ is_active: false });
    const { productId } = await makeProductUsing(null, null);

    const result = await rpc(adminA.token, "admin_create_variant_matrix", {
      p_product_id: productId,
      p_variants: [
        {
          color_id: color.id,
          size_id: null,
          sku: `${PFX}-${uniq()}`.toUpperCase(),
          price: "10.00",
          stock: "1",
        },
      ],
    });
    assert.match(JSON.stringify(result.body), /INVALID_COLOR/, JSON.stringify(result.body));
  });

  test("la RPC rechaza una talla INACTIVA", async () => {
    const size = await makeSize({ is_active: false });
    const { productId } = await makeProductUsing(null, null);

    const result = await rpc(adminA.token, "admin_create_variant_matrix", {
      p_product_id: productId,
      p_variants: [
        {
          color_id: null,
          size_id: size.id,
          sku: `${PFX}-${uniq()}`.toUpperCase(),
          price: "10.00",
          stock: "1",
        },
      ],
    });
    assert.match(JSON.stringify(result.body), /INVALID_SIZE/, JSON.stringify(result.body));
  });

  test("CONTROL POSITIVO: con el valor ACTIVO la misma llamada crea la variante", async () => {
    const color = await makeColor();
    const size = await makeSize();
    const { productId } = await makeProductUsing(null, null);

    const result = await rpc(adminA.token, "admin_create_variant_matrix", {
      p_product_id: productId,
      p_variants: [
        {
          color_id: color.id,
          size_id: size.id,
          sku: `${PFX}-${uniq()}`.toUpperCase(),
          price: "10.00",
          stock: "1",
        },
      ],
    });
    assert.equal((result.body as { created: number }).created, 1, JSON.stringify(result.body));
  });

  test("una variante que YA usa un valor retirado se puede seguir editando", async () => {
    // Es el motivo de que la 0034 valide en la TRANSICIÓN y no con un CHECK
    // sobre la fila: con un CHECK, retirar un color congelaría el precio y el
    // stock de todo lo que lo usara. Ese fue el error de la 0030.
    const color = await makeColor();
    const { variantId } = await makeProductUsing(color.id, null);

    await as(adminA.token, `colors?id=eq.${color.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const patch = await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ price: 44.5, stock: 9 }),
    });
    assert.equal((patch.body as unknown[]).length, 1, JSON.stringify(patch.body));
  });
});

// ─────────────────────────────────── renombrar no reescribe el pasado

describe("colors/sizes · renombrar no toca el historial", { skip }, () => {
  test("un pedido conserva el nombre con el que se vendió", async () => {
    const color = await makeColor({ name: "ZZ Antes" });
    const size = await makeSize();
    const { variantId } = await makeProductUsing(color.id, size.id);

    const order = await rpc(null, "create_order", {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 1 }],
      p_customer_phone: "34600777222",
      p_customer_name: "ZZ ATTR Cliente",
      p_client_request_id: crypto.randomUUID(),
      p_shipping_method_id: await anyShippingMethodId(),
    });
    assert.ok(order.status < 300, JSON.stringify(order.body));
    const orderId = (order.body as { order_id: string }).order_id;

    await as(adminA.token, `colors?id=eq.${color.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "ZZ Después" }),
    });
    await as(adminA.token, `sizes?id=eq.${size.id}`, {
      method: "PATCH",
      body: JSON.stringify({ label: `${SIZE_PFX}zz` }),
    });

    const { body: items } = await db(
      `order_items?order_id=eq.${orderId}&select=color_name,size_label`,
    );
    const line = (items as { color_name: string; size_label: string }[])[0];
    assert.equal(line.color_name, "ZZ Antes", "el pedido no se reescribe");
    assert.equal(line.size_label, size.label);

    // CONTROL POSITIVO: la variante VIVA sí refleja el nombre nuevo.
    const { body: variant } = await db(
      `product_variants?id=eq.${variantId}&select=color:colors(name)`,
    );
    assert.equal((variant as { color: { name: string } }[])[0].color.name, "ZZ Después");

    await db(`order_events?order_id=eq.${orderId}`, { method: "DELETE" });
    await db(`order_items?order_id=eq.${orderId}`, { method: "DELETE" });
    await db(`orders?id=eq.${orderId}`, { method: "DELETE" });
    await db(`customers?name=like.ZZ ATTR*`, { method: "DELETE" });
  });
});

// ─────────────────────────────────── concurrencia

describe("colors/sizes · concurrencia", { skip }, () => {
  test("dos altas SIMULTÁNEAS del mismo slug dejan UNA fila", async () => {
    const slug = colorSlug();
    const payload = JSON.stringify({ name: "ZZ Carrera", slug, hex_code: "#123456" });

    const [a, b] = await Promise.all([
      as(adminA.token, "colors", { method: "POST", body: payload }),
      as(adminB.token, "colors", { method: "POST", body: payload }),
    ]);

    const created = [a, b].filter((r) => r.status === 201);
    const rejected = [a, b].filter((r) => r.body?.code === "23505");
    assert.equal(created.length, 1, `esperaba 1 alta: ${JSON.stringify([a.body, b.body])}`);
    assert.equal(rejected.length, 1, "la otra debe ser rechazada por PostgreSQL");

    const { body } = await db(`colors?slug=eq.${slug}&select=id`);
    assert.equal((body as unknown[]).length, 1, "nunca dos filas con el mismo slug");
  });

  test("dos altas SIMULTÁNEAS de la misma (label, grupo) dejan UNA fila", async () => {
    const label = sizeLabel();
    const payload = JSON.stringify({ label, size_group: "apparel" });

    const [a, b] = await Promise.all([
      as(adminA.token, "sizes", { method: "POST", body: payload }),
      as(adminB.token, "sizes", { method: "POST", body: payload }),
    ]);

    assert.equal([a, b].filter((r) => r.status === 201).length, 1);
    const { body } = await db(`sizes?label=eq.${label}&select=id`);
    assert.equal((body as unknown[]).length, 1);
  });

  test("el DOBLE SUBMIT del mismo formulario no crea dos colores", async () => {
    const slug = colorSlug();
    const payload = JSON.stringify({ name: "ZZ Doble", slug, hex_code: "#123456" });

    const first = await as(adminA.token, "colors", { method: "POST", body: payload });
    const second = await as(adminA.token, "colors", { method: "POST", body: payload });

    assert.equal(first.status, 201);
    assert.equal(second.body.code, "23505", "el segundo envío lo para la BD, no el botón");

    const { body } = await db(`colors?slug=eq.${slug}&select=id`);
    assert.equal((body as unknown[]).length, 1);
  });

  test("dos ediciones simultáneas dejan la fila en uno de los dos valores, no mezclada", async () => {
    const color = await makeColor();

    await Promise.all([
      as(adminA.token, `colors?id=eq.${color.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "ZZ A", hex_code: "#AAAAAA" }),
      }),
      as(adminB.token, `colors?id=eq.${color.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "ZZ B", hex_code: "#BBBBBB" }),
      }),
    ]);

    const { body } = await db(`colors?id=eq.${color.id}&select=name,hex_code`);
    const row = (body as { name: string; hex_code: string }[])[0];
    const coherent =
      (row.name === "ZZ A" && row.hex_code === "#AAAAAA") ||
      (row.name === "ZZ B" && row.hex_code === "#BBBBBB");
    assert.ok(coherent, `fila incoherente: ${JSON.stringify(row)}`);
  });
});
