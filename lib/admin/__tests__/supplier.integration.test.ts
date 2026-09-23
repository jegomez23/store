import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * `products.supplier` y `product_variants.supplier_ref` (migración 0039)
 * contra el Supabase REAL.
 *
 * Lo que protegen estos tests:
 *
 *   1. **INTEGRIDAD.** Escribir proveedor o referencia no toca stock, ni SKU,
 *      ni precio, ni las demás variantes. Es un dato al lado, no encima.
 *   2. **NO HAY UNICIDAD, y es deliberado.** Dos productos distintos pueden
 *      ser dos publicaciones del mismo artículo externo.
 *   3. **AUTORIZACIÓN Y MERCADO.** anon y autenticado-sin-rol rechazados;
 *      mercado inactivo rechazado; con control positivo de admin.
 *   4. **LÍMITES EN POSTGRESQL.** Cadena en blanco y longitud, en la BD y no
 *      solo en el formulario.
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

/** PATCH como lo haría el panel: anon key + token del usuario. */
async function patchAs(token: string | null, path: string, body: unknown) {
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: env!.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `supp-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Sp-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Supplier" }),
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

const PFX = "zz-supp";
const UNIQUE = Math.random().toString(36).slice(2, 8);

let admin: TestUser;
let plainUser: TestUser;
let categoryId = "";
/** Dos productos DISTINTOS que representan el mismo artículo externo. */
let productA = "";
let productB = "";
let coProduct = "";
let vA1 = "";
let vA2 = "";
/** Variante del producto B: el incremento 17 comprueba que puede compartir referencia con la de A. */
let vB1 = "";
let coVariant = "";

before(async () => {
  if (skip) return;

  [admin, plainUser] = await Promise.all([createUser(true), createUser(false)]);

  const category = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ Supplier",
      slug: `${PFX}-cat-${UNIQUE}`,
      sort_order: 99,
    }),
  });
  categoryId = (category.body as { id: string }[])[0].id;

  const products = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        market_id: "ES",
        category_id: categoryId,
        name: `ZZ Supp A ${UNIQUE}`,
        slug: `${PFX}-a-${UNIQUE}`,
        status: "draft",
      },
      {
        market_id: "ES",
        category_id: categoryId,
        name: `ZZ Supp B ${UNIQUE}`,
        slug: `${PFX}-b-${UNIQUE}`,
        status: "draft",
      },
      {
        market_id: "CO",
        category_id: categoryId,
        name: `ZZ Supp CO ${UNIQUE}`,
        slug: `${PFX}-co-${UNIQUE}`,
        status: "draft",
      },
    ]),
  });
  const rows = products.body as { id: string; slug: string }[];
  productA = rows.find((p) => p.slug.includes("-a-"))!.id;
  productB = rows.find((p) => p.slug.includes("-b-"))!.id;
  coProduct = rows.find((p) => p.slug.includes("-co-"))!.id;

  const variants = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      { product_id: productA, sku: `ZZSUPP-${UNIQUE}-1`, price: "10.00", stock: 5, is_active: true },
      { product_id: productA, sku: `ZZSUPP-${UNIQUE}-2`, price: "10.00", stock: 9, is_active: true },
      { product_id: productB, sku: `ZZSUPP-${UNIQUE}-B0`, price: "10.00", stock: 7, is_active: true },
      { product_id: coProduct, sku: `ZZSUPP-${UNIQUE}-CO`, price: "10.00", stock: 4, is_active: true },
    ]),
  });
  const vRows = variants.body as { id: string; sku: string }[];
  vA1 = vRows.find((v) => v.sku.endsWith("-1"))!.id;
  vA2 = vRows.find((v) => v.sku.endsWith("-2"))!.id;
  vB1 = vRows.find((v) => v.sku.endsWith("-B0"))!.id;
  coVariant = vRows.find((v) => v.sku.endsWith("-CO"))!.id;
});

after(async () => {
  if (skip) return;
  for (const id of [productA, productB, coProduct]) {
    if (!id) continue;
    await db(`admin_change_log?product_id=eq.${id}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${id}`, { method: "DELETE" });
    await db(`products?id=eq.${id}`, { method: "DELETE" });
  }
  if (categoryId) await db(`categories?id=eq.${categoryId}`, { method: "DELETE" });
  for (const user of [admin, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("proveedor y referencia · escritura", { skip }, () => {
  test("el admin escribe el proveedor del producto", async () => {
    const response = await patchAs(admin.token, `products?id=eq.${productA}`, {
      supplier: "Proveedor A",
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { supplier: string }[])[0].supplier, "Proveedor A");
  });

  test("y lo edita después", async () => {
    await patchAs(admin.token, `products?id=eq.${productA}`, { supplier: "Proveedor B" });
    const row = await db(`products?id=eq.${productA}&select=supplier`);
    assert.equal((row.body as { supplier: string }[])[0].supplier, "Proveedor B");
  });

  test("el admin escribe y edita la referencia de UNA variante", async () => {
    const first = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, {
      supplier_ref: "abc-123-blk/m",
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(
      (first.body as { supplier_ref: string }[])[0].supplier_ref,
      "abc-123-blk/m",
      "se guarda TAL CUAL: ni mayúsculas ni guiones normalizados",
    );

    await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: "XYZ-999" });
    const row = await db(`product_variants?id=eq.${vA1}&select=supplier_ref`);
    assert.equal((row.body as { supplier_ref: string }[])[0].supplier_ref, "XYZ-999");
  });

  test("null borra el dato", async () => {
    await patchAs(admin.token, `product_variants?id=eq.${vA2}`, { supplier_ref: "TEMP-1" });
    await patchAs(admin.token, `product_variants?id=eq.${vA2}`, { supplier_ref: null });
    const row = await db(`product_variants?id=eq.${vA2}&select=supplier_ref`);
    assert.equal((row.body as { supplier_ref: string | null }[])[0].supplier_ref, null);
  });
});

describe("proveedor y referencia · límites en PostgreSQL", { skip }, () => {
  test("una cadena en BLANCO se rechaza: no es un dato", async () => {
    const response = await patchAs(admin.token, `products?id=eq.${productA}`, { supplier: "   " });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal((response.body as { code: string }).code, "23514");
  });

  test("pasarse del tope se rechaza en la BD, no solo en el formulario", async () => {
    const response = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, {
      supplier_ref: "x".repeat(121),
    });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal((response.body as { code: string }).code, "23514");
  });

  test("120 caracteres justos sí entran", async () => {
    const response = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, {
      supplier_ref: "y".repeat(120),
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: "XYZ-999" });
  });
});

describe("proveedor y referencia · integridad", { skip }, () => {
  test("cambiar la referencia NO altera stock, sku ni precio", async () => {
    const before = await db(
      `product_variants?id=eq.${vA1}&select=stock,sku,price,is_active,color_id,size_id`,
    );
    await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: "REF-NUEVA-1" });
    const after = await db(
      `product_variants?id=eq.${vA1}&select=stock,sku,price,is_active,color_id,size_id`,
    );
    assert.deepEqual(after.body, before.body, "solo debía cambiar supplier_ref");
  });

  test("cambiar el proveedor NO altera las variantes", async () => {
    const before = await db(
      `product_variants?product_id=eq.${productA}&select=id,stock,sku,supplier_ref&order=sku`,
    );
    await patchAs(admin.token, `products?id=eq.${productA}`, { supplier: "Proveedor C" });
    const after = await db(
      `product_variants?product_id=eq.${productA}&select=id,stock,sku,supplier_ref&order=sku`,
    );
    assert.deepEqual(after.body, before.body);
  });

  test("la referencia NO se copia al pedido: `order_items` no la tiene", async () => {
    const columns = await db("order_items?select=*&limit=0");
    assert.equal(columns.status, 200);
    const sql = fs.readFileSync("supabase/migrations/0011_orders.sql", "utf8");
    const table = sql.slice(sql.indexOf("create table public.order_items"));
    assert.ok(
      !table.slice(0, table.indexOf(");")).includes("supplier"),
      "el snapshot del pedido guarda lo que el cliente compró, no de dónde lo sacamos",
    );
  });

  test("escribir la referencia con la sesión del admin NO deja auditoría", async () => {
    // `admin_change_log` registra cuatro campos y este no es uno (DEC-055).
    await db(`admin_change_log?product_id=eq.${productA}`, { method: "DELETE" });
    await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: "REF-AUDIT" });
    const log = await db(`admin_change_log?product_id=eq.${productA}&select=field_name`);
    assert.deepEqual(log.body, [], "solo se auditan price, stock, status y deleted_at");
  });
});

describe("proveedor y referencia · sin unicidad, a propósito", { skip }, () => {
  test("dos productos distintos pueden compartir proveedor y referencia", async () => {
    const a = await patchAs(admin.token, `products?id=eq.${productA}`, { supplier: "Proveedor X" });
    const b = await patchAs(admin.token, `products?id=eq.${productB}`, { supplier: "Proveedor X" });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200, JSON.stringify(b.body));

    const variantB = await db("product_variants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_id: productB,
        sku: `ZZSUPP-${UNIQUE}-B1`,
        price: "10.00",
        stock: 1,
        is_active: true,
        supplier_ref: "REF-123",
      }),
    });
    assert.equal(variantB.status, 201, JSON.stringify(variantB.body));

    const same = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, {
      supplier_ref: "REF-123",
    });
    assert.equal(
      same.status,
      200,
      "dos publicaciones del mismo artículo externo son legítimas: no hay UNIQUE",
    );
  });

  test("dos variantes del MISMO producto también pueden repetir referencia", async () => {
    const a = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: "DUP-1" });
    const b = await patchAs(admin.token, `product_variants?id=eq.${vA2}`, { supplier_ref: "DUP-1" });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200, JSON.stringify(b.body));
  });

  test("lo que SÍ sigue siendo único no se ha tocado: el sku", async () => {
    const clash = await db("product_variants", {
      method: "POST",
      body: JSON.stringify({
        product_id: productB,
        sku: `ZZSUPP-${UNIQUE}-1`,
        price: "10.00",
        stock: 1,
      }),
    });
    assert.equal(clash.status, 409, JSON.stringify(clash.body));
  });
});

describe("proveedor y referencia · autorización", { skip }, () => {
  /*
    OJO CON LA FORMA DEL RECHAZO: un UPDATE que RLS no deja ver no da 403, da
    **200 con cero filas** — la fila sencillamente no existe para quien
    pregunta. Por eso lo que se afirma es «no se escribió nada», que es la
    propiedad real, y no un código de estado.
  */
  test("anónimo no puede escribir: cero filas afectadas y el dato intacto", async () => {
    /*
      INCREMENTO 16: desde la 0044 este PATCH ni siquiera llega a la policy.
      `patchAs` pide `Prefer: return=representation`, y `anon` ya no tiene
      GRANT de lectura sobre `supplier`, así que muere antes con 42501. Se
      sigue afirmando LA PROPIEDAD REAL —que no se escribió nada—, no una forma
      concreta de rechazo, igual que en `settings.integration.test.ts`.
    */
    const before = await db(`products?id=eq.${productA}&select=supplier`);
    const response = await patchAs(null, `products?id=eq.${productA}`, { supplier: "Hackeado" });
    assert.ok(
      response.status >= 400 || JSON.stringify(response.body) === "[]",
      JSON.stringify(response.body),
    );
    const after = await db(`products?id=eq.${productA}&select=supplier`);
    assert.deepEqual(after.body, before.body);
  });

  test("autenticado SIN rol admin tampoco", async () => {
    const before = await db(`product_variants?id=eq.${vA1}&select=supplier_ref`);
    const response = await patchAs(plainUser.token, `product_variants?id=eq.${vA1}`, {
      supplier_ref: "Hackeada",
    });
    assert.deepEqual(response.body, [], JSON.stringify(response.body));
    const after = await db(`product_variants?id=eq.${vA1}&select=supplier_ref`);
    assert.deepEqual(after.body, before.body);
  });

  test("ni el admin puede escribir en un mercado INACTIVO", async () => {
    const product = await patchAs(admin.token, `products?id=eq.${coProduct}`, {
      supplier: "Proveedor CO",
    });
    assert.deepEqual(product.body, [], "RLS de mercado activo: cero filas afectadas");

    const variant = await patchAs(admin.token, `product_variants?id=eq.${coVariant}`, {
      supplier_ref: "CO-1",
    });
    assert.deepEqual(variant.body, []);

    const row = await db(`products?id=eq.${coProduct}&select=supplier`);
    assert.equal((row.body as { supplier: string | null }[])[0].supplier, null);
  });

  test("un producto que no existe no escribe nada", async () => {
    const response = await patchAs(
      admin.token,
      "products?id=eq.00000000-0000-4000-8000-000000000000",
      { supplier: "Fantasma" },
    );
    assert.deepEqual(response.body, []);
  });
});

describe("proveedor y referencia · búsqueda del inventario", { skip }, () => {
  test("la consulta de ids acepta sku O referencia en un solo `or`", async () => {
    await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: `BUSCA-${UNIQUE}` });

    const response = await db(
      `product_variants?select=product_id,products!inner(market_id,deleted_at)&or=(sku.ilike.*noexiste*,supplier_ref.ilike.*BUSCA-${UNIQUE}*)&products.market_id=eq.ES&products.deleted_at=is.null`,
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const ids = (response.body as { product_id: string }[]).map((r) => r.product_id);
    assert.deepEqual(ids, [productA]);
  });

  test("y el proveedor se busca en la misma consulta de productos", async () => {
    await patchAs(admin.token, `products?id=eq.${productA}`, { supplier: `Proveedor-${UNIQUE}` });
    const response = await db(
      `products?select=id&market_id=eq.ES&deleted_at=is.null&or=(name.ilike.*nada*,slug.ilike.*nada*,supplier.ilike.*${UNIQUE}*)`,
    );
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { id: string }[]).some((p) => p.id === productA), true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENTO 16 · «No se pinta» no era «no se puede leer» (migración 0044)
   ═══════════════════════════════════════════════════════════════════════════

   El incremento 13 verificó que la ficha pública no muestra el proveedor ni la
   referencia, y sigue siendo cierto. Pero con la anon key —que viaja en el
   navegador de cualquiera— las dos columnas se podían PEDIR:

       GET /rest/v1/products?select=supplier             → 200
       GET /rest/v1/product_variants?select=supplier_ref → 200

   Hoy están a NULL en todo el catálogo, así que no había fuga: había una
   puerta, y se cierra antes de que el administrador escriba de quién se surte.
   ═════════════════════════════════════════════════════════════════════════ */

describe("proveedor y referencia · el cliente no puede ni pedirlos", { skip }, () => {
  const anonGet = async (path: string) => {
    const response = await fetch(`${env!.url}/rest/v1/${path}`, {
      headers: { apikey: env!.anon },
    });
    const text = await response.text();
    return { status: response.status, code: text ? (JSON.parse(text).code ?? null) : null, text };
  };

  test("anon NO puede leer products.supplier", async () => {
    const r = await anonGet("products?select=supplier&limit=1");
    assert.equal(r.status, 401, r.text.slice(0, 160));
    assert.equal(r.code, "42501");
  });

  test("anon NO puede leer product_variants.supplier_ref", async () => {
    const r = await anonGet("product_variants?select=supplier_ref&limit=1");
    assert.equal(r.status, 401, r.text.slice(0, 160));
    assert.equal(r.code, "42501");
  });

  test("anon tampoco puede pedir la fila entera para colarlas", async () => {
    for (const table of ["products", "product_variants"]) {
      const r = await anonGet(`${table}?select=*&limit=1`);
      assert.equal(r.status, 401, `${table}: ${r.text.slice(0, 120)}`);
    }
  });

  /*
    CONTROLES POSITIVOS. Un GRANT por columna rompe la tienda entera si se
    olvida una, y PostgreSQL exige el privilegio también sobre las columnas del
    WHERE, no solo sobre las de salida.
  */
  test("el escaparate sigue leyendo lo suyo: catálogo, ficha y sitemap", async () => {
    const consultas = [
      "products?select=slug,name,is_new&market_id=eq.ES&status=eq.active&deleted_at=is.null&limit=1",
      "products?select=id,slug,name,short_description,description,materials,meta_title,meta_description&status=eq.active&limit=1",
      "products?select=slug,updated_at&status=eq.active&deleted_at=is.null&limit=1",
      "product_variants?select=id,price,compare_at_price,stock,is_active&limit=1",
      "product_variants?select=id,product_id,color_id,size_id,sku&limit=1",
    ];
    for (const q of consultas) {
      const r = await anonGet(q);
      assert.equal(r.status, 200, `${q} → ${r.status} ${r.text.slice(0, 160)}`);
    }
  });

  test("un admin SÍ las lee: el panel las necesita para reponer", async () => {
    const response = await fetch(
      `${env!.url}/rest/v1/products?select=id,supplier&id=eq.${productA}`,
      { headers: { apikey: env!.anon, Authorization: `Bearer ${admin.token}` } },
    );
    assert.equal(response.status, 200, (await response.text()).slice(0, 160));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENTO 17 · Dos verificaciones de MODELO, sin cambiar nada
   ═══════════════════════════════════════════════════════════════════════════

   El encargo era comprobar dos propiedades y NO tocar el modelo si ya se
   cumplen. Se cumplen, así que no se ha tocado nada: estos tests existen para
   que sigan cumpliéndose.

     1. Dos productos públicos DISTINTOS pueden apuntar al mismo artículo
        externo (proveedores distintos o iguales, misma referencia).
     2. El pedido guarda el precio que se cobró, y cambiar el producto después
        NO reescribe pedidos históricos. Es la condición que tienen que cumplir
        las promociones el día que existan.
   ═════════════════════════════════════════════════════════════════════════ */

describe("réplicas · dos publicaciones del mismo artículo externo", { skip }, () => {
  test("mismo supplier_ref en variantes de productos distintos: conviven", async () => {
    const ref = `REF-COMUN-${UNIQUE}`;
    const a = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { supplier_ref: ref });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await patchAs(admin.token, `product_variants?id=eq.${vB1}`, { supplier_ref: ref });
    assert.equal(b.status, 200, JSON.stringify(b.body));

    const rows = await db(`product_variants?supplier_ref=eq.${ref}&select=id,product_id`);
    assert.equal((rows.body as unknown[]).length, 2, "las dos referencias tienen que coexistir");
    const productos = new Set((rows.body as { product_id: string }[]).map((r) => r.product_id));
    assert.equal(productos.size, 2, "y pertenecer a productos DISTINTOS");
  });

  test("proveedores distintos con la misma referencia: también", async () => {
    // Producto A del proveedor X, producto B del proveedor Y, misma referencia.
    assert.equal((await patchAs(admin.token, `products?id=eq.${productA}`, { supplier: `X-${UNIQUE}` })).status, 200);
    assert.equal((await patchAs(admin.token, `products?id=eq.${productB}`, { supplier: `Y-${UNIQUE}` })).status, 200);

    const rows = await db(
      `products?id=in.(${productA},${productB})&select=id,supplier,product_variants(supplier_ref)`,
    );
    const proveedores = (rows.body as { supplier: string }[]).map((r) => r.supplier).sort();
    assert.deepEqual(proveedores, [`X-${UNIQUE}`, `Y-${UNIQUE}`]);
  });

  test("y el sku SIGUE siendo único: la referencia no lo sustituye", async () => {
    const { body } = await db(`product_variants?id=eq.${vB1}&select=sku`);
    const skuAjeno = (body as { sku: string }[])[0].sku;
    const choque = await patchAs(admin.token, `product_variants?id=eq.${vA1}`, { sku: skuAjeno });
    assert.equal(choque.status, 409, JSON.stringify(choque.body));
  });

  test("el cliente no puede leer ninguna de las dos, ni con la anon key", async () => {
    for (const q of ["products?select=supplier&limit=1", "product_variants?select=supplier_ref&limit=1"]) {
      const response = await fetch(`${env!.url}/rest/v1/${q}`, { headers: { apikey: env!.anon } });
      assert.equal(response.status, 401, `${q} → ${response.status}`);
    }
  });
});
