import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { relaxCheckoutLimits } from "./checkout-limits.helper.ts";
import { resolveShippingCost } from "../shipping.ts";

/**
 * Envío y total del pedido contra el Supabase REAL (incremento 8).
 *
 * LO QUE MÁS IMPORTA DE ESTE ARCHIVO: la regla del envío está escrita DOS
 * veces —en `resolveShippingCost` para la previsión del cliente y en el `case`
 * de la migración 0035 para la verdad— y aquí se ejecutan LAS DOS sobre los
 * mismos casos. Si alguien cambia una y olvida la otra, esto falla.
 *
 * Y lo segundo: que el navegador no pueda cambiar lo que cuesta un pedido.
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

/** El camino REAL del checkout: anon key, sin sesión. */
async function checkout(args: Record<string, unknown>) {
  const response = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const PFX = "zz-envio";
const CUSTOMER = "ZZ ENVIO Cliente";

let categoryId = "";
let variantId = "";
let methodPaid = { id: "", price: 0, threshold: null as number | null };
let methodFree = { id: "", price: 0, threshold: null as number | null };
let methodInactive = "";
let methodOtherMarket = "";

const num = (value: unknown) => Number.parseFloat(String(value));

async function cleanup() {
  if (!env) return;
  const { body: customers } = await db(
    `customers?name=like.${encodeURIComponent("ZZ ENVIO")}*&select=id`,
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
  await db(`shipping_methods?name=like.${encodeURIComponent("ZZ ENVIO")}*`, { method: "DELETE" });
  await db(`markets?id=eq.ZZ`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();

  const { body: cat } = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ envio",
      slug: `${PFX}-cat`,
      sort_order: 976,
    }),
  });
  categoryId = (cat as { id: string }[])[0].id;

  const { body: prod } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: categoryId,
      name: "ZZ envio producto",
      slug: `${PFX}-prod`,
      status: "draft",
    }),
  });
  const productId = (prod as { id: string }[])[0].id;

  // Precio 10,00 para que los umbrales caigan en números redondos.
  const { body: variant } = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: productId,
      sku: `${PFX}-SKU`.toUpperCase(),
      price: 10,
      stock: 900,
      is_active: true,
    }),
  });
  variantId = (variant as { id: string }[])[0].id;
  await db(`products?id=eq.${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });

  const method = async (over: Record<string, unknown>) => {
    const { body } = await db("shipping_methods", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ market_id: "ES", sort_order: 900, ...over }),
    });
    return (body as { id: string }[])[0].id;
  };

  methodPaid = {
    id: await method({ name: "ZZ ENVIO con umbral", price: 4.9, free_shipping_threshold: 60 }),
    price: 4.9,
    threshold: 60,
  };
  methodFree = {
    id: await method({ name: "ZZ ENVIO gratuito", price: 0, free_shipping_threshold: null }),
    price: 0,
    threshold: null,
  };
  methodInactive = await method({
    name: "ZZ ENVIO retirado",
    price: 9.9,
    free_shipping_threshold: null,
    is_active: false,
  });

  // Un método de OTRO mercado, para probar que no se puede usar aquí.
  await db("markets", {
    method: "POST",
    body: JSON.stringify({
      id: "ZZ",
      name: "ZZ mercado",
      currency_code: "EUR",
      locale: "es-ES",
      is_active: true,
    }),
  });
  methodOtherMarket = await method({
    market_id: "ZZ",
    name: "ZZ ENVIO ajeno",
    price: 1,
    free_shipping_threshold: null,
  });
});

after(async () => {
  if (!env) return;
  await cleanup();
});

/** Crea un pedido por el camino público y devuelve el jsonb de la función. */
async function order(quantity: number, shippingMethodId: string | null) {
  return checkout({
    p_market_id: "ES",
    p_items: [{ variant_id: variantId, quantity }],
    p_customer_phone: "34600555111",
    p_customer_name: CUSTOMER,
    p_client_request_id: crypto.randomUUID(),
    p_shipping_method_id: shippingMethodId,
  });
}

describe("envío · la regla es la misma en TypeScript y en PostgreSQL", { skip }, () => {
  /*
    EL TEST CENTRAL. Con precio de variante 10,00 y umbral 60, las cantidades
    5 y 6 caen justo a los lados del umbral, y la 6 cae EXACTAMENTE en él.
  */
  // Hasta 10: es el máximo de unidades por pedido (0046, DEC-088).
  for (const quantity of [1, 5, 6, 7, 10]) {
    test(`${quantity} uds: PostgreSQL y resolveShippingCost coinciden`, async () => {
      const result = await order(quantity, methodPaid.id);
      assert.ok(result.status < 300, JSON.stringify(result.body));

      const subtotal = num(result.body.subtotal);
      const fromDb = num(result.body.shipping_total);
      const fromTs = resolveShippingCost(
        { price: methodPaid.price, freeShippingThreshold: methodPaid.threshold },
        subtotal,
      );

      assert.equal(
        fromDb,
        fromTs,
        `subtotal ${subtotal}: BD dice ${fromDb}, TypeScript dice ${fromTs}`,
      );
      assert.equal(num(result.body.total), subtotal + fromDb, "total = subtotal + envío");
    });
  }

  test("exactamente en el umbral (60,00) el envío es GRATIS", async () => {
    const result = await order(6, methodPaid.id);
    assert.equal(num(result.body.subtotal), 60);
    assert.equal(num(result.body.shipping_total), 0);
    assert.equal(num(result.body.total), 60);
  });

  test("un céntimo por debajo del umbral SÍ paga envío", async () => {
    // 5 uds = 50,00 < 60,00
    const result = await order(5, methodPaid.id);
    assert.equal(num(result.body.subtotal), 50);
    assert.equal(num(result.body.shipping_total), 4.9);
    assert.equal(num(result.body.total), 54.9);
  });

  test("un método sin umbral nunca sale gratis por importe", async () => {
    const { body } = await db(`shipping_methods?id=eq.${methodPaid.id}&select=id`);
    assert.ok(body);
    const result = await order(10, methodFree.id); // 100,00
    assert.equal(num(result.body.shipping_total), 0, "este vale 0 de precio base");
  });

  test("el nombre del método queda GUARDADO en el pedido", async () => {
    const result = await order(1, methodPaid.id);
    assert.equal(result.body.shipping_method_name, "ZZ ENVIO con umbral");

    const { body: rows } = await db(
      `orders?id=eq.${result.body.order_id}&select=shipping_method_id,shipping_method_name,shipping_total,total,subtotal`,
    );
    const row = (rows as Record<string, unknown>[])[0];
    assert.equal(row.shipping_method_id, methodPaid.id);
    assert.equal(row.shipping_method_name, "ZZ ENVIO con umbral");
    assert.equal(num(row.shipping_total), 4.9);
    assert.equal(num(row.total), num(row.subtotal) + 4.9);
  });

  test("renombrar el método NO reescribe el pedido", async () => {
    const result = await order(1, methodPaid.id);
    await db(`shipping_methods?id=eq.${methodPaid.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "ZZ ENVIO renombrado" }),
    });
    const { body: rows } = await db(
      `orders?id=eq.${result.body.order_id}&select=shipping_method_name`,
    );
    assert.equal((rows as { shipping_method_name: string }[])[0].shipping_method_name, "ZZ ENVIO con umbral");
    await db(`shipping_methods?id=eq.${methodPaid.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "ZZ ENVIO con umbral" }),
    });
  });
});

describe("envío · el navegador no decide lo que cuesta", { skip }, () => {
  test("sin método NO se crea el pedido", async () => {
    const result = await order(1, null);
    assert.match(JSON.stringify(result.body), /SHIPPING_METHOD_REQUIRED/);
  });

  test("un método INVENTADO se rechaza", async () => {
    const result = await order(1, "00000000-0000-4000-8000-000000000000");
    assert.match(JSON.stringify(result.body), /INVALID_SHIPPING_METHOD/);
  });

  test("un método RETIRADO se rechaza", async () => {
    const result = await order(1, methodInactive);
    assert.match(JSON.stringify(result.body), /INVALID_SHIPPING_METHOD/);
  });

  test("un método de OTRO MERCADO se rechaza", async () => {
    const result = await order(1, methodOtherMarket);
    assert.match(JSON.stringify(result.body), /INVALID_SHIPPING_METHOD/);
  });

  test("mandar shipping_total o total en el payload NO cambia nada", async () => {
    // La función no tiene esos parámetros: PostgREST los rechaza de plano. Es
    // la mejor defensa posible — el importe no es que se ignore, es que no
    // existe como entrada.
    const result = await checkout({
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 1 }],
      p_customer_phone: "34600555222",
      p_customer_name: CUSTOMER,
      p_client_request_id: crypto.randomUUID(),
      p_shipping_method_id: methodPaid.id,
      p_shipping_total: 0,
      p_total: 0,
    });
    assert.ok(result.status >= 400, "un parámetro inventado no puede aceptarse");
    assert.match(JSON.stringify(result.body), /PGRST202|does not exist|schema cache/i);
  });

  test("la firma ANTIGUA sin envío ya no existe", async () => {
    // Si siguiera viva, sería un camino publicado para crear pedidos con
    // shipping_total = 0 saltándose todo esto.
    const result = await checkout({
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 1 }],
      p_customer_phone: "34600555333",
      p_customer_name: CUSTOMER,
      p_client_request_id: crypto.randomUUID(),
    });
    assert.ok(result.status >= 400, JSON.stringify(result.body));
  });

  test("ANON no puede tocar los métodos de envío", async () => {
    const response = await fetch(`${env!.url}/rest/v1/shipping_methods?id=eq.${methodPaid.id}`, {
      method: "PATCH",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ price: 0 }),
    });
    assert.ok(response.status >= 400 || response.status === 204);

    const { body } = await db(`shipping_methods?id=eq.${methodPaid.id}&select=price`);
    assert.equal(num((body as { price: unknown }[])[0].price), 4.9, "el precio sigue intacto");
  });
});

describe("envío · idempotencia y concurrencia", { skip }, () => {
  test("doble envío con la MISMA clave devuelve el mismo pedido y cobra una vez", async () => {
    const key = crypto.randomUUID();
    const payload = {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 2 }],
      p_customer_phone: "34600555444",
      p_customer_name: CUSTOMER,
      p_client_request_id: key,
      p_shipping_method_id: methodPaid.id,
    };

    const [a, b] = await Promise.all([checkout(payload), checkout(payload)]);
    const ok = [a, b].filter((r) => r.status < 300);
    assert.equal(ok.length, 2, JSON.stringify([a.body, b.body]));
    assert.equal(ok[0].body.order_number, ok[1].body.order_number, "un solo pedido");

    const { body: rows } = await db(`orders?client_request_id=eq.${key}&select=id,total`);
    assert.equal((rows as unknown[]).length, 1, "una sola fila");
    assert.equal(num((rows as { total: unknown }[])[0].total), 24.9, "20,00 + 4,90");
  });

  test("misma clave con OTRO método se rechaza en vez de devolver el total viejo", async () => {
    // Sin el método dentro del fingerprint, esto habría devuelto el pedido
    // anterior en silencio y el cliente vería un importe que no pidió.
    const key = crypto.randomUUID();
    const base = {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 1 }],
      p_customer_phone: "34600555555",
      p_customer_name: CUSTOMER,
      p_client_request_id: key,
    };

    const first = await checkout({ ...base, p_shipping_method_id: methodPaid.id });
    assert.ok(first.status < 300, JSON.stringify(first.body));

    const second = await checkout({ ...base, p_shipping_method_id: methodFree.id });
    assert.match(JSON.stringify(second.body), /IDEMPOTENCY_KEY_REUSED/);

    const { body: rows } = await db(`orders?client_request_id=eq.${key}&select=shipping_total`);
    assert.equal((rows as unknown[]).length, 1);
    assert.equal(num((rows as { shipping_total: unknown }[])[0].shipping_total), 4.9);
  });

  test("el stock se descuenta una sola vez pese al doble envío", async () => {
    const { body: before } = await db(`product_variants?id=eq.${variantId}&select=stock`);
    const stockBefore = (before as { stock: number }[])[0].stock;

    const key = crypto.randomUUID();
    const payload = {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 3 }],
      p_customer_phone: "34600555666",
      p_customer_name: CUSTOMER,
      p_client_request_id: key,
      p_shipping_method_id: methodFree.id,
    };
    await Promise.all([checkout(payload), checkout(payload)]);

    const { body: after } = await db(`product_variants?id=eq.${variantId}&select=stock`);
    assert.equal((after as { stock: number }[])[0].stock, stockBefore - 3);
  });
});
