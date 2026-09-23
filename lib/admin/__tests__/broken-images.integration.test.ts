import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Detector de FOTOS ROTAS (incremento 10) contra el Supabase REAL.
 *
 * "Foto rota" = la fila de `product_images` existe, pero el objeto al que
 * apunta NO está en el bucket `products`. Es el estado exacto en el que estaba
 * esta tienda: cuatro filas sembradas, cero objetos subidos, `/_next/image`
 * devolviendo 400 y el detector de P2 informando —con razón y sin utilidad— de
 * que todos los productos tenían foto.
 *
 * QUÉ SE PRUEBA, y por qué importa cada caso:
 *
 *   1. **El predicado, con control positivo Y negativo.** Una fila con objeto
 *      inexistente aparece; una con objeto REAL no aparece; y si ese objeto se
 *      borra, la fila vuelve a aparecer. Sin el control positivo, un detector
 *      que devolviera todo siempre pasaría igual.
 *   2. **La cadena vacía NO se cuenta aquí.** Es territorio de P2, y juntarlas
 *      volvería a mezclar dos problemas que P2 separó a propósito.
 *   3. **No lo ve quien no debe.** La función es SECURITY DEFINER —tiene que
 *      serlo para leer `storage.objects`—, así que la puerta `is_admin()` va
 *      DENTRO del WHERE: un no-admin recibe cero filas, no un error.
 *   4. **Aislamiento de mercado** (DEC-035): con el mercado apagado, cero.
 *
 * La única escritura en Storage es un PNG de 1×1 que se borra en el `after`.
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

const SLUG = "zz-i10t";
const PFX = "ZZ I10T";
/** PNG 1×1 transparente, en binario: el objeto tiene que existir de verdad. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d4944415478da63f8ffff3f0005fe02fea735c0890000000049454e44ae426082",
  "hex",
);

function svc(extra: Record<string, string> = {}) {
  return {
    apikey: env!.service,
    Authorization: `Bearer ${env!.service}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest(
  path: string,
  headers: Record<string, string>,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...((init.headers as Record<string, string>) ?? {}) },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function callDetector(headers: Record<string, string>, marketId: string) {
  return rest("rpc/admin_products_with_broken_images", headers, {
    method: "POST",
    body: JSON.stringify({ p_market_id: marketId }),
  });
}

async function makeUser(role: "admin" | null) {
  const email = `i10t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@yi-test.local`;
  const password = `I10t-${Math.random().toString(36).slice(2)}-D5`;
  const created = await fetch(`${env!.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: svc(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const id = (await created.json()).id as string;
  if (role) {
    await rest("profiles", svc(), {
      method: "POST",
      body: JSON.stringify({ id, role, full_name: "I10T" }),
    });
  }
  const token = await fetch(`${env!.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const access = (await token.json()).access_token as string;
  return {
    id,
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
    },
  };
}

const anonHeaders = () => ({
  apikey: env!.anon,
  Authorization: `Bearer ${env!.anon}`,
  "Content-Type": "application/json",
});

const OBJECT_OK = `${SLUG}-prod/existe.png`;
const OBJECT_MISSING = `${SLUG}-prod/no-existe.webp`;

let productId = "";
let adminHeaders: Record<string, string> = {};
let plainHeaders: Record<string, string> = {};
const users: string[] = [];

async function storagePut() {
  return fetch(`${env!.url}/storage/v1/object/products/${OBJECT_OK}`, {
    method: "POST",
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "image/png",
    },
    body: PNG,
  });
}

async function storageDelete() {
  return fetch(`${env!.url}/storage/v1/object/products/${OBJECT_OK}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

async function teardown() {
  const { body: products } = await rest(
    `products?slug=like.${SLUG}*&select=id`,
    svc(),
  );
  for (const product of (products as { id: string }[]) ?? []) {
    await rest(`product_images?product_id=eq.${product.id}`, svc(), { method: "DELETE" });
    await rest(`product_variants?product_id=eq.${product.id}`, svc(), { method: "DELETE" });
    await rest(`admin_change_log?product_id=eq.${product.id}`, svc(), { method: "DELETE" });
    await rest(`products?id=eq.${product.id}`, svc(), { method: "DELETE" });
  }
  await rest(`categories?slug=like.${SLUG}*`, svc(), { method: "DELETE" });
  for (const id of users) {
    await rest(`profiles?id=eq.${id}`, svc(), { method: "DELETE" });
    await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: svc(),
    });
  }
  users.length = 0;
  await storageDelete();
}

describe("detector de fotos rotas · Supabase real", { skip }, () => {
  before(async () => {
    await teardown();

    const admin = await makeUser("admin");
    const plain = await makeUser(null);
    users.push(admin.id, plain.id);
    adminHeaders = admin.headers;
    plainHeaders = plain.headers;

    const { body: category } = await rest("categories", svc({ Prefer: "return=representation" }), {
      method: "POST",
      body: JSON.stringify({
        market_id: "ES",
        name: `${PFX} cat`,
        slug: `${SLUG}-cat`,
        sort_order: 983,
      }),
    });
    const { body: product } = await rest("products", svc({ Prefer: "return=representation" }), {
      method: "POST",
      body: JSON.stringify({
        market_id: "ES",
        category_id: (category as { id: string }[])[0].id,
        name: `${PFX} producto`,
        slug: `${SLUG}-prod`,
        status: "draft",
      }),
    });
    productId = (product as { id: string }[])[0].id;

    // (a) fila cuyo objeto NO existe
    await rest("product_images", svc(), {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        url: OBJECT_MISSING,
        alt_text: "rota a propósito",
        is_primary: true,
        sort_order: 0,
      }),
    });
    // (b) fila con url VACÍA: es territorio de P2, no de este detector
    await rest("product_images", svc(), {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        url: "",
        alt_text: "vacía",
        is_primary: false,
        sort_order: 1,
      }),
    });
  });

  after(teardown);

  test("la fila cuyo objeto no existe aparece", async () => {
    const { status, body } = await callDetector(adminHeaders, "ES");
    assert.equal(status, 200);
    const rows = body as { image_url: string }[];
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].image_url, OBJECT_MISSING);
  });

  test("la url VACÍA no se cuenta aquí: eso es P2", async () => {
    const { body } = await callDetector(adminHeaders, "ES");
    const rows = body as { image_url: string }[];
    assert.ok(
      rows.every((row) => row.image_url.trim() !== ""),
      "se ha colado una fila con url vacía",
    );
  });

  test("CONTROL POSITIVO: si el objeto EXISTE, la fila no se reporta", async () => {
    const uploaded = await storagePut();
    assert.equal(uploaded.status, 200, `no se pudo subir el objeto: ${uploaded.status}`);

    await rest("product_images", svc(), {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        url: OBJECT_OK,
        alt_text: "existe de verdad",
        is_primary: false,
        sort_order: 2,
      }),
    });

    const { body } = await callDetector(adminHeaders, "ES");
    const urls = (body as { image_url: string }[]).map((row) => row.image_url);
    assert.deepEqual(urls, [OBJECT_MISSING], "el detector devuelve filas que sí existen");
  });

  test("y si ese objeto se borra, su fila vuelve a aparecer", async () => {
    // Es la prueba de que mira Storage de verdad y no una marca en la fila.
    await storageDelete();
    const { body } = await callDetector(adminHeaders, "ES");
    const urls = (body as { image_url: string }[]).map((row) => row.image_url).sort();
    assert.deepEqual(urls, [OBJECT_OK, OBJECT_MISSING].sort());
  });

  test("anónimo no obtiene datos", async () => {
    const { status, body } = await callDetector(anonHeaders(), "ES");
    const empty = status !== 200 || (Array.isArray(body) && body.length === 0);
    assert.ok(empty, `anon ha recibido: ${JSON.stringify(body).slice(0, 200)}`);
  });

  test("autenticado sin rol recibe cero filas, no un error", async () => {
    const { status, body } = await callDetector(plainHeaders, "ES");
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  test("mercado inactivo: cero filas (DEC-035)", async () => {
    const { status, body } = await callDetector(adminHeaders, "CO");
    assert.equal(status, 200);
    assert.deepEqual(body, []);
  });

  test("el seed ya no siembra filas de product_images", async () => {
    // La limpieza de la 0037 resuelve el presente; esto impide que vuelva.
    const seed = fs.readFileSync("supabase/seed/04_products_es.sql", "utf8");
    assert.doesNotMatch(
      seed,
      /insert into public\.product_images/i,
      "el seed volvería a crear filas para objetos que nunca sube",
    );
  });
});
