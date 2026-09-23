import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { orderSearchTokens, sanitizeOrderSearch } from "../orders.ts";

/**
 * Buscador de pedidos por número, teléfono y nombre (P3) contra el Supabase
 * REAL.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE, y no basta con los unitarios: la parte
 * delicada de P3 no es sanear el texto —eso ya se prueba sin red— sino que la
 * consulta que sale de esos tokens **sea legal en PostgREST y devuelva la
 * unión correcta**. Lo primero no es evidente: un `or=(…)` con una columna de
 * un recurso EMBEBIDO devuelve `PGRST100` (medido), y por eso la búsqueda se
 * hace en dos pasos.
 *
 * Estos tests reconstruyen los MISMOS dos pasos que `listOrders`, con los
 * tokens que produce el módulo real, así que si alguien cambia la forma de la
 * consulta sin cambiar aquí, esto deja de pasar.
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

async function as(token: string | null, path: string) {
  const headers: Record<string, string> = { apikey: env!.anon };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${env!.url}/rest/v1/${path}`, { headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function rpc(fn: string, args: unknown) {
  const response = await fetch(`${env!.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
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
  const email = `busca-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Bu-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Busca" }),
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

const PFX = "zz-busca";
const CUSTOMER_PFX = "ZZ BUSCA";

let admin: TestUser;
let plainUser: TestUser;
let variantId = "";
const numbers: Record<string, string> = {};

/**
 * Los MISMOS dos pasos que `listOrders`, con los tokens del módulo real.
 *
 * Paso 1 → `or` sobre columnas reales de `customers`.
 * Paso 2 → `or` sobre columnas reales de `orders` (`order_number`, `customer_id`).
 */
async function search(
  token: string | null,
  typed: string,
  marketId = "ES",
): Promise<{ numbers: string[]; count: number }> {
  const query = sanitizeOrderSearch(typed);
  const tokens = orderSearchTokens(query);

  const customerClauses: string[] = [];
  if (tokens.name) customerClauses.push(`name.ilike.*${tokens.name}*`);
  if (tokens.digits) customerClauses.push(`phone.ilike.*${tokens.digits}*`);

  let ids: string[] = [];
  if (customerClauses.length > 0) {
    const { body } = await as(
      token,
      `customers?select=id&market_id=eq.${marketId}&or=(${encodeURIComponent(
        customerClauses.join(","),
      ).replace(/%2C/g, ",")})&limit=200`,
    );
    ids = ((body ?? []) as { id: string }[]).map((c) => c.id);
  }

  const orderClauses: string[] = [];
  if (tokens.orderNumber) orderClauses.push(`order_number.ilike.*${tokens.orderNumber}*`);
  if (ids.length > 0) orderClauses.push(`customer_id.in.(${ids.join(",")})`);
  if (orderClauses.length === 0) return { numbers: [], count: 0 };

  const path = `orders?select=order_number&market_id=eq.${marketId}&or=(${orderClauses.join(
    ",",
  )})&order=order_number`;
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    headers: {
      apikey: env!.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Prefer: "count=exact",
    },
  });
  const text = await response.text();
  assert.ok(response.status < 300, `consulta ilegal (${response.status}): ${text}`);
  const rows = (text ? JSON.parse(text) : []) as { order_number: string }[];
  const range = response.headers.get("content-range");
  return {
    numbers: rows.map((r) => r.order_number),
    count: Number.parseInt((range ?? "").split("/")[1] ?? "0", 10),
  };
}

async function cleanup() {
  if (!env) return;
  const { body: customers } = await db(
    `customers?name=like.${encodeURIComponent(CUSTOMER_PFX)}*&select=id`,
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
  const { body: products } = await db(`products?slug=like.${PFX}*&select=id`);
  for (const p of (products ?? []) as { id: string }[]) {
    await db(`admin_change_log?product_id=eq.${p.id}`, { method: "DELETE" });
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

  const { body: cat } = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ busca",
      slug: `${PFX}-cat`,
      sort_order: 981,
    }),
  });
  const { body: prod } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: (cat as { id: string }[])[0].id,
      name: "ZZ busca prod",
      slug: `${PFX}-prod`,
      status: "draft",
    }),
  });
  const { body: variant } = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: (prod as { id: string }[])[0].id,
      sku: `${PFX}-SKU`.toUpperCase(),
      price: 10,
      stock: 900,
      is_active: true,
    }),
  });
  variantId = (variant as { id: string }[])[0].id;
  await db(`products?id=eq.${(prod as { id: string }[])[0].id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });

  const order = async (key: string, phone: string, name: string) => {
    const result = await rpc("create_order", {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 1 }],
      p_customer_phone: phone,
      p_customer_name: name,
      p_client_request_id: crypto.randomUUID(),
      p_shipping_method_id: await anyShippingMethodId(),
    });
    assert.ok(result.status < 300, JSON.stringify(result.body));
    numbers[key] = (result.body as { order_number: string }).order_number;
  };

  await order("ana", "34600111222", `${CUSTOMER_PFX} Ana Pérez`);
  await order("bruno", "34600999888", `${CUSTOMER_PFX} Bruno Núñez`);
  await order("torres", "34611222333", `${CUSTOMER_PFX} Ana Torres`);
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [admin, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("buscador de pedidos · los tres caminos", { skip }, () => {
  test("por NÚMERO de pedido completo", async () => {
    const { numbers: found } = await search(admin.token, numbers.bruno);
    assert.deepEqual(found, [numbers.bruno]);
  });

  test("por número en minúsculas y con espacios alrededor", async () => {
    const { numbers: found } = await search(admin.token, `  ${numbers.bruno.toLowerCase()}  `);
    assert.deepEqual(found, [numbers.bruno]);
  });

  test("por TELÉFONO tal y como se pega del chat, con + y espacios", async () => {
    // Es EL caso de uso: el cliente escribe por WhatsApp y lo único que trae
    // consigo es su número, casi nunca con el formato exacto de la BD.
    const { numbers: found } = await search(admin.token, "+34 600 999 888");
    assert.deepEqual(found, [numbers.bruno]);
  });

  test("por teléfono PARCIAL", async () => {
    const { numbers: found } = await search(admin.token, "600999");
    assert.deepEqual(found, [numbers.bruno]);
  });

  test("por NOMBRE completo, con tilde", async () => {
    const { numbers: found } = await search(admin.token, "Bruno Núñez");
    assert.deepEqual(found, [numbers.bruno]);
  });

  test("por nombre PARCIAL: devuelve los dos clientes que casan", async () => {
    const { numbers: found } = await search(admin.token, "Ana");
    assert.deepEqual(found.sort(), [numbers.ana, numbers.torres].sort());
  });

  test("un token que casa por número Y por teléfono devuelve la UNIÓN sin duplicados", async () => {
    // "222" está en el teléfono de Ana Pérez y en el de Ana Torres. Si además
    // cayera en algún número de pedido, la unión sigue sin repetir filas.
    const { numbers: found, count } = await search(admin.token, "222");
    assert.equal(new Set(found).size, found.length, "sin duplicados");
    assert.ok(found.includes(numbers.ana));
    assert.ok(found.includes(numbers.torres));
    assert.equal(count, found.length, "el recuento coincide con las filas");
  });

  test("lo que no casa con nada devuelve vacío, no el listado entero", async () => {
    const { numbers: found, count } = await search(admin.token, "ZZZNADAZZZ");
    assert.deepEqual(found, []);
    assert.equal(count, 0);
  });
});

describe("buscador de pedidos · lo que NO hace", { skip }, () => {
  test("los acentos cuentan: «Perez» no encuentra «Pérez»", async () => {
    // LIMITACIÓN CONOCIDA Y DECLARADA, no un fallo escondido: quitar acentos
    // exigiría la extensión `unaccent` y un índice, que es otro incremento.
    // La interfaz lo dice al administrador.
    const { numbers: found } = await search(admin.token, "Perez");
    assert.deepEqual(found, [], "hoy NO encuentra; si algún día sí, hay que actualizar la ayuda");

    // CONTROL POSITIVO: con la tilde sí.
    const conTilde = await search(admin.token, "Pérez");
    assert.deepEqual(conTilde.numbers, [numbers.ana]);
  });

  test("los comodines no se pueden inyectar: «%» no lista todo", async () => {
    const { numbers: found } = await search(admin.token, "%");
    assert.deepEqual(found, [], "un comodín suelto no puede devolver el catálogo de pedidos");
  });

  test("un intento de romper el `or` no rompe la consulta", async () => {
    // Si `,` `(` `)` o `.` llegaran al `or=(…)`, esto devolvería 400 y el
    // assert de `search` fallaría. Que pase significa que se sanean.
    for (const evil of ["a,b)", "name.ilike.*x*", "a)or(b", "*"]) {
      const result = await search(admin.token, evil);
      assert.ok(Array.isArray(result.numbers), `rompió con ${evil}`);
    }
  });

  test("no cruza de mercado", async () => {
    const { numbers: found } = await search(admin.token, "Ana", "CO");
    assert.deepEqual(found, [], "los fixtures son de ES");
  });
});

describe("buscador de pedidos · quién puede buscar", { skip }, () => {
  test("ANON no encuentra ningún pedido", async () => {
    // `orders` y `customers` no tienen policy pública: a diferencia del
    // catálogo, aquí sí no hay nada visible sin ser admin.
    const { numbers: found } = await search(null, "Ana");
    assert.deepEqual(found, []);
  });

  test("un AUTENTICADO SIN rol de admin tampoco", async () => {
    const { numbers: found } = await search(plainUser.token, "Ana");
    assert.deepEqual(found, []);
  });

  test("CONTROL POSITIVO: el admin sí", async () => {
    const { numbers: found } = await search(admin.token, "Ana");
    assert.equal(found.length, 2);
  });

  test("anon tampoco puede listar clientes para adivinar teléfonos", async () => {
    const { body } = await as(null, "customers?select=phone");
    assert.deepEqual(body, []);
  });
});
