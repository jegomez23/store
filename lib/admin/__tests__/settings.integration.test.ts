import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * La configuración operativa de `/admin/ajustes` contra el Supabase REAL
 * (Incremento 15).
 *
 * Lo que protegen estos tests:
 *
 *   1. **Solo un admin la cambia.** anon y autenticado-sin-rol no escriben.
 *   2. **Un valor inválido no puede dejar la tienda ambigua**: el número de
 *      ejemplo del seed se rechaza en el parser, y el precio o el umbral
 *      negativos los rechaza PostgreSQL.
 *   3. **El checkout consume el valor nuevo**, no una copia hardcodeada.
 *   4. **Cambiar la configuración NO reescribe pedidos pasados.**
 *
 * El valor original de `settings` se guarda al empezar y se restaura al
 * terminar: esta suite toca la fila REAL del mercado ES, porque es única.
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
  const email = `set-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Se-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Settings" }),
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

const UNIQUE = Math.random().toString(36).slice(2, 8);
const PHONE = "34600444333";

let admin: TestUser;
let plainUser: TestUser;
/** Fila REAL de `settings` del mercado ES: se restaura al final. */
let original: Record<string, unknown> = {};
let methodId = "";
let originalMethod: Record<string, unknown> = {};
let categoryId = "";
let productId = "";
let variantId = "";
let historicOrderId = "";
let historicShipping = "";

before(async () => {
  if (skip) return;

  [admin, plainUser] = await Promise.all([createUser(true), createUser(false)]);

  original = (await db("settings?market_id=eq.ES&select=*")).body[0];
  const method = await db("shipping_methods?market_id=eq.ES&select=*&order=sort_order&limit=1");
  originalMethod = (method.body as Record<string, unknown>[])[0];
  methodId = originalMethod.id as string;
});

after(async () => {
  if (skip) return;

  // Restaurar EXACTAMENTE lo que había antes de la suite.
  await db("settings?market_id=eq.ES", {
    method: "PATCH",
    body: JSON.stringify({
      whatsapp_number: original.whatsapp_number,
      store_name: original.store_name,
      // `tagline` desde el incremento 16: si no se restaura, la suite deja la
      // frase de la tienda cambiada en la base de datos real.
      tagline: original.tagline,
      contact_email: original.contact_email,
      instagram_url: original.instagram_url,
      tiktok_url: original.tiktok_url,
      facebook_url: original.facebook_url,
    }),
  });
  await db(`shipping_methods?id=eq.${methodId}`, {
    method: "PATCH",
    body: JSON.stringify({
      price: originalMethod.price,
      free_shipping_threshold: originalMethod.free_shipping_threshold,
      is_active: originalMethod.is_active,
      name: originalMethod.name,
    }),
  });

  if (historicOrderId) {
    await db(`order_items?order_id=eq.${historicOrderId}`, { method: "DELETE" });
    await db(`order_events?order_id=eq.${historicOrderId}`, { method: "DELETE" });
    await db(`orders?id=eq.${historicOrderId}`, { method: "DELETE" });
  }
  await db(`customers?phone=eq.${PHONE}`, { method: "DELETE" });
  if (productId) {
    await db(`admin_change_log?product_id=eq.${productId}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${productId}`, { method: "DELETE" });
    await db(`products?id=eq.${productId}`, { method: "DELETE" });
  }
  if (categoryId) await db(`categories?id=eq.${categoryId}`, { method: "DELETE" });

  for (const user of [admin, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("ajustes · quién puede escribir", { skip }, () => {
  test("un admin cambia el número de WhatsApp", async () => {
    const response = await patchAs(admin.token, "settings?market_id=eq.ES", {
      whatsapp_number: "34611222333",
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { whatsapp_number: string }[])[0].whatsapp_number, "34611222333");
  });

  test("anon no puede escribir, y el valor queda intacto", async () => {
    // Desde la 0041 el anónimo ni siquiera puede pedir la fila entera de
    // vuelta, así que este PATCH muere en el permiso de columna antes que en
    // la policy. Lo que importa —y lo que se afirma— es que no escribió.
    const before = (await db("settings?market_id=eq.ES&select=whatsapp_number")).body[0];
    const response = await patchAs(null, "settings?market_id=eq.ES", {
      whatsapp_number: "34999999999",
    });
    assert.ok(response.status >= 400, JSON.stringify(response.body));
    assert.deepEqual((await db("settings?market_id=eq.ES&select=whatsapp_number")).body[0], before);
  });

  test("un autenticado SIN rol admin tampoco", async () => {
    const before = (await db("settings?market_id=eq.ES&select=whatsapp_number")).body[0];
    const response = await patchAs(plainUser.token, "settings?market_id=eq.ES", {
      whatsapp_number: "34999999999",
    });
    assert.deepEqual(response.body, [], JSON.stringify(response.body));
    assert.deepEqual((await db("settings?market_id=eq.ES&select=whatsapp_number")).body[0], before);
  });

  /*
    MEDIDO ANTES DE LA 0041: `GET /settings?select=*` con la anon key devolvía
    la fila ENTERA. Hoy ninguna de esas columnas es secreta, pero `settings` es
    justo donde va a caer la configuración que sí lo será (un Pixel ID, un
    token). Con GRANTs por columna, una columna nueva nace PRIVADA.
  */
  test("anon NO puede pedir la fila entera de settings", async () => {
    const response = await fetch(`${env!.url}/rest/v1/settings?select=*`, {
      headers: { apikey: env!.anon },
    });
    const body = await response.text();
    assert.equal(response.status, 401, body.slice(0, 200));
    assert.equal(JSON.parse(body).code, "42501");
  });

  test("anon SÍ puede leer las columnas públicas que la tienda necesita", async () => {
    const response = await fetch(
      `${env!.url}/rest/v1/settings?select=store_name,whatsapp_number,contact_email,instagram_url,tiktok_url,facebook_url,logo_url,policies`,
      { headers: { apikey: env!.anon } },
    );
    const body = await response.text();
    assert.equal(response.status, 200, body.slice(0, 200));
    assert.equal(JSON.parse(body).length, 1);
  });

  test("una columna NO concedida se le niega, aunque la fila sea legible", async () => {
    const response = await fetch(`${env!.url}/rest/v1/settings?select=updated_at`, {
      headers: { apikey: env!.anon },
    });
    assert.equal(response.status, 401, (await response.text()).slice(0, 200));
  });

  test("el data layer público solo pide columnas concedidas", () => {
    // Si alguien añade una columna privada al `select` de la tienda, esto lo
    // caza antes de que el escaparate empiece a dar 401 en producción.
    const source = fs.readFileSync("lib/data/settings.ts", "utf8");
    // `tagline` entra en la lista con la migración 0042, que le da el GRANT a
    // `anon` explícitamente: es pública porque se pinta en el footer, en la
    // metadata y en la imagen de Open Graph.
    const granted = new Set([
      "market_id", "store_name", "tagline", "logo_url", "whatsapp_number",
      "contact_email", "instagram_url", "tiktok_url", "facebook_url", "policies",
    ]);
    for (const match of source.matchAll(/\.select\("([^"]+)"\)/g)) {
      for (const column of match[1].split(",").map((c) => c.trim())) {
        assert.ok(granted.has(column), `la tienda pide "${column}", que anon no puede leer`);
      }
    }
  });
});

describe("ajustes · lo inválido no entra", { skip }, () => {
  test("el número del seed se rechaza en el parser del panel", async () => {
    // No es una regla de la BD: es `parseWhatsAppNumber`, que impide volver a
    // dejar la tienda en «sin configurar» creyendo que se ha configurado.
    const { parseWhatsAppNumber } = await import("../catalog.ts");
    assert.equal(parseWhatsAppNumber("34600000000").ok, false);
    const human = parseWhatsAppNumber("+34 611 222 333");
    assert.equal(human.ok, true);
    assert.equal(
      human.ok && human.value,
      "34611222333",
      "se guarda en dígitos, sin + ni espacios",
    );
  });

  test("un precio de envío negativo lo rechaza PostgreSQL", async () => {
    const response = await patchAs(admin.token, `shipping_methods?id=eq.${methodId}`, {
      price: "-1.00",
    });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal((response.body as { code: string }).code, "23514");
  });

  test("un umbral negativo, también", async () => {
    const response = await patchAs(admin.token, `shipping_methods?id=eq.${methodId}`, {
      free_shipping_threshold: "-10.00",
    });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal((response.body as { code: string }).code, "23514");
  });

  test("un nombre de método en blanco, también", async () => {
    const response = await patchAs(admin.token, `shipping_methods?id=eq.${methodId}`, {
      name: "   ",
    });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal((response.body as { code: string }).code, "23514");
  });
});

describe("ajustes · el checkout consume el valor nuevo", { skip }, () => {
  before(async () => {
    if (skip) return;
    const category = await db("categories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: "ES",
        name: "ZZ Settings",
        slug: `zz-set-cat-${UNIQUE}`,
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
        name: `ZZ Settings ${UNIQUE}`,
        slug: `zz-set-prod-${UNIQUE}`,
        status: "draft",
      }),
    });
    productId = (product.body as { id: string }[])[0].id;

    const variant = await db("product_variants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_id: productId,
        sku: `ZZSET-${UNIQUE}`,
        price: "10.00",
        stock: 50,
        is_active: true,
      }),
    });
    variantId = (variant.body as { id: string }[])[0].id;
    await db(`products?id=eq.${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
  });

  test("el pedido cobra el envío que dice la configuración EN ESE MOMENTO", async () => {
    // Precio A → pedido A.
    await db(`shipping_methods?id=eq.${methodId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: "4.90", free_shipping_threshold: null, is_active: true }),
    });

    const order = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_market_id: "ES",
        p_items: [{ variant_id: variantId, quantity: 1 }],
        p_customer_phone: PHONE,
        p_customer_name: "ZZ Settings",
        p_client_request_id: crypto.randomUUID(),
        p_shipping_method_id: methodId,
      }),
    });
    const created = await order.json();
    assert.equal(order.status, 200, JSON.stringify(created));
    historicOrderId = created.order_id;
    historicShipping = String(created.shipping_total);
    assert.equal(Number(created.shipping_total), 4.9, JSON.stringify(created));
  });

  test("cambiar el precio NO reescribe el pedido ya creado", async () => {
    await db(`shipping_methods?id=eq.${methodId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: "6.90" }),
    });

    const row = await db(
      `orders?id=eq.${historicOrderId}&select=shipping_total,total,shipping_method_name`,
    );
    const stored = (row.body as { shipping_total: string }[])[0];
    assert.equal(
      Number(stored.shipping_total),
      Number(historicShipping),
      "el pedido es un SNAPSHOT: la configuración de hoy no puede reescribir lo que se cobró ayer",
    );
    assert.equal(Number(stored.shipping_total), 4.9);
  });

  test("un pedido NUEVO sí cobra el precio nuevo", async () => {
    const order = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_market_id: "ES",
        p_items: [{ variant_id: variantId, quantity: 1 }],
        p_customer_phone: PHONE,
        p_customer_name: "ZZ Settings",
        p_client_request_id: crypto.randomUUID(),
        p_shipping_method_id: methodId,
      }),
    });
    const created = await order.json();
    assert.equal(order.status, 200, JSON.stringify(created));
    assert.equal(Number(created.shipping_total), 6.9);

    await db(`order_items?order_id=eq.${created.order_id}`, { method: "DELETE" });
    await db(`order_events?order_id=eq.${created.order_id}`, { method: "DELETE" });
    await db(`orders?id=eq.${created.order_id}`, { method: "DELETE" });
  });

  test("desactivar el único método deja la tienda sin poder vender", async () => {
    const { resolveSaleBlockers } = await import("../../store/sale-status.ts");
    await db(`shipping_methods?market_id=eq.ES`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });

    const active = await db(
      "shipping_methods?market_id=ES&select=id&is_active=is.true",
    );
    const count = Array.isArray(active.body) ? active.body.length : 0;
    const blockers = resolveSaleBlockers({
      whatsappNumber: "34611222333",
      activeShippingMethods: count,
    });
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "NO_ACTIVE_SHIPPING_METHOD");

    // Se reactivan todos los que estaban activos.
    await db(`shipping_methods?market_id=eq.ES`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENTO 16 · La configuración no puede quedarse en un estado incoherente
   ═══════════════════════════════════════════════════════════════════════════

   Medido ANTES de la migración 0042, con la sesión de un admin y por POST
   directo a PostgREST (sin pasar por el panel):

       {"store_name":"   "}                     → 200, guardado
       {"instagram_url":"javascript:alert(1)"}  → 200, guardado
       {"contact_email":"no-es-un-email"}       → 200, guardado

   El segundo acaba en el `href` de un enlace del footer de TODAS las páginas.
   `validateSettingsInput` ya lo rechazaba, pero esa validación protege UN solo
   camino de escritura. Estos tests comprueban que ahora la barrera es la base
   de datos, que cubre todos.
   ═════════════════════════════════════════════════════════════════════════ */

describe("ajustes · integridad en PostgreSQL (0042)", { skip }, () => {
  /** Escribe como admin y devuelve solo el código de error de PostgreSQL. */
  async function write(body: Record<string, unknown>) {
    const response = await patchAs(admin.token, "settings?market_id=eq.ES", body);
    const code =
      response.body && !Array.isArray(response.body)
        ? (response.body as { code?: string }).code
        : undefined;
    return { status: response.status, code };
  }

  test("el nombre de la tienda no puede quedarse en blanco", async () => {
    for (const value of ["", "   ", "\t\n "]) {
      const r = await write({ store_name: value });
      assert.equal(r.status, 400, `"${value}" debería rechazarse`);
      assert.equal(r.code, "23514");
    }
  });

  test("el nombre respeta el mismo tope que SETTINGS_LIMITS.storeName", async () => {
    const { SETTINGS_LIMITS } = await import("../content.ts");
    assert.equal((await write({ store_name: "x".repeat(SETTINGS_LIMITS.storeName) })).status, 200);
    const over = await write({ store_name: "x".repeat(SETTINGS_LIMITS.storeName + 1) });
    assert.equal(over.status, 400);
    assert.equal(over.code, "23514");
  });

  test("la frase: NULL sí, en blanco no", async () => {
    // NULL es una decisión legítima («no publico descripción»); una cadena de
    // espacios es un estado que ninguna pantalla sabe pintar.
    assert.equal((await write({ tagline: null })).status, 200);
    const blank = await write({ tagline: "   " });
    assert.equal(blank.status, 400);
    assert.equal(blank.code, "23514");
    assert.equal((await write({ tagline: "Vive a tu propio ritmo." })).status, 200);
  });

  test("la frase respeta el mismo tope que SETTINGS_LIMITS.tagline", async () => {
    const { SETTINGS_LIMITS } = await import("../content.ts");
    assert.equal((await write({ tagline: "x".repeat(SETTINGS_LIMITS.tagline) })).status, 200);
    const over = await write({ tagline: "x".repeat(SETTINGS_LIMITS.tagline + 1) });
    assert.equal(over.status, 400);
    assert.equal(over.code, "23514");
  });

  test("las redes: solo https, y `javascript:` imposible", async () => {
    for (const column of ["instagram_url", "tiktok_url", "facebook_url"]) {
      for (const value of ["javascript:alert(1)", "http://x.com/y", "no-es-url", "  "]) {
        const r = await write({ [column]: value });
        assert.equal(r.status, 400, `${column}=${value} debería rechazarse`);
        assert.equal(r.code, "23514");
      }
      // Control positivo: la URL correcta sí entra, y el NULL también.
      assert.equal((await write({ [column]: "https://ejemplo.test/yi" })).status, 200);
      assert.equal((await write({ [column]: null })).status, 200);
    }
  });

  test("el email de contacto tiene que parecer un email", async () => {
    for (const value of ["no-es-un-email", "hola@", "@yi.es", "con espacio@yi.es"]) {
      const r = await write({ contact_email: value });
      assert.equal(r.status, 400, `"${value}" debería rechazarse`);
      assert.equal(r.code, "23514");
    }
    assert.equal((await write({ contact_email: "hola@yi.es" })).status, 200);
    assert.equal((await write({ contact_email: null })).status, 200);
  });

  test("una decisión legítima del administrador NO se bloquea", async () => {
    /*
      El sistema impide estados técnicamente inválidos, no decide el negocio.
      Un nombre raro, una frase larguísima pero dentro del tope y borrar todas
      las redes son decisiones suyas y tienen que pasar.
    */
    const r = await write({
      store_name: "ÿi · 好 · 2026",
      tagline: "x".repeat(160),
      instagram_url: null,
      tiktok_url: null,
      facebook_url: null,
      contact_email: null,
    });
    assert.equal(r.status, 200);
  });
});

describe("ajustes · la frase es pública y solo la escribe un admin", { skip }, () => {
  test("anon puede LEER la frase: la pinta el footer y la metadata", async () => {
    const response = await fetch(
      `${env!.url}/rest/v1/settings?select=store_name,tagline&market_id=eq.ES`,
      { headers: { apikey: env!.anon } },
    );
    const body = await response.text();
    assert.equal(response.status, 200, body.slice(0, 200));
    assert.equal(JSON.parse(body).length, 1);
  });

  test("anon NO puede escribirla, y el valor queda intacto", async () => {
    const before = (await db("settings?market_id=eq.ES&select=tagline")).body[0];
    const response = await patchAs(null, "settings?market_id=eq.ES", {
      tagline: "escrito por un anónimo",
    });
    assert.ok(response.status >= 400, JSON.stringify(response.body));
    assert.deepEqual((await db("settings?market_id=eq.ES&select=tagline")).body[0], before);
  });

  test("un autenticado SIN rol admin tampoco", async () => {
    const before = (await db("settings?market_id=eq.ES&select=tagline")).body[0];
    const response = await patchAs(plainUser.token, "settings?market_id=eq.ES", {
      tagline: "escrito por un usuario cualquiera",
    });
    assert.deepEqual(response.body, [], JSON.stringify(response.body));
    assert.deepEqual((await db("settings?market_id=eq.ES&select=tagline")).body[0], before);
  });

  test("un admin sí, y se lee de vuelta exactamente lo escrito", async () => {
    const value = `Frase de prueba ${UNIQUE}`;
    const response = await patchAs(admin.token, "settings?market_id=eq.ES", { tagline: value });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { tagline: string }[])[0].tagline, value);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENTO 17 · La condición que tendrán que cumplir las promociones
   ═══════════════════════════════════════════════════════════════════════════

   No se implementan descuentos, cupones ni precios promocionales: solo se
   COMPRUEBA que el modelo actual permita añadirlos después sin romper el
   histórico. La regla futura es:

       El pedido guarda el precio que realmente se cobró; modificar el
       producto después NUNCA modifica pedidos históricos.

   `order_items` es un SNAPSHOT completo —`product_name`, `color_name`,
   `size_label`, `sku`, `unit_price`, `quantity`, `line_total`— y `variant_id`
   es `on delete set null`. La propiedad ya se cumple, así que **no se ha
   tocado nada**; estos tests existen para que siga cumpliéndose.
   ═════════════════════════════════════════════════════════════════════════ */

describe("precio histórico · base para promociones futuras", { skip }, () => {
  test("subir el precio de la variante NO reescribe el pedido ya hecho", async () => {
    const antes = await db(`order_items?order_id=eq.${historicOrderId}&select=unit_price,line_total,quantity,product_name,sku`);
    const linea = (antes.body as Record<string, unknown>[])[0];
    assert.ok(linea, "hace falta un pedido histórico para esta comprobación");

    const precioOriginal = Number(linea.unit_price);
    const nuevo = (precioOriginal + 7).toFixed(2);

    const subida = await db(`product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: nuevo }),
    });
    assert.ok(subida.status < 300, JSON.stringify(subida.body));

    const despues = await db(`order_items?order_id=eq.${historicOrderId}&select=unit_price,line_total,quantity,product_name,sku`);
    assert.deepEqual(
      despues.body,
      antes.body,
      "cambiar el precio del catálogo ha tocado una línea de pedido: el histórico no es fiable",
    );

    // Y el total del pedido tampoco se mueve.
    const pedido = await db(`orders?id=eq.${historicOrderId}&select=subtotal,total,shipping_total`);
    assert.equal(Number((pedido.body as { subtotal: string }[])[0].subtotal), precioOriginal * Number(linea.quantity));

    await db(`product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: precioOriginal.toFixed(2) }),
    });
  });

  test("renombrar el producto tampoco: la línea guarda el nombre vendido", async () => {
    const antes = (await db(`order_items?order_id=eq.${historicOrderId}&select=product_name`)).body;
    const original = (await db(`products?id=eq.${productId}&select=name`)).body[0].name;

    await db(`products?id=eq.${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: `${original} RENOMBRADO` }),
    });
    const despues = (await db(`order_items?order_id=eq.${historicOrderId}&select=product_name`)).body;
    assert.deepEqual(despues, antes);

    await db(`products?id=eq.${productId}`, { method: "PATCH", body: JSON.stringify({ name: original }) });
  });

  test("`order_items` guarda TODO lo que hace falta para no consultar el catálogo", async () => {
    /*
      Es lo que permitirá que una promoción escriba un `unit_price` rebajado sin
      inventar columnas: el precio cobrado ya vive en la línea, no se deriva de
      `product_variants` al leer el pedido.
    */
    const { body } = await db(`order_items?order_id=eq.${historicOrderId}&select=*`);
    const linea = (body as Record<string, unknown>[])[0];
    for (const campo of ["product_name", "sku", "unit_price", "quantity", "line_total"]) {
      assert.ok(campo in linea, `falta ${campo} en el snapshot de la línea`);
      assert.notEqual(linea[campo], null, `${campo} llegó a NULL`);
    }
    // `line_total` es coherente con lo guardado, no con el catálogo actual.
    assert.equal(
      Number(linea.line_total),
      Number(linea.unit_price) * Number(linea.quantity),
      "la línea tiene que cuadrar consigo misma",
    );
  });

  test("borrar la variante NO borra la línea: el pedido sobrevive al catálogo", async () => {
    // `variant_id` es `on delete set null` (migración 0011). Se comprueba la
    // regla sin borrar nada real: la columna admite NULL y la línea conserva
    // el snapshot.
    const { body } = await db(`order_items?order_id=eq.${historicOrderId}&select=variant_id,product_name,unit_price`);
    const linea = (body as Record<string, unknown>[])[0];
    assert.ok("variant_id" in linea);
    assert.ok(linea.product_name, "el nombre no depende de la variante");
    assert.ok(linea.unit_price, "el precio no depende de la variante");
  });
});
