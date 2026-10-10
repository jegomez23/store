import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { relaxCheckoutLimits } from "./checkout-limits.helper.ts";

/**
 * `orders.attribution` y la nueva firma de `create_order` (migración 0040)
 * contra el Supabase REAL.
 *
 * Lo que protegen estos tests:
 *
 *   1. **LA ATRIBUCIÓN NO PUEDE ROMPER UNA VENTA.** Objetos corruptos,
 *      gigantes, con tipos raros o con claves inventadas → el pedido SE CREA
 *      igual, con `attribution = null`.
 *   2. **NADA FUERA DE LA LISTA BLANCA LLEGA A LA TABLA**, ni por POST directo
 *      a la RPC, que `anon` puede hacer.
 *   3. **NO ES LEGIBLE POR ANON.**
 *   4. **ES HISTÓRICA:** un reintento con otra campaña no reescribe el origen.
 *   5. **UNA SOLA PUERTA:** la firma vieja de 7 parámetros ya no existe.
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

/** Compra como la tienda: cliente ANÓNIMO, que es quien compra de verdad. */
async function buy(attribution: unknown, options: { requestId?: string } = {}) {
  const body: Record<string, unknown> = {
    p_market_id: "ES",
    p_items: [{ variant_id: variantId, quantity: 1 }],
    p_customer_phone: PHONE,
    p_customer_name: "ZZ Attr",
    p_client_request_id: options.requestId ?? crypto.randomUUID(),
    p_shipping_method_id: shippingMethodId,
  };
  if (attribution !== undefined) body.p_attribution = attribution;

  const response = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function attributionOf(orderNumber: string) {
  const row = await db(
    `orders?order_number=eq.${orderNumber}&select=attribution,created_at`,
  );
  return (row.body as { attribution: unknown }[])[0].attribution;
}

const PFX = "zz-attr";
const PHONE = "34600777666";
const UNIQUE = Math.random().toString(36).slice(2, 8);

let categoryId = "";
let productId = "";
let variantId = "";
let shippingMethodId = "";
const createdOrders: string[] = [];

before(async () => {
  if (skip) return;

  const category = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ Attr",
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
      name: `ZZ Attr ${UNIQUE}`,
      slug: `${PFX}-prod-${UNIQUE}`,
      // Nace en BORRADOR: `enforce_publishable_product` (0029/0031) rechaza
      // publicar un producto que todavía no tiene ninguna variante activa.
      status: "draft",
    }),
  });
  productId = (product.body as { id: string }[])[0].id;

  const variant = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: productId,
      sku: `ZZATTR-${UNIQUE}`,
      price: "10.00",
      stock: 500,
      is_active: true,
    }),
  });
  variantId = (variant.body as { id: string }[])[0].id;

  // Ya hay variante activa: ahora sí se puede publicar, que es lo que exige
  // `create_order` para vender.
  const published = await db(`products?id=eq.${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
  assert.equal(published.status, 204, JSON.stringify(published.body));

  const method = await db("shipping_methods?market_id=eq.ES&select=id&limit=1");
  shippingMethodId = (method.body as { id: string }[])[0].id;
});

after(async () => {
  if (skip) return;
  // Pedidos y cliente creados aquí.
  const orders = await db(
    `orders?select=id,order_number,customer_id&customer_id=not.is.null`,
  );
  for (const order of (orders.body as { id: string; order_number: string }[]) ?? []) {
    if (!createdOrders.includes(order.order_number)) continue;
    await db(`order_items?order_id=eq.${order.id}`, { method: "DELETE" });
    await db(`order_events?order_id=eq.${order.id}`, { method: "DELETE" });
    await db(`order_notes?order_id=eq.${order.id}`, { method: "DELETE" });
    await db(`orders?id=eq.${order.id}`, { method: "DELETE" });
  }
  await db(`customers?phone=eq.${PHONE}`, { method: "DELETE" });

  if (productId) {
    await db(`admin_change_log?product_id=eq.${productId}`, { method: "DELETE" });
    await db(`product_variants?product_id=eq.${productId}`, { method: "DELETE" });
    await db(`products?id=eq.${productId}`, { method: "DELETE" });
  }
  if (categoryId) await db(`categories?id=eq.${categoryId}`, { method: "DELETE" });
});

describe("attribution · se guarda lo que se debe", { skip }, () => {
  test("una campaña completa llega intacta a la tabla", async () => {
    const attribution = {
      utm_source: "instagram",
      utm_medium: "paid",
      utm_campaign: "lanzamiento",
      utm_content: "video1",
      utm_term: "oversize",
      fbclid: "IwAR-abc-123",
      landing_path: "/producto/algo",
    };
    const order = await buy(attribution);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);

    assert.deepEqual(await attributionOf(order.body.order_number), attribution);
  });

  test("un pedido DIRECTO se crea igual, con attribution null", async () => {
    const order = await buy(undefined);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);
    assert.equal(await attributionOf(order.body.order_number), null);
  });

  test("null explícito también funciona", async () => {
    const order = await buy(null);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);
    assert.equal(await attributionOf(order.body.order_number), null);
  });

  test("solo una UTM: se guarda esa y nada más", async () => {
    const order = await buy({ utm_source: "instagram" });
    assert.equal(order.status, 200);
    createdOrders.push(order.body.order_number);
    assert.deepEqual(await attributionOf(order.body.order_number), {
      utm_source: "instagram",
    });
  });
});

describe("attribution · el saneado vive en PostgreSQL", { skip }, () => {
  test("las claves que no están en la lista blanca NO llegan a la tabla", async () => {
    const order = await buy({
      utm_source: "instagram",
      email: "alguien@example.com",
      phone: "34600111222",
      ip: "1.2.3.4",
      user_agent: "Mozilla/5.0",
      gclid: "no-lo-pedimos",
      __proto__: { admin: true },
    });
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);

    const stored = await attributionOf(order.body.order_number);
    assert.deepEqual(stored, { utm_source: "instagram" });
    assert.equal(JSON.stringify(stored).includes("example.com"), false, "PII dentro de attribution");
  });

  test("los valores larguísimos se recortan a 200", async () => {
    const order = await buy({ utm_campaign: "x".repeat(5000) });
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);

    const stored = (await attributionOf(order.body.order_number)) as { utm_campaign: string };
    assert.equal(stored.utm_campaign.length, 200);
  });

  test("los tipos que no son cadena se descartan sin romper el pedido", async () => {
    const order = await buy({
      utm_source: 42,
      utm_medium: { anidado: true },
      utm_campaign: ["a", "b"],
      utm_content: null,
      utm_term: true,
      fbclid: "IwAR-ok",
    });
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);
    assert.deepEqual(await attributionOf(order.body.order_number), { fbclid: "IwAR-ok" });
  });

  test("un objeto GIGANTE no bloquea la compra: se guarda null", async () => {
    const huge: Record<string, string> = { utm_source: "instagram" };
    for (let i = 0; i < 2000; i++) huge[`k${i}`] = "x".repeat(50);

    const order = await buy(huge);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);
    assert.equal(
      await attributionOf(order.body.order_number),
      null,
      "por encima del tope se descarta ENTERA, pero el pedido se crea",
    );
  });

  test("lo que no es un objeto tampoco rompe nada", async () => {
    for (const bad of ["instagram", 42, true, ["utm_source"]]) {
      const order = await buy(bad);
      assert.equal(order.status, 200, `${JSON.stringify(bad)} → ${JSON.stringify(order.body)}`);
      createdOrders.push(order.body.order_number);
      assert.equal(await attributionOf(order.body.order_number), null);
    }
  });

  test("valores en blanco o solo con caracteres de control no se guardan", async () => {
    const order = await buy({ utm_source: "   ", utm_medium: "", utm_campaign: "real" });
    assert.equal(order.status, 200);
    createdOrders.push(order.body.order_number);
    assert.deepEqual(await attributionOf(order.body.order_number), { utm_campaign: "real" });
  });
});

describe("attribution · es histórica", { skip }, () => {
  test("un reintento con OTRA campaña no reescribe el origen del pedido", async () => {
    const requestId = crypto.randomUUID();
    const first = await buy({ utm_source: "instagram", utm_campaign: "lanzamiento" }, { requestId });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    createdOrders.push(first.body.order_number);
    assert.equal(first.body.reused, false);

    const retry = await buy({ utm_source: "google", utm_campaign: "otra" }, { requestId });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.reused, true, "mismo client_request_id: es el MISMO pedido");
    assert.equal(retry.body.order_number, first.body.order_number);

    assert.deepEqual(
      await attributionOf(first.body.order_number),
      { utm_source: "instagram", utm_campaign: "lanzamiento" },
      "el origen es el del primer envío",
    );
  });

  test("la atribución NO forma parte del fingerprint: no duplica pedidos", async () => {
    const requestId = crypto.randomUUID();
    const a = await buy({ utm_source: "instagram" }, { requestId });
    const b = await buy({ utm_source: "tiktok" }, { requestId });
    createdOrders.push(a.body.order_number);
    assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.equal(b.body.order_number, a.body.order_number);
  });
});

describe("attribution · quién puede leerla", { skip }, () => {
  test("anon NO puede leer orders, así que tampoco la atribución", async () => {
    const response = await fetch(
      `${env!.url}/rest/v1/orders?select=order_number,attribution`,
      { headers: { apikey: env!.anon } },
    );
    const body = await response.text();
    assert.equal(
      response.status === 200 ? JSON.parse(body).length : 0,
      0,
      `anon leyó pedidos: ${body.slice(0, 200)}`,
    );
  });

  test("anon tampoco puede leerla filtrando por un pedido concreto", async () => {
    const number = createdOrders[0];
    const response = await fetch(
      `${env!.url}/rest/v1/orders?order_number=eq.${number}&select=attribution`,
      { headers: { apikey: env!.anon } },
    );
    const body = await response.text();
    assert.equal(response.status === 200 ? JSON.parse(body).length : 0, 0, body.slice(0, 200));
  });

  test("anon no puede escribir en attribution de un pedido existente", async () => {
    const number = createdOrders[0];
    const before = await attributionOf(number);
    /*
      OJO: PostgREST responde 204 a un PATCH que no afecta a NINGUNA fila —
      "no existe para ti" no es un error—, así que el estado no dice nada. Lo
      que se afirma es lo único que importa: no se escribió nada. Con
      `return=representation` la respuesta enseña las filas tocadas, que deben
      ser cero.
    */
    const response = await fetch(
      `${env!.url}/rest/v1/orders?order_number=eq.${number}`,
      {
        method: "PATCH",
        headers: {
          apikey: env!.anon,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ attribution: { utm_source: "hackeado" } }),
      },
    );
    const body = await response.text();
    assert.deepEqual(body ? JSON.parse(body) : [], [], `anon escribió: ${body.slice(0, 200)}`);
    assert.deepEqual(await attributionOf(number), before);
  });
});

describe("attribution · una sola puerta", { skip }, () => {
  test("create_order expone la firma NUEVA, con p_attribution", async () => {
    const response = await fetch(`${env!.url}/rest/v1/`, {
      headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
    });
    const spec = (await response.json()) as {
      paths: Record<string, { post: { parameters: { schema: { properties: Record<string, unknown> } }[] } }>;
    };
    const params = Object.keys(spec.paths["/rpc/create_order"].post.parameters[0].schema.properties);
    assert.ok(params.includes("p_attribution"), params.join(","));
  });

  test("no queda una versión antigua que cree pedidos sin atribución", async () => {
    // Si la firma de 7 parámetros siguiera viva, PostgREST tendría DOS
    // candidatas para esta misma llamada y respondería con una ambigüedad
    // (PGRST203). Que el pedido se cree es la prueba de que solo hay una.
    const order = await buy({ utm_source: "prueba-firma" });
    assert.equal(order.status, 200, JSON.stringify(order.body));
    createdOrders.push(order.body.order_number);
    assert.deepEqual(await attributionOf(order.body.order_number), {
      utm_source: "prueba-firma",
    });
  });
});
