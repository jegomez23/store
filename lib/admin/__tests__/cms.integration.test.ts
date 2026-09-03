import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Tests de INTEGRACIÓN del CMS de catálogo contra el Supabase REAL (Fase 8).
 *
 * Se ejercitan RLS, los triggers, los constraints, la RPC de la matriz de
 * variantes y las policies de Storage **con el JWT de un usuario**, por el
 * mismo camino que usaría el panel. La service role key solo prepara fixtures
 * y limpia; nunca ejercita el flujo bajo prueba.
 *
 * Los usuarios de prueba se crean y se BORRAN aquí.
 *
 * Si falta `.env.local` la suite se salta entera (nunca se marca como validado
 * algo que no se ha podido ejecutar).
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
          return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
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

/** Acceso administrativo directo, SOLO para fixtures y limpieza. */
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
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

/**
 * Petición con el JWT de un usuario. `apikey` sigue siendo la anon key: mandar
 * el JWT en ambos headers es el falso verde que advierte AI-DEVELOPMENT §8.1.
 */
async function as(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function rows(body: unknown): Record<string, unknown>[] {
  return Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
}

function errorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "message" in body) {
    return String((body as { message: unknown }).message);
  }
  return JSON.stringify(body);
}

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `cms-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Cm-${Math.random().toString(36).slice(2)}-A9`;

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
    // Alta fuera de banda, como exige DEC-020.
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
  assert.ok(tokens.access_token, `login del fixture falló: ${JSON.stringify(tokens)}`);

  return { id: user.id, token: tokens.access_token };
}

async function deleteUser(id: string): Promise<void> {
  await db(`profiles?id=eq.${id}`, { method: "DELETE" });
  await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

/** PNG de 1×1 real (firma válida): sirve para probar Storage de verdad. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("CMS de catálogo — integración contra Supabase real", { skip }, () => {
  let admin: TestUser;
  let plain: TestUser;
  let categoryId = "";
  let colorIds: string[] = [];
  let sizeIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  const createdProducts: string[] = [];
  const createdCategories: string[] = [];
  const createdHomeBlocks: string[] = [];
  const uploadedPaths: string[] = [];
  let settingsBackup: Record<string, unknown> | null = null;

  before(async () => {
    admin = await createUser(true);
    plain = await createUser(false);

    categoryId = String(rows((await db("categories?select=id&market_id=eq.ES&limit=1")).body)[0].id);
    colorIds = rows((await db("colors?select=id&order=sort_order&limit=2")).body).map((c) => String(c.id));
    sizeIds = rows(
      (await db("sizes?select=id&size_group=eq.apparel&order=sort_order&limit=3")).body,
    ).map((s) => String(s.id));

    settingsBackup = rows((await db("settings?select=*&market_id=eq.ES")).body)[0] ?? null;
  });

  after(async () => {
    for (const id of createdProducts) {
      await db(`product_images?product_id=eq.${id}`, { method: "DELETE" });
      await db(`product_variants?product_id=eq.${id}`, { method: "DELETE" });
      await db(`products?id=eq.${id}`, { method: "DELETE" });
    }
    for (const id of createdHomeBlocks) {
      await db(`home_content?id=eq.${id}`, { method: "DELETE" });
    }
    // Las hijas primero: la FK parent_id lo exige.
    for (const id of [...createdCategories].reverse()) {
      await db(`categories?id=eq.${id}`, { method: "DELETE" });
    }
    if (uploadedPaths.length > 0) {
      await fetch(`${env!.url}/storage/v1/object/products`, {
        method: "DELETE",
        headers: {
          apikey: env!.service,
          Authorization: `Bearer ${env!.service}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: uploadedPaths }),
      });
    }
    if (settingsBackup) {
      await db("settings?market_id=eq.ES", {
        method: "PATCH",
        body: JSON.stringify({
          store_name: settingsBackup.store_name,
          whatsapp_number: settingsBackup.whatsapp_number,
          contact_email: settingsBackup.contact_email,
          instagram_url: settingsBackup.instagram_url,
          tiktok_url: settingsBackup.tiktok_url,
          facebook_url: settingsBackup.facebook_url,
        }),
      });
    }
    if (admin) await deleteUser(admin.id);
    if (plain) await deleteUser(plain.id);
  });

  /** Crea un producto por el camino real (JWT de admin) y lo registra para limpieza. */
  async function makeProduct(overrides: Record<string, unknown> = {}): Promise<string> {
    const slug = `cms-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await as(admin.token, "products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: "ES",
        category_id: categoryId,
        name: `CMS ${slug}`,
        slug,
        status: "draft",
        ...overrides,
      }),
    });
    assert.equal(response.status, 201, errorMessage(response.body));
    const id = String(rows(response.body)[0].id);
    createdProducts.push(id);
    return id;
  }

  /**
   * Producto PUBLICADO por el camino real: borrador → variante activa →
   * publicar. Desde la migración 0031 no hay otro: confirmar un producto
   * publicado sin ninguna variante activa lanza NO_ACTIVE_VARIANT, porque su
   * ficha respondería 404.
   */
  async function makePublishedProduct(): Promise<string> {
    const id = await makeProduct();
    const variant = await as(admin.token, "product_variants", {
      method: "POST",
      body: JSON.stringify({
        product_id: id,
        sku: `CMS-${suffix}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
        price: 10,
        stock: 5,
        is_active: true,
      }),
    });
    assert.equal(variant.status, 201, errorMessage(variant.body));

    const published = await as(admin.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    assert.ok(published.status < 300, errorMessage(published.body));
    return id;
  }

  async function callMatrix(token: string, productId: string, variants: unknown[]) {
    const response = await fetch(`${env!.url}/rest/v1/rpc/admin_create_variant_matrix`, {
      method: "POST",
      headers: {
        apikey: env!.anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_product_id: productId, p_variants: variants }),
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  const variant = (over: Record<string, unknown> = {}) => ({
    color_id: colorIds[0],
    size_id: sizeIds[0],
    sku: `CMS-${suffix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    price: "19.90",
    stock: "5",
    is_active: true,
    ...over,
  });

  // ───────────────────────────────────────────────────────────── PRODUCTOS

  describe("productos", () => {
    test("un admin crea un producto válido", async () => {
      const id = await makeProduct();
      const found = rows((await db(`products?select=status,market_id&id=eq.${id}`)).body)[0];
      assert.equal(found.status, "draft", "un producto nace en borrador");
      assert.equal(found.market_id, "ES");
    });

    test("un authenticated sin rol NO puede crear", async () => {
      const response = await as(plain.token, "products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          market_id: "ES",
          category_id: categoryId,
          name: "NO",
          slug: `no-admin-${suffix}`,
        }),
      });
      assert.ok(response.status >= 400, `debería fallar, dio ${response.status}`);
      assert.equal(rows((await db(`products?select=id&slug=eq.no-admin-${suffix}`)).body).length, 0);
    });

    test("un anónimo NO puede crear", async () => {
      const response = await as(env!.anon, "products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          market_id: "ES",
          category_id: categoryId,
          name: "NO",
          slug: `anon-${suffix}`,
        }),
      });
      assert.ok(response.status >= 400);
      assert.equal(rows((await db(`products?select=id&slug=eq.anon-${suffix}`)).body).length, 0);
    });

    test("el mercado inactivo (CO) se rechaza en la BD, no solo en el código", async () => {
      const response = await as(admin.token, "products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          market_id: "CO",
          category_id: categoryId,
          name: "CO",
          slug: `co-${suffix}`,
        }),
      });
      assert.ok(response.status >= 400, `debería fallar, dio ${response.status}`);
    });

    test("un admin no puede MOVER un producto de ES a CO", async () => {
      const id = await makeProduct();
      await as(admin.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ market_id: "CO" }),
      });
      const found = rows((await db(`products?select=market_id&id=eq.${id}`)).body)[0];
      assert.equal(found.market_id, "ES");
    });

    test("un slug repetido en el mismo mercado se rechaza", async () => {
      const id = await makeProduct();
      const slug = String(rows((await db(`products?select=slug&id=eq.${id}`)).body)[0].slug);
      const dup = await as(admin.token, "products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ market_id: "ES", category_id: categoryId, name: "dup", slug }),
      });
      assert.ok(dup.status >= 400, "unique (market_id, slug) debe saltar");
      assert.match(errorMessage(dup.body), /duplicate|unique/i);
    });

    test("una categoría inexistente rompe la FK", async () => {
      const response = await as(admin.token, "products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          market_id: "ES",
          category_id: crypto.randomUUID(),
          name: "x",
          slug: `fk-${suffix}`,
        }),
      });
      assert.ok(response.status >= 400);
    });

    test("publicar y despublicar", async () => {
      const id = await makePublishedProduct();
      assert.equal(rows((await db(`products?select=status&id=eq.${id}`)).body)[0].status, "active");

      await as(admin.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      });
      assert.equal(rows((await db(`products?select=status&id=eq.${id}`)).body)[0].status, "draft");
    });

    test("un estado inventado lo rechaza el CHECK", async () => {
      const id = await makeProduct();
      const response = await as(admin.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "publicado" }),
      });
      assert.ok(response.status >= 400);
    });

    test("un producto borrado no vuelve a aparecer para el público", async () => {
      const id = await makePublishedProduct();
      const visibleBefore = rows(
        (await as(env!.anon, `products?select=id&id=eq.${id}`)).body,
      ).length;
      assert.equal(visibleBefore, 1, "control positivo: activo y visible");

      await as(admin.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ deleted_at: new Date().toISOString(), status: "archived" }),
      });

      assert.equal(rows((await as(env!.anon, `products?select=id&id=eq.${id}`)).body).length, 0);
    });
  });

  // ───────────────────────────────────────────────────────────── VARIANTES

  describe("matriz de variantes (RPC 0021)", () => {
    test("crea las combinaciones pedidas en una transacción", async () => {
      const productId = await makeProduct();
      const payload = [
        variant({ color_id: colorIds[0], size_id: sizeIds[0] }),
        variant({ color_id: colorIds[0], size_id: sizeIds[1] }),
        variant({ color_id: colorIds[1], size_id: sizeIds[0] }),
      ];
      const response = await callMatrix(admin.token, productId, payload);
      assert.equal(response.status, 200, errorMessage(response.body));
      assert.equal((response.body as { created: number }).created, 3);
      assert.equal(
        rows((await db(`product_variants?select=id&product_id=eq.${productId}`)).body).length,
        3,
      );
    });

    test("repetir la misma combinación NO duplica (idempotente)", async () => {
      const productId = await makeProduct();
      const combo = { color_id: colorIds[0], size_id: sizeIds[0] };
      await callMatrix(admin.token, productId, [variant(combo)]);
      const second = await callMatrix(admin.token, productId, [variant(combo)]);
      assert.equal(second.status, 200, errorMessage(second.body));
      assert.equal((second.body as { created: number }).created, 0, "no crea nada la segunda vez");
      assert.equal(
        rows((await db(`product_variants?select=id&product_id=eq.${productId}`)).body).length,
        1,
      );
    });

    test("color y talla NULL: accesorio sin variantes (DEC-019)", async () => {
      const productId = await makeProduct();
      const response = await callMatrix(admin.token, productId, [
        variant({ color_id: null, size_id: null }),
      ]);
      assert.equal(response.status, 200, errorMessage(response.body));
      const created = rows(
        (await db(`product_variants?select=color_id,size_id&product_id=eq.${productId}`)).body,
      )[0];
      assert.equal(created.color_id, null);
      assert.equal(created.size_id, null);
    });

    test("una segunda variante sin color ni talla tampoco se duplica", async () => {
      const productId = await makeProduct();
      await callMatrix(admin.token, productId, [variant({ color_id: null, size_id: null })]);
      const second = await callMatrix(admin.token, productId, [
        variant({ color_id: null, size_id: null }),
      ]);
      // `unique` de Postgres NO lo impediría (dos NULL son distintos): lo impide
      // el IS NOT DISTINCT FROM de la función.
      assert.equal((second.body as { created: number }).created, 0);
    });

    test("precio inválido aborta TODA la transacción", async () => {
      const productId = await makeProduct();
      const response = await callMatrix(admin.token, productId, [
        variant({ size_id: sizeIds[0] }),
        variant({ size_id: sizeIds[1], price: "-5" }),
      ]);
      assert.equal(errorMessage(response.body), "INVALID_PRICE");
      assert.equal(
        rows((await db(`product_variants?select=id&product_id=eq.${productId}`)).body).length,
        0,
        "atomicidad: no queda ninguna a medias",
      );
    });

    test("rechaza precios que Number() aceptaría", async () => {
      const productId = await makeProduct();
      for (const price of ["1e3", "10.999", "abc", "", "Infinity"]) {
        const response = await callMatrix(admin.token, productId, [variant({ price })]);
        assert.equal(errorMessage(response.body), "INVALID_PRICE", `precio "${price}"`);
      }
    });

    test("stock inválido se rechaza", async () => {
      const productId = await makeProduct();
      for (const stock of ["-1", "1.5", "abc", "1e3"]) {
        const response = await callMatrix(admin.token, productId, [variant({ stock })]);
        assert.equal(errorMessage(response.body), "INVALID_STOCK", `stock "${stock}"`);
      }
    });

    test("SKU inválido se rechaza", async () => {
      const productId = await makeProduct();
      for (const sku of ["a", "con espacios", "x".repeat(41)]) {
        const response = await callMatrix(admin.token, productId, [variant({ sku })]);
        assert.equal(errorMessage(response.body), "INVALID_SKU", `sku "${sku}"`);
      }
    });

    test("color o talla inexistentes se rechazan", async () => {
      const productId = await makeProduct();
      const badColor = await callMatrix(admin.token, productId, [
        variant({ color_id: crypto.randomUUID() }),
      ]);
      assert.equal(errorMessage(badColor.body), "INVALID_COLOR");
      const badSize = await callMatrix(admin.token, productId, [
        variant({ size_id: crypto.randomUUID() }),
      ]);
      assert.equal(errorMessage(badSize.body), "INVALID_SIZE");
    });

    test("un authenticated sin rol es rechazado", async () => {
      const productId = await makeProduct();
      const response = await callMatrix(plain.token, productId, [variant()]);
      assert.ok(response.status >= 400);
      assert.equal(
        rows((await db(`product_variants?select=id&product_id=eq.${productId}`)).body).length,
        0,
      );
    });

    test("un anónimo no puede ni ejecutar la función", async () => {
      const productId = await makeProduct();
      const response = await callMatrix(env!.anon, productId, [variant()]);
      assert.ok(response.status >= 400);
    });

    test("un producto inexistente da PRODUCT_NOT_FOUND, no un 500", async () => {
      const response = await callMatrix(admin.token, crypto.randomUUID(), [variant()]);
      assert.equal(errorMessage(response.body), "PRODUCT_NOT_FOUND");
    });

    test("una matriz vacía se rechaza", async () => {
      const productId = await makeProduct();
      const response = await callMatrix(admin.token, productId, []);
      assert.equal(errorMessage(response.body), "EMPTY_MATRIX");
    });

    test("editar precio, stock y activa de una variante existente", async () => {
      const productId = await makeProduct();
      await callMatrix(admin.token, productId, [variant()]);
      const variantId = String(
        rows((await db(`product_variants?select=id&product_id=eq.${productId}`)).body)[0].id,
      );

      const response = await as(admin.token, `product_variants?id=eq.${variantId}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ price: 44.5, stock: 12, is_active: false }),
      });
      assert.equal(response.status, 200, errorMessage(response.body));

      const updated = rows(
        (await db(`product_variants?select=price,stock,is_active&id=eq.${variantId}`)).body,
      )[0];
      assert.equal(Number(updated.price), 44.5);
      assert.equal(updated.stock, 12);
      assert.equal(updated.is_active, false);
    });

    test("stock negativo lo rechaza el CHECK de la tabla", async () => {
      const productId = await makeProduct();
      await callMatrix(admin.token, productId, [variant()]);
      const variantId = String(
        rows((await db(`product_variants?select=id&product_id=eq.${productId}`)).body)[0].id,
      );
      const response = await as(admin.token, `product_variants?id=eq.${variantId}`, {
        method: "PATCH",
        body: JSON.stringify({ stock: -1 }),
      });
      assert.ok(response.status >= 400);
    });
  });

  // ──────────────────────────────────────────────────────────── CATEGORÍAS

  describe("categorías", () => {
    async function makeCategory(over: Record<string, unknown> = {}) {
      const slug = `cat-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await as(admin.token, "categories", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ market_id: "ES", name: `Cat ${slug}`, slug, ...over }),
      });
      if (response.status === 201) createdCategories.push(String(rows(response.body)[0].id));
      return response;
    }

    test("un admin crea una categoría raíz", async () => {
      const response = await makeCategory();
      assert.equal(response.status, 201, errorMessage(response.body));
    });

    test("una subcategoría de una raíz es válida (2 niveles)", async () => {
      const root = await makeCategory();
      const rootId = String(rows(root.body)[0].id);
      const child = await makeCategory({ parent_id: rootId });
      assert.equal(child.status, 201, errorMessage(child.body));
    });

    test("un TERCER nivel lo rechaza el trigger", async () => {
      const root = await makeCategory();
      const child = await makeCategory({ parent_id: String(rows(root.body)[0].id) });
      const grandchild = await makeCategory({ parent_id: String(rows(child.body)[0].id) });
      assert.ok(grandchild.status >= 400, "el trigger enforce_category_depth debe saltar");
      assert.match(errorMessage(grandchild.body), /profundidad/i);
    });

    test("editar nombre y orden", async () => {
      const created = await makeCategory();
      const id = String(rows(created.body)[0].id);
      const response = await as(admin.token, `categories?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name: "Renombrada", sort_order: 5, is_active: false }),
      });
      assert.equal(response.status, 200, errorMessage(response.body));
      const found = rows((await db(`categories?select=name,sort_order,is_active&id=eq.${id}`)).body)[0];
      assert.equal(found.name, "Renombrada");
      assert.equal(found.sort_order, 5);
      assert.equal(found.is_active, false);
    });

    test("una categoría inactiva desaparece del público", async () => {
      const created = await makeCategory({ is_active: true });
      const id = String(rows(created.body)[0].id);
      assert.equal(rows((await as(env!.anon, `categories?select=id&id=eq.${id}`)).body).length, 1);

      await as(admin.token, `categories?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });
      assert.equal(rows((await as(env!.anon, `categories?select=id&id=eq.${id}`)).body).length, 0);
    });

    test("crear en CO se rechaza", async () => {
      const response = await as(admin.token, "categories", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ market_id: "CO", name: "CO", slug: `cat-co-${suffix}` }),
      });
      assert.ok(response.status >= 400);
    });

    test("un authenticated sin rol no puede crear", async () => {
      const response = await as(plain.token, "categories", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ market_id: "ES", name: "NO", slug: `cat-no-${suffix}` }),
      });
      assert.ok(response.status >= 400);
    });

    test("la FK real IMPIDE borrar una categoría con productos", async () => {
      const created = await makeCategory();
      const id = String(rows(created.body)[0].id);
      await makeProduct({ category_id: id });

      const response = await as(admin.token, `categories?id=eq.${id}`, { method: "DELETE" });
      assert.ok(
        response.status >= 400,
        `products.category_id es NOT NULL sin cascada: el DELETE debe fallar (dio ${response.status})`,
      );
      assert.equal(rows((await db(`categories?select=id&id=eq.${id}`)).body).length, 1);
    });
  });

  // ──────────────────────────────────────────────────────── IMÁGENES / STORAGE

  describe("imágenes y Storage", () => {
    async function upload(token: string, path: string, body: Uint8Array, contentType: string) {
      const response = await fetch(`${env!.url}/storage/v1/object/products/${path}`, {
        method: "POST",
        headers: {
          apikey: env!.anon,
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
        },
        body: body as BodyInit,
      });
      return { status: response.status, body: await response.text() };
    }

    test("un admin SÍ puede subir al bucket (control positivo)", async () => {
      const path = `cms-${suffix}/${crypto.randomUUID()}.png`;
      const response = await upload(admin.token, path, PNG_1X1, "image/png");
      assert.equal(response.status, 200, response.body);
      uploadedPaths.push(path);
    });

    test("un anónimo NO puede subir", async () => {
      const path = `cms-${suffix}/${crypto.randomUUID()}.png`;
      const response = await upload(env!.anon, path, PNG_1X1, "image/png");
      assert.ok(response.status >= 400, `debería fallar, dio ${response.status}`);
    });

    test("un authenticated sin rol NO puede subir", async () => {
      const path = `cms-${suffix}/${crypto.randomUUID()}.png`;
      const response = await upload(plain.token, path, PNG_1X1, "image/png");
      assert.ok(response.status >= 400, `debería fallar, dio ${response.status}`);
    });

    test("el bucket rechaza un tipo MIME no permitido (migración 0020)", async () => {
      const path = `cms-${suffix}/${crypto.randomUUID()}.svg`;
      const response = await upload(
        admin.token,
        path,
        Buffer.from("<svg onload=alert(1)></svg>"),
        "image/svg+xml",
      );
      assert.ok(response.status >= 400, `SVG debería rechazarse, dio ${response.status}`);
      assert.match(response.body, /mime/i);
    });

    test("el bucket rechaza un archivo por encima de 5 MB", async () => {
      const path = `cms-${suffix}/${crypto.randomUUID()}.png`;
      const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 0);
      PNG_1X1.copy(big, 0);
      const response = await upload(admin.token, path, big, "image/png");
      assert.ok(response.status >= 400, `debería rechazarse por tamaño, dio ${response.status}`);
    });

    test("la fila de product_images se asocia al producto y respeta orden y principal", async () => {
      const productId = await makeProduct();
      const first = await as(admin.token, "product_images", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          product_id: productId,
          url: `cms-${suffix}/a.webp`,
          alt_text: "a",
          sort_order: 0,
          is_primary: true,
        }),
      });
      assert.equal(first.status, 201, errorMessage(first.body));

      const second = await as(admin.token, "product_images", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          product_id: productId,
          url: `cms-${suffix}/b.webp`,
          alt_text: "b",
          sort_order: 1,
          is_primary: false,
        }),
      });
      assert.equal(second.status, 201, errorMessage(second.body));

      const list = rows(
        (await db(`product_images?select=alt_text,sort_order&product_id=eq.${productId}&order=sort_order`))
          .body,
      );
      assert.deepEqual(list.map((i) => i.alt_text), ["a", "b"]);
    });

    test("la BD impide DOS imágenes principales (índice de la 0020)", async () => {
      const productId = await makeProduct();
      await as(admin.token, "product_images", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          url: `cms-${suffix}/p1.webp`,
          alt_text: "p1",
          is_primary: true,
        }),
      });
      const dup = await as(admin.token, "product_images", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          url: `cms-${suffix}/p2.webp`,
          alt_text: "p2",
          is_primary: true,
        }),
      });
      assert.ok(dup.status >= 400, "el índice UNIQUE parcial debe saltar");
    });

    test("alt_text es obligatorio (NOT NULL)", async () => {
      const productId = await makeProduct();
      const response = await as(admin.token, "product_images", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, url: `cms-${suffix}/x.webp` }),
      });
      assert.ok(response.status >= 400);
    });

    test("un authenticated sin rol no puede insertar filas de imagen", async () => {
      const productId = await makeProduct();
      const response = await as(plain.token, "product_images", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          url: `cms-${suffix}/no.webp`,
          alt_text: "no",
        }),
      });
      assert.ok(response.status >= 400);
      assert.equal(
        rows((await db(`product_images?select=id&product_id=eq.${productId}`)).body).length,
        0,
      );
    });

    test("borrar el producto arrastra sus imágenes (ON DELETE CASCADE)", async () => {
      const productId = await makeProduct();
      await as(admin.token, "product_images", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          url: `cms-${suffix}/c.webp`,
          alt_text: "c",
        }),
      });
      await db(`products?id=eq.${productId}`, { method: "DELETE" });
      assert.equal(
        rows((await db(`product_images?select=id&product_id=eq.${productId}`)).body).length,
        0,
      );
      // Ya está borrado: se saca de la lista de limpieza.
      createdProducts.splice(createdProducts.indexOf(productId), 1);
    });
  });

  // ────────────────────────────────────────────────────────────────── HOME

  describe("home", () => {
    async function makeBlock(over: Record<string, unknown> = {}) {
      const response = await as(admin.token, "home_content", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ market_id: "ES", section: "banner", title: `H ${suffix}`, ...over }),
      });
      if (response.status === 201) createdHomeBlocks.push(String(rows(response.body)[0].id));
      return response;
    }

    test("un admin crea y edita un bloque", async () => {
      const created = await makeBlock();
      assert.equal(created.status, 201, errorMessage(created.body));
      const id = String(rows(created.body)[0].id);

      const updated = await as(admin.token, `home_content?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ title: "Editado", sort_order: 3 }),
      });
      assert.equal(updated.status, 200, errorMessage(updated.body));
      assert.equal(rows((await db(`home_content?select=title&id=eq.${id}`)).body)[0].title, "Editado");
    });

    test("una sección inventada la rechaza el CHECK", async () => {
      const response = await makeBlock({ section: "carousel" });
      assert.ok(response.status >= 400);
    });

    test("desactivar un bloque lo oculta al público", async () => {
      const created = await makeBlock({ is_active: true });
      const id = String(rows(created.body)[0].id);
      assert.equal(rows((await as(env!.anon, `home_content?select=id&id=eq.${id}`)).body).length, 1);

      await as(admin.token, `home_content?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });
      assert.equal(rows((await as(env!.anon, `home_content?select=id&id=eq.${id}`)).body).length, 0);
    });

    test("un authenticated sin rol no puede crear ni leer todo", async () => {
      const response = await as(plain.token, "home_content", {
        method: "POST",
        body: JSON.stringify({ market_id: "ES", section: "hero", title: "NO" }),
      });
      assert.ok(response.status >= 400);
    });

    test("un bloque de un mercado INACTIVO no es público (DEC-022, migración 0020)", async () => {
      const inserted = await db("home_content", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ market_id: "CO", section: "hero", title: `SECRETO-${suffix}` }),
      });
      const id = String(rows(inserted.body)[0].id);
      const publicRead = await as(env!.anon, "home_content?select=title");
      assert.ok(
        !JSON.stringify(publicRead.body).includes(`SECRETO-${suffix}`),
        "el home de un mercado inactivo NO debe ser público",
      );
      await db(`home_content?id=eq.${id}`, { method: "DELETE" });
    });
  });

  // ─────────────────────────────────────────────────────────────── AJUSTES

  describe("ajustes", () => {
    test("un admin lee y modifica los ajustes de ES", async () => {
      const read = await as(admin.token, "settings?select=store_name&market_id=eq.ES");
      assert.equal(rows(read.body).length, 1);

      const response = await as(admin.token, "settings?market_id=eq.ES", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ store_name: `YI ${suffix}`, contact_email: "hola@yi-test.local" }),
      });
      assert.equal(response.status, 200, errorMessage(response.body));
      assert.equal(
        rows((await db("settings?select=store_name&market_id=eq.ES")).body)[0].store_name,
        `YI ${suffix}`,
      );
    });

    test("el número de WhatsApp se puede cambiar sin desplegar", async () => {
      const response = await as(admin.token, "settings?market_id=eq.ES", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ whatsapp_number: "34611223344" }),
      });
      assert.equal(response.status, 200, errorMessage(response.body));
      assert.equal(
        rows((await db("settings?select=whatsapp_number&market_id=eq.ES")).body)[0].whatsapp_number,
        "34611223344",
      );
    });

    test("un authenticated sin rol no puede modificarlos", async () => {
      const before = rows((await db("settings?select=store_name&market_id=eq.ES")).body)[0].store_name;
      await as(plain.token, "settings?market_id=eq.ES", {
        method: "PATCH",
        body: JSON.stringify({ store_name: "HACKEADO" }),
      });
      assert.equal(
        rows((await db("settings?select=store_name&market_id=eq.ES")).body)[0].store_name,
        before,
      );
    });

    test("un anónimo no puede modificarlos", async () => {
      const before = rows((await db("settings?select=store_name&market_id=eq.ES")).body)[0].store_name;
      await as(env!.anon, "settings?market_id=eq.ES", {
        method: "PATCH",
        body: JSON.stringify({ store_name: "HACKEADO" }),
      });
      assert.equal(
        rows((await db("settings?select=store_name&market_id=eq.ES")).body)[0].store_name,
        before,
      );
    });

    test("un admin no puede crear ajustes para CO (mercado inactivo)", async () => {
      const response = await as(admin.token, "settings", {
        method: "POST",
        body: JSON.stringify({ market_id: "CO", store_name: "CO", whatsapp_number: "57300000000" }),
      });
      assert.ok(response.status >= 400);
    });
  });
});
