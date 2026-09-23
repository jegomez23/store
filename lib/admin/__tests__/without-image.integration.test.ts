import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Detector de productos PUBLICADOS SIN FOTO (incremento P2) contra el Supabase
 * REAL.
 *
 * QUÉ SE PRUEBA, y por qué importa cada caso:
 *
 *   1. **El predicado.** Publicado sin ninguna imagen utilizable → aparece.
 *      Con imagen, borrador, archivado y borrado lógico → no aparecen.
 *   2. **La cadena vacía cuenta como "sin foto".** `product_images.url` es
 *      NOT NULL pero admite `''` (comprobado), y el renderizador público la
 *      trata como ausencia (`resolveImageUrl` es `if (!path) return null`).
 *      Si el detector contara filas en vez de imágenes utilizables, ese
 *      producto se escaparía mostrando un recuadro gris al cliente.
 *   3. **El recuento y la lista salen del mismo predicado** (lección de 5B).
 *   4. **No lo ve quien no debe**: anon y autenticado sin rol.
 *
 * No hay ninguna escritura nueva en este incremento: todo lo de abajo es
 * lectura, salvo el montaje y el desmontaje de los fixtures.
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    range: response.headers.get("content-range"),
  };
}

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `nofoto-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Nf-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin NoFoto" }),
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

const PFX = "zz-nofoto";

/**
 * EL PREDICADO, escrito una sola vez.
 *
 * Es exactamente el que construye `withoutImageQuery` en
 * `lib/data/admin/catalog.ts`. Si alguien cambia uno sin el otro, estos tests
 * dejan de proteger lo que la aplicación hace de verdad — por eso el E2E sobre
 * el build servido comprueba además la ruta real.
 */
const PREDICATE =
  "status=eq.active&deleted_at=is.null&product_images.url=neq.&product_images=is.null";

const scoped = (marketId: string) =>
  `products?select=id,name,slug,product_images!left(id)&market_id=eq.${marketId}&${PREDICATE}&slug=like.${PFX}*&order=name`;

let admin: TestUser;
let plainUser: TestUser;
let categoryId = "";
const ids: Record<string, string> = {};

/** Nace en borrador, recibe variante activa y solo entonces se publica:
 *  `enforce_publishable_product` RECHAZA pasar a `active` sin variante activa
 *  (comprobado). Un producto publicado SIEMPRE tiene variante activa. */
async function makeProduct(
  key: string,
  status: string,
  imageUrls: string[],
  deletedAt: string | null = null,
): Promise<string> {
  const slug = `${PFX}-${key.toLowerCase()}`;
  const { body: p } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: categoryId,
      name: `ZZ ${key}`,
      slug,
      status: "draft",
    }),
  });
  const id = (p as { id: string }[])[0].id;

  const variant = await db("product_variants", {
    method: "POST",
    body: JSON.stringify({
      product_id: id,
      sku: `${slug}-SKU`.toUpperCase(),
      price: 10,
      stock: 3,
      is_active: true,
    }),
  });
  assert.ok(variant.status < 300, JSON.stringify(variant.body));

  for (const url of imageUrls) {
    const image = await db("product_images", {
      method: "POST",
      body: JSON.stringify({ product_id: id, url, alt_text: "alt" }),
    });
    assert.ok(image.status < 300, JSON.stringify(image.body));
  }

  const patch = await db(`products?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, deleted_at: deletedAt }),
  });
  assert.ok(patch.status < 300, JSON.stringify(patch.body));

  ids[key] = id;
  return id;
}

async function cleanup() {
  if (!env) return;
  const { body: products } = await db(`products?slug=like.${PFX}*&select=id`);
  for (const p of (products ?? []) as { id: string }[]) {
    await db(`admin_change_log?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`product_images?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${p.id}`, { method: "DELETE" });
    await db(`products?id=eq.${p.id}`, { method: "DELETE" });
  }
  await db(`categories?slug=like.${PFX}*`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();
  admin = await createUser(true);
  plainUser = await createUser(false);

  const { body } = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ nofoto",
      slug: `${PFX}-cat`,
      sort_order: 987,
    }),
  });
  categoryId = (body as { id: string }[])[0].id;

  // El escenario completo, montado una sola vez.
  await makeProduct("ConFoto", "active", ["a/1.webp"]);
  await makeProduct("DosFotos", "active", ["a/1.webp", "a/2.webp"]);
  await makeProduct("SinFoto", "active", []);
  await makeProduct("UrlVacia", "active", [""]);
  await makeProduct("Borrador", "draft", []);
  await makeProduct("Archivado", "archived", []);
  await makeProduct("Borrado", "active", [], new Date().toISOString());
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [admin, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("publicados sin foto · el predicado", { skip }, () => {
  test("detecta exactamente los dos que no pueden pintar nada", async () => {
    const { body } = await as(admin.token, scoped("ES"));
    const names = (body as { name: string }[]).map((r) => r.name).sort();

    assert.deepEqual(
      names,
      ["ZZ SinFoto", "ZZ UrlVacia"],
      `detectados: ${JSON.stringify(names)}`,
    );
  });

  test("un producto CON foto no aparece, y con dos tampoco", async () => {
    const { body } = await as(admin.token, scoped("ES"));
    const names = (body as { name: string }[]).map((r) => r.name);
    assert.ok(!names.includes("ZZ ConFoto"), "una imagen basta");
    assert.ok(!names.includes("ZZ DosFotos"), "varias imágenes tampoco lo marcan");
  });

  test("borrador, archivado y borrado lógico NO aparecen aunque no tengan foto", async () => {
    const { body } = await as(admin.token, scoped("ES"));
    const names = (body as { name: string }[]).map((r) => r.name);
    for (const excluded of ["ZZ Borrador", "ZZ Archivado", "ZZ Borrado"]) {
      assert.ok(!names.includes(excluded), `${excluded} no está publicado`);
    }
  });

  test("una fila de imagen con url VACÍA cuenta como sin foto", async () => {
    // El renderizador público hace `if (!path) return null` y cae a MockImage:
    // esa fila no pinta nada, así que contarla como "tiene imagen" escondería
    // un producto que el cliente ve gris.
    const { body: rows } = await db(
      `product_images?product_id=eq.${ids.UrlVacia}&select=url`,
    );
    assert.equal((rows as { url: string }[]).length, 1, "la fila existe");
    assert.equal((rows as { url: string }[])[0].url, "", "y su url está vacía");

    const { body } = await as(admin.token, scoped("ES"));
    const names = (body as { name: string }[]).map((r) => r.name);
    assert.ok(names.includes("ZZ UrlVacia"), "debe detectarse pese a tener fila");
  });

  test("añadir una foto lo saca de la lista, y quitarla lo devuelve", async () => {
    const { body: img } = await db("product_images", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_id: ids.SinFoto,
        url: "reparado/1.webp",
        alt_text: "alt",
      }),
    });
    const imageId = (img as { id: string }[])[0].id;

    let { body } = await as(admin.token, scoped("ES"));
    assert.ok(
      !(body as { name: string }[]).map((r) => r.name).includes("ZZ SinFoto"),
      "con foto ya no debe salir",
    );

    await db(`product_images?id=eq.${imageId}`, { method: "DELETE" });

    ({ body } = await as(admin.token, scoped("ES")));
    assert.ok(
      (body as { name: string }[]).map((r) => r.name).includes("ZZ SinFoto"),
      "al quitarla vuelve a salir",
    );
  });
});

describe("publicados sin foto · recuento", { skip }, () => {
  test("el recuento con head no trae filas y coincide con la lista", async () => {
    const counted = await fetch(
      `${env!.url}/rest/v1/products?select=id,product_images!left(id)&market_id=eq.ES&${PREDICATE}&slug=like.${PFX}*`,
      {
        headers: {
          apikey: env!.anon,
          Authorization: `Bearer ${admin.token}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    );
    const range = counted.headers.get("content-range");
    const total = Number.parseInt((range ?? "").split("/")[1] ?? "", 10);

    const { body } = await as(admin.token, scoped("ES"));
    assert.equal(total, (body as unknown[]).length, `range=${range}`);
    assert.equal(total, 2);
  });

  test("no cuenta los de OTRO mercado", async () => {
    // Los fixtures son de ES; pedirlos como CO debe dar cero. El aislamiento no
    // es nuevo: sale del `market_id` que ya filtran todas las consultas del
    // panel, no de una regla inventada para este detector.
    const { body } = await as(admin.token, scoped("CO"));
    assert.deepEqual(body, []);
  });
});

describe("publicados sin foto · quién puede verlo", { skip }, () => {
  /*
    HONESTIDAD SOBRE QUÉ PROTEGE ESTO, comprobado y no supuesto.

    Un producto PUBLICADO es, por definición, el escaparate: `anon` lo lee por
    la policy `public_read_active_products`, y que no tenga foto se ve entrando
    en la tienda. **Este detector no expone ni un dato nuevo**, solo ahorra
    mirarlo a mano.

    La frontera real, y es la que se prueba aquí, es otra: `anon` no ve
    borradores ni archivados, y la RUTA del panel está cerrada (E2E). El primer
    intento de este test afirmaba que `anon` no obtenía nada; era falso y el
    test lo cazó.
  */
  test("ANON no ve los NO publicados, que es la frontera de verdad", async () => {
    const { body } = await as(
      null,
      `products?select=name,status&slug=like.${PFX}*&order=name`,
    );
    const visible = (body as { name: string; status: string }[]).map((r) => r.name);

    for (const hidden of ["ZZ Borrador", "ZZ Archivado", "ZZ Borrado"]) {
      assert.ok(!visible.includes(hidden), `${hidden} no puede ser público`);
    }
    // CONTROL POSITIVO: los publicados sí, porque son la tienda.
    assert.ok(visible.includes("ZZ SinFoto"), "un producto publicado es público");
  });

  test("un AUTENTICADO SIN rol de admin ve lo mismo que anon, ni un producto más", async () => {
    const anon = await as(null, `products?select=name&slug=like.${PFX}*&order=name`);
    const plain = await as(
      plainUser.token,
      `products?select=name&slug=like.${PFX}*&order=name`,
    );
    assert.deepEqual(plain.body, anon.body, "tener sesión no da acceso al catálogo");
  });

  test("CONTROL POSITIVO: solo el admin ve el catálogo completo", async () => {
    const plain = await as(
      plainUser.token,
      `products?select=name&slug=like.${PFX}*&order=name`,
    );
    const forAdmin = await as(
      admin.token,
      `products?select=name&slug=like.${PFX}*&order=name`,
    );
    assert.equal((forAdmin.body as unknown[]).length, 7, "el admin ve los siete fixtures");
    assert.ok(
      (plain.body as unknown[]).length < (forAdmin.body as unknown[]).length,
      "y el no-admin, menos",
    );

    // Y el detector, para el admin, devuelve exactamente los dos.
    const { body } = await as(admin.token, scoped("ES"));
    assert.equal((body as unknown[]).length, 2);
  });
});
