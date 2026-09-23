import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * La BÚSQUEDA del inventario contra PostgREST REAL (Incremento 12).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTO IMPIDE QUE VUELVA
 * ─────────────────────────────────────────────────────────────────────────
 * `lib/data/admin/inventory.ts` metía una columna EMBEBIDA dentro de un `or`:
 *
 *     or=(sku.ilike.*x*,product.name.ilike.*x*)
 *     → 400 PGRST100 · "failed to parse logic tree"
 *
 * Consecuencia medida en el navegador antes de arreglarlo: CUALQUIER búsqueda
 * en /admin/inventario —incluida una por SKU— llevaba a la pantalla "Algo ha
 * fallado". La suite tenía 836 tests y ninguno pasaba por aquí.
 *
 * El primer test AFIRMA el límite de PostgREST: si algún día dejara de ser
 * cierto, este test avisa en vez de dejar el rodeo puesto para siempre.
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

const PFX = "zz-search";
const UNIQUE = Math.random().toString(36).slice(2, 8);
let categoryId = "";
let productId = "";
let sku = "";

before(async () => {
  if (skip) return;

  const category = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ Search",
      slug: `${PFX}-cat-${UNIQUE}`,
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
      name: `ZZ Buscable ${UNIQUE}`,
      slug: `${PFX}-prod-${UNIQUE}`,
      status: "draft",
    }),
  });
  productId = (product.body as { id: string }[])[0].id;

  sku = `ZZSEARCH-${UNIQUE}`;
  await db("product_variants", {
    method: "POST",
    body: JSON.stringify({
      product_id: productId,
      sku,
      price: "10.00",
      stock: 5,
      is_active: true,
    }),
  });
});

after(async () => {
  if (skip) return;
  if (productId) {
    await db(`admin_change_log?product_id=eq.${productId}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${productId}`, { method: "DELETE" });
    await db(`products?id=eq.${productId}`, { method: "DELETE" });
  }
  if (categoryId) await db(`categories?id=eq.${categoryId}`, { method: "DELETE" });
});

describe("búsqueda del inventario", { skip }, () => {
  test("PostgREST SIGUE sin admitir una columna embebida dentro de un `or`", async () => {
    const response = await db(
      `product_variants?select=id,product:products!inner(name)&or=(sku.ilike.*${UNIQUE}*,product.name.ilike.*${UNIQUE}*)`,
    );
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal((response.body as { code: string }).code, "PGRST100");
  });

  test("el rodeo de dos consultas SÍ encuentra por SKU", async () => {
    // 1) ids por SKU
    const bySku = await db(
      `product_variants?select=product_id,products!inner(market_id,deleted_at)&sku=ilike.*${UNIQUE}*&products.market_id=eq.ES&products.deleted_at=is.null`,
    );
    assert.equal(bySku.status, 200, JSON.stringify(bySku.body));
    const ids = [...new Set((bySku.body as { product_id: string }[]).map((r) => r.product_id))];
    assert.deepEqual(ids, [productId]);

    // 2) productos por nombre, slug o esos ids
    const products = await db(
      `products?select=id,name&market_id=eq.ES&deleted_at=is.null&or=(name.ilike.*${UNIQUE}*,slug.ilike.*${UNIQUE}*,id.in.(${ids.join(",")}))`,
    );
    assert.equal(products.status, 200, JSON.stringify(products.body));
    assert.equal((products.body as { id: string }[]).some((p) => p.id === productId), true);
  });

  test("…y por NOMBRE del producto, que era justo lo que rompía", async () => {
    const products = await db(
      `products?select=id&market_id=eq.ES&deleted_at=is.null&or=(name.ilike.*Buscable*,slug.ilike.*Buscable*)`,
    );
    assert.equal(products.status, 200, JSON.stringify(products.body));
    assert.equal((products.body as { id: string }[]).some((p) => p.id === productId), true);
  });

  test("una búsqueda sin resultados devuelve VACÍO, nunca el catálogo entero", async () => {
    const products = await db(
      `products?select=id&market_id=eq.ES&deleted_at=is.null&or=(name.ilike.*noexisteestacadena*,slug.ilike.*noexisteestacadena*)`,
    );
    assert.equal(products.status, 200);
    assert.equal((products.body as unknown[]).length, 0);
  });

  test("la capa de datos ya no construye el `or` roto", () => {
    const source = fs.readFileSync("lib/data/admin/inventory.ts", "utf8");
    assert.ok(
      !/or\(`[^`]*product\.name\.ilike/.test(source),
      "vuelve a haber una columna embebida dentro de un or: eso es un 400 en producción",
    );
    assert.match(source, /id\.in\.\(/);
  });
});
