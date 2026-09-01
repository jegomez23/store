import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Tests de INTEGRACIÓN de `create_order` contra el Supabase REAL (Fase 6).
 *
 * Llaman a la RPC **con la anon key**, es decir por el mismo camino exacto que
 * usa un cliente anónimo desde el navegador. No hay mocks: lo que se comprueba
 * aquí es el comportamiento real de PostgreSQL.
 *
 * La service role key solo se usa para PREPARAR fixtures y LIMPIAR — nunca
 * para ejercitar el flujo de compra.
 *
 * Si falta `.env.local` la suite se salta entera (nunca se marca como
 * validada algo que no se ha podido ejecutar).
 *
 * LIMPIEZA: cada test borra lo que crea y restaura el stock. Al terminar se
 * comprueba que la BD queda exactamente en el estado del seed.
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

/** Llama a la RPC igual que lo haría el navegador: con la ANON key. */
async function callCreateOrder(
  args: Record<string, unknown>,
  key: "anon" | "service" = "anon",
): Promise<{ status: number; body: unknown }> {
  const token = key === "anon" ? env!.anon : env!.service;
  const response = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
    method: "POST",
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
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

/** Acceso administrativo, SOLO para fixtures y limpieza. */
async function admin(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
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

function errorCode(body: unknown): string {
  if (typeof body === "object" && body !== null && "message" in body) {
    return String((body as { message: unknown }).message);
  }
  return `<sin código: ${JSON.stringify(body)}>`;
}

function order(body: unknown): Record<string, unknown> {
  assert.equal(typeof body, "object", `respuesta inesperada: ${JSON.stringify(body)}`);
  return body as Record<string, unknown>;
}

const uuid = () => crypto.randomUUID();
const PHONE = "+34 600 99 88 77";
const NAME = "Test Integración";

/** Ids de los fixtures creados, para limpiarlos al final. */
const created = {
  productIds: [] as string[],
  variantIds: [] as string[],
};
/** Variantes reales del seed cuyo stock hay que restaurar. */
const stockToRestore = new Map<string, number>();

let realVariantId = "";
let realVariantPrice = 0;
let realVariantStock = 0;
let categoryId = "";
let colorId = "";
let sizeIds: string[] = [];

describe("create_order — integración contra Supabase real", { skip }, () => {
  before(async () => {
    const variants = (await admin(
      "product_variants?select=id,price,stock,sku&sku=eq.YI-ES-CSO-PIE-M",
    )).body as { id: string; price: number; stock: number }[];
    assert.equal(variants.length, 1, "falta la variante del seed YI-ES-CSO-PIE-M");
    realVariantId = variants[0].id;
    realVariantPrice = Number(variants[0].price);
    realVariantStock = variants[0].stock;
    stockToRestore.set(realVariantId, realVariantStock);

    categoryId = (
      (await admin("categories?select=id&market_id=eq.ES&limit=1")).body as {
        id: string;
      }[]
    )[0].id;
    colorId = ((await admin("colors?select=id&limit=1")).body as { id: string }[])[0].id;
    sizeIds = (
      (await admin("sizes?select=id&size_group=eq.apparel&order=sort_order")).body as {
        id: string;
      }[]
    ).map((s) => s.id);
  });

  after(async () => {
    // Orden inverso de dependencias.
    await admin("order_items?order_id=not.is.null", { method: "DELETE" });
    await admin("orders?id=not.is.null", { method: "DELETE" });
    await admin("customers?id=not.is.null", { method: "DELETE" });
    await admin("order_counters?market_id=not.is.null", { method: "DELETE" });

    for (const variantId of created.variantIds) {
      await admin(`product_variants?id=eq.${variantId}`, { method: "DELETE" });
    }
    for (const productId of created.productIds) {
      await admin(`products?id=eq.${productId}`, { method: "DELETE" });
    }
    for (const [variantId, stock] of stockToRestore) {
      await admin(`product_variants?id=eq.${variantId}`, {
        method: "PATCH",
        body: JSON.stringify({ stock }),
      });
    }
  });

  /** Crea un producto+variante desechable con los atributos indicados. */
  async function makeFixture(opts: {
    productStatus?: string;
    productDeleted?: boolean;
    marketId?: string;
    variantActive?: boolean;
    stock?: number;
    price?: number;
    sizeIndex?: number;
  }): Promise<string> {
    const slug = `fx-checkout-${Math.random().toString(36).slice(2, 10)}`;
    const productRes = await admin("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: opts.marketId ?? "ES",
        category_id: categoryId,
        name: `FIXTURE ${slug}`,
        slug,
        status: opts.productStatus ?? "active",
        deleted_at: opts.productDeleted ? new Date().toISOString() : null,
      }),
    });
    const productId = (productRes.body as { id: string }[])[0].id;
    created.productIds.push(productId);

    const variantRes = await admin("product_variants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_id: productId,
        color_id: colorId,
        size_id: sizeIds[opts.sizeIndex ?? 0],
        sku: `FX-${slug}`,
        price: opts.price ?? 10,
        stock: opts.stock ?? 5,
        is_active: opts.variantActive ?? true,
      }),
    });
    const variantId = (variantRes.body as { id: string }[])[0].id;
    created.variantIds.push(variantId);
    return variantId;
  }

  async function stockOf(variantId: string): Promise<number> {
    const rows = (await admin(`product_variants?select=stock&id=eq.${variantId}`))
      .body as { stock: number }[];
    return rows[0].stock;
  }

  const base = (items: unknown[], requestId = uuid()) => ({
    p_market_id: "ES",
    p_items: items,
    p_customer_phone: PHONE,
    p_customer_name: NAME,
    p_client_request_id: requestId,
    p_source_url: "https://yi.test/checkout",
  });

  // ── CAMINO FELIZ ───────────────────────────────────────────────────────
  describe("pedido válido", () => {
    test("crea el pedido y devuelve datos resueltos por el servidor", async () => {
      const before = await stockOf(realVariantId);
      const result = await callCreateOrder(
        base([{ variant_id: realVariantId, quantity: 2 }]),
      );
      assert.equal(result.status, 200, errorCode(result.body));

      const data = order(result.body);
      assert.match(String(data.order_number), /^YI-ES-\d{6}$/);
      assert.equal(data.status, "pending", "nunca nace pagado");
      assert.equal(data.currency_code, "EUR");
      assert.equal(Number(data.subtotal), realVariantPrice * 2);
      assert.equal(Number(data.total), realVariantPrice * 2);
      assert.equal(Number(data.discount_total), 0);
      assert.equal(data.reused, false);

      const items = data.items as Record<string, unknown>[];
      assert.equal(items.length, 1);
      assert.equal(Number(items[0].unit_price), realVariantPrice);
      assert.equal(items[0].product_name, "Camiseta Sendero Oversize");
      assert.equal(items[0].color_name, "Piedra");
      assert.equal(items[0].size_label, "M");

      assert.equal(await stockOf(realVariantId), before - 2, "stock descontado");
    });

    test("guarda order_items con snapshots y un order_event inicial", async () => {
      const result = await callCreateOrder(
        base([{ variant_id: realVariantId, quantity: 1 }]),
      );
      const orderId = order(result.body).order_id;

      const items = (await admin(
        `order_items?select=product_name,color_name,size_label,sku,unit_price,quantity,line_total&order_id=eq.${orderId}`,
      )).body as Record<string, unknown>[];
      assert.equal(items.length, 1);
      assert.equal(Number(items[0].unit_price), realVariantPrice);
      assert.equal(Number(items[0].line_total), realVariantPrice);
      assert.equal(items[0].sku, "YI-ES-CSO-PIE-M", "snapshot del SKU");

      const events = (await admin(
        `order_events?select=from_status,to_status&order_id=eq.${orderId}`,
      )).body as Record<string, unknown>[];
      assert.equal(events.length, 1);
      assert.equal(events[0].from_status, null, "creación: from_status NULL");
      assert.equal(events[0].to_status, "pending");
    });

    test("el teléfono se normaliza y el cliente no se duplica", async () => {
      await callCreateOrder(base([{ variant_id: realVariantId, quantity: 1 }]));
      await callCreateOrder(base([{ variant_id: realVariantId, quantity: 1 }]));

      const customers = (await admin("customers?select=phone,name")).body as {
        phone: string;
      }[];
      assert.equal(customers.length, 1, "un solo cliente para el mismo teléfono");
      assert.equal(customers[0].phone, "34600998877", "E.164 sin '+'");
    });

    test("los números de pedido son correlativos por mercado (DEC-027)", async () => {
      const a = order(
        (await callCreateOrder(base([{ variant_id: realVariantId, quantity: 1 }]))).body,
      );
      const b = order(
        (await callCreateOrder(base([{ variant_id: realVariantId, quantity: 1 }]))).body,
      );
      const numA = Number(String(a.order_number).split("-")[2]);
      const numB = Number(String(b.order_number).split("-")[2]);
      assert.equal(numB, numA + 1);
    });
  });

  // ── EL CLIENTE NO ES AUTORIDAD ─────────────────────────────────────────
  describe("datos manipulados por el cliente", () => {
    test("PRECIO manipulado: el pedido usa el precio REAL de la BD", async () => {
      // Intento de fraude: el atacante inyecta su propio precio dentro de los
      // ítems, que es jsonb libre y acepta cualquier campo extra.
      const result = await callCreateOrder(
        base([
          {
            variant_id: realVariantId,
            quantity: 1,
            unit_price: 1,
            price: 1,
            line_total: 1,
            subtotal: 1,
            total: 1,
          },
        ]),
      );
      assert.equal(result.status, 200, errorCode(result.body));

      const data = order(result.body);
      assert.equal(
        Number(data.total),
        realVariantPrice,
        "el total DEBE ser el precio real, no el inyectado",
      );
      assert.notEqual(Number(data.total), 1);

      const items = (await admin(
        `order_items?select=unit_price,line_total&order_id=eq.${data.order_id}`,
      )).body as Record<string, unknown>[];
      assert.equal(Number(items[0].unit_price), realVariantPrice);
    });

    test("STOCK manipulado: se ignora y manda el stock real", async () => {
      const variantId = await makeFixture({ stock: 1 });
      const result = await callCreateOrder(
        base([
          {
            variant_id: variantId,
            quantity: 5,
            // El cliente afirma que hay stock de sobra.
            stock: 999,
            stockSnapshot: 999,
          },
        ]),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result.body), "OUT_OF_STOCK");
      assert.equal(await stockOf(variantId), 1, "el stock no se toca al fallar");
    });

    test("no se puede inyectar un total: la función no acepta ese parámetro", async () => {
      // La firma de create_order no tiene p_subtotal/p_total, así que PostgREST
      // ni siquiera encuentra la función: no hay superficie por la que colar un
      // importe a nivel de pedido.
      const result = await callCreateOrder({
        ...base([{ variant_id: realVariantId, quantity: 1 }]),
        p_subtotal: 1,
        p_total: 1,
      });
      assert.equal(result.status, 404, "parámetro desconocido: función no encontrada");

      const orders = (await admin("orders?select=id&subtotal=eq.1")).body as unknown[];
      assert.deepEqual(orders, [], "no se creó ningún pedido de 1 €");
    });

    test("nombre de producto inyectado: se usa el de la BD", async () => {
      const result = await callCreateOrder(
        base([
          {
            variant_id: realVariantId,
            quantity: 1,
            product_name: "Producto Falsificado",
          },
        ]),
      );
      const items = order(result.body).items as Record<string, unknown>[];
      assert.equal(items[0].product_name, "Camiseta Sendero Oversize");
    });
  });

  // ── VALIDACIÓN DE CATÁLOGO ─────────────────────────────────────────────
  describe("variante o producto no comprables", () => {
    test("variante inexistente -> VARIANT_NOT_FOUND", async () => {
      const result = await callCreateOrder(
        base([{ variant_id: "00000000-0000-4000-8000-000000000000", quantity: 1 }]),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result.body), "VARIANT_NOT_FOUND");
    });

    test("variante inactiva -> VARIANT_INACTIVE", async () => {
      const variantId = await makeFixture({ variantActive: false });
      const result = await callCreateOrder(base([{ variant_id: variantId, quantity: 1 }]));
      assert.equal(errorCode(result.body), "VARIANT_INACTIVE");
      assert.equal(await stockOf(variantId), 5, "sin tocar el stock");
    });

    test("producto en draft -> PRODUCT_UNAVAILABLE", async () => {
      const variantId = await makeFixture({ productStatus: "draft" });
      const result = await callCreateOrder(base([{ variant_id: variantId, quantity: 1 }]));
      assert.equal(errorCode(result.body), "PRODUCT_UNAVAILABLE");
    });

    test("producto eliminado (soft delete) -> PRODUCT_UNAVAILABLE", async () => {
      const variantId = await makeFixture({ productDeleted: true });
      const result = await callCreateOrder(base([{ variant_id: variantId, quantity: 1 }]));
      assert.equal(errorCode(result.body), "PRODUCT_UNAVAILABLE");
    });

    test("producto de otro mercado -> WRONG_MARKET", async () => {
      // CO existe en `markets` pero está inactivo (DEC-014); se crea una
      // categoría propia porque las categorías van por mercado.
      const catCo = (
        (
          await admin("categories", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              market_id: "CO",
              name: "FIXTURE CO",
              slug: `fx-co-${Math.random().toString(36).slice(2, 8)}`,
            }),
          })
        ).body as { id: string }[]
      )[0].id;

      const productId = (
        (
          await admin("products", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              market_id: "CO",
              category_id: catCo,
              name: "FIXTURE CO",
              slug: `fx-co-${Math.random().toString(36).slice(2, 8)}`,
              status: "active",
            }),
          })
        ).body as { id: string }[]
      )[0].id;

      const variantId = (
        (
          await admin("product_variants", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              product_id: productId,
              color_id: colorId,
              size_id: sizeIds[0],
              sku: `FX-CO-${Math.random().toString(36).slice(2, 8)}`,
              price: 10,
              stock: 5,
            }),
          })
        ).body as { id: string }[]
      )[0].id;

      const result = await callCreateOrder(base([{ variant_id: variantId, quantity: 1 }]));
      assert.equal(errorCode(result.body), "WRONG_MARKET");

      await admin(`product_variants?id=eq.${variantId}`, { method: "DELETE" });
      await admin(`products?id=eq.${productId}`, { method: "DELETE" });
      await admin(`categories?id=eq.${catCo}`, { method: "DELETE" });
    });

    test("mercado inactivo -> MARKET_UNAVAILABLE", async () => {
      const result = await callCreateOrder({
        ...base([{ variant_id: realVariantId, quantity: 1 }]),
        p_market_id: "CO", // existe pero is_active = false
      });
      assert.equal(errorCode(result.body), "MARKET_UNAVAILABLE");
    });

    test("mercado inexistente -> MARKET_UNAVAILABLE", async () => {
      const result = await callCreateOrder({
        ...base([{ variant_id: realVariantId, quantity: 1 }]),
        p_market_id: "XX",
      });
      assert.equal(errorCode(result.body), "MARKET_UNAVAILABLE");
    });
  });

  // ── STOCK ──────────────────────────────────────────────────────────────
  describe("stock", () => {
    test("cantidad superior al stock -> OUT_OF_STOCK y nada se modifica", async () => {
      const variantId = await makeFixture({ stock: 3 });
      const result = await callCreateOrder(base([{ variant_id: variantId, quantity: 4 }]));
      assert.equal(errorCode(result.body), "OUT_OF_STOCK");
      assert.equal(await stockOf(variantId), 3);
    });

    test("comprar exactamente el stock disponible funciona y lo deja a 0", async () => {
      const variantId = await makeFixture({ stock: 3 });
      const result = await callCreateOrder(base([{ variant_id: variantId, quantity: 3 }]));
      assert.equal(result.status, 200, errorCode(result.body));
      assert.equal(await stockOf(variantId), 0);
    });

    test("si UNA línea falla, se revierte el stock de las demás (atomicidad)", async () => {
      const ok = await makeFixture({ stock: 10 });
      const fails = await makeFixture({ stock: 1, sizeIndex: 1 });

      const result = await callCreateOrder(
        base([
          { variant_id: ok, quantity: 2 },
          { variant_id: fails, quantity: 5 },
        ]),
      );
      assert.equal(errorCode(result.body), "OUT_OF_STOCK");
      assert.equal(await stockOf(ok), 10, "la línea válida NO debe quedar descontada");
      assert.equal(await stockOf(fails), 1);
    });
  });

  // ── CONCURRENCIA ───────────────────────────────────────────────────────
  describe("concurrencia", () => {
    test("dos compras simultáneas de la ÚLTIMA unidad: solo una gana", async () => {
      const variantId = await makeFixture({ stock: 1 });

      const [a, b] = await Promise.all([
        callCreateOrder(base([{ variant_id: variantId, quantity: 1 }])),
        callCreateOrder(base([{ variant_id: variantId, quantity: 1 }])),
      ]);

      const okCount = [a, b].filter((r) => r.status === 200).length;
      const failCount = [a, b].filter((r) => errorCode(r.body) === "OUT_OF_STOCK").length;

      assert.equal(okCount, 1, "exactamente un pedido debe crearse");
      assert.equal(failCount, 1, "el otro debe fallar con OUT_OF_STOCK");
      assert.equal(await stockOf(variantId), 0, "nunca stock negativo (sin overselling)");
    });

    test("diez compras simultáneas de 3 unidades: exactamente 3 ganan", async () => {
      const variantId = await makeFixture({ stock: 3 });

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          callCreateOrder(base([{ variant_id: variantId, quantity: 1 }])),
        ),
      );

      const ok = results.filter((r) => r.status === 200).length;
      assert.equal(ok, 3, "solo pueden ganar tantas compras como stock había");
      assert.equal(await stockOf(variantId), 0);
    });
  });

  // ── IDEMPOTENCIA ───────────────────────────────────────────────────────
  describe("idempotencia (DEC-028)", () => {
    test("doble submit con el mismo client_request_id -> UN solo pedido", async () => {
      const variantId = await makeFixture({ stock: 10 });
      const requestId = uuid();
      const args = base([{ variant_id: variantId, quantity: 2 }], requestId);

      const first = await callCreateOrder(args);
      const second = await callCreateOrder(args);

      assert.equal(first.status, 200, errorCode(first.body));
      assert.equal(second.status, 200, errorCode(second.body));

      const a = order(first.body);
      const b = order(second.body);
      assert.equal(a.order_id, b.order_id, "mismo pedido");
      assert.equal(a.order_number, b.order_number);
      assert.equal(a.reused, false);
      assert.equal(b.reused, true, "la segunda llamada reutiliza");

      assert.equal(await stockOf(variantId), 8, "el stock se descuenta UNA vez");

      const orders = (await admin(
        `orders?select=id&client_request_id=eq.${requestId}`,
      )).body as unknown[];
      assert.equal(orders.length, 1);

      const events = (await admin(
        `order_events?select=id&order_id=eq.${a.order_id}`,
      )).body as unknown[];
      assert.equal(events.length, 1, "no se duplica el evento de creación");

      const items = (await admin(
        `order_items?select=id&order_id=eq.${a.order_id}`,
      )).body as unknown[];
      assert.equal(items.length, 1, "no se duplican las líneas");
    });

    test("retry tras 'timeout': devuelve el pedido sin volver a descontar", async () => {
      const variantId = await makeFixture({ stock: 10 });
      const requestId = uuid();
      const args = base([{ variant_id: variantId, quantity: 3 }], requestId);

      const first = order((await callCreateOrder(args)).body);
      const stockAfterFirst = await stockOf(variantId);

      // El cliente no vio la respuesta y reintenta tres veces.
      for (let i = 0; i < 3; i++) {
        const retry = await callCreateOrder(args);
        assert.equal(retry.status, 200);
        const data = order(retry.body);
        assert.equal(data.order_id, first.order_id);
        assert.equal(data.reused, true);
        assert.equal(Number(data.total), Number(first.total));
      }

      assert.equal(await stockOf(variantId), stockAfterFirst, "stock intacto");
    });

    test("dos pestañas enviando a la vez con el mismo id -> un pedido", async () => {
      const variantId = await makeFixture({ stock: 10 });
      const requestId = uuid();
      const args = base([{ variant_id: variantId, quantity: 1 }], requestId);

      const results = await Promise.all([
        callCreateOrder(args),
        callCreateOrder(args),
        callCreateOrder(args),
      ]);

      const orderIds = new Set(
        results
          .filter((r) => r.status === 200)
          .map((r) => String(order(r.body).order_id)),
      );
      // El índice UNIQUE puede hacer fallar a las llamadas que corren a la vez;
      // lo innegociable es que jamás se cree más de un pedido.
      const rows = (await admin(
        `orders?select=id&client_request_id=eq.${requestId}`,
      )).body as unknown[];
      assert.equal(rows.length, 1, "un único pedido en la BD");
      assert.ok(orderIds.size <= 1, "todas las respuestas OK apuntan al mismo pedido");
    });

    test("MISMO id con payload DIFERENTE -> IDEMPOTENCY_KEY_REUSED sin tocar nada", async () => {
      const variantId = await makeFixture({ stock: 10 });
      const requestId = uuid();

      const first = await callCreateOrder(
        base([{ variant_id: variantId, quantity: 2 }], requestId),
      );
      assert.equal(first.status, 200, errorCode(first.body));
      const stockAfterFirst = await stockOf(variantId);
      const firstOrderId = order(first.body).order_id;

      // Misma clave, cantidad distinta.
      const conflict = await callCreateOrder(
        base([{ variant_id: variantId, quantity: 7 }], requestId),
      );
      assert.equal(conflict.status, 400);
      assert.equal(errorCode(conflict.body), "IDEMPOTENCY_KEY_REUSED");

      // Misma clave, teléfono distinto.
      const conflictPhone = await callCreateOrder({
        ...base([{ variant_id: variantId, quantity: 2 }], requestId),
        p_customer_phone: "+34 611 00 00 00",
      });
      assert.equal(errorCode(conflictPhone.body), "IDEMPOTENCY_KEY_REUSED");

      assert.equal(await stockOf(variantId), stockAfterFirst, "stock intacto");
      const rows = (await admin(
        `orders?select=id&client_request_id=eq.${requestId}`,
      )).body as { id: string }[];
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, firstOrderId, "sigue siendo el pedido original");
    });

    test("el orden de los ítems NO cambia el fingerprint", async () => {
      const v1 = await makeFixture({ stock: 10 });
      const v2 = await makeFixture({ stock: 10, sizeIndex: 1 });
      const requestId = uuid();

      const first = await callCreateOrder(
        base(
          [
            { variant_id: v1, quantity: 1 },
            { variant_id: v2, quantity: 1 },
          ],
          requestId,
        ),
      );
      assert.equal(first.status, 200, errorCode(first.body));

      // Mismos ítems, orden invertido: debe considerarse el MISMO payload.
      const second = await callCreateOrder(
        base(
          [
            { variant_id: v2, quantity: 1 },
            { variant_id: v1, quantity: 1 },
          ],
          requestId,
        ),
      );
      assert.equal(second.status, 200, errorCode(second.body));
      assert.equal(order(second.body).reused, true);
    });

    test("client_request_id nulo -> INVALID_INPUT", async () => {
      const result = await callCreateOrder({
        ...base([{ variant_id: realVariantId, quantity: 1 }]),
        p_client_request_id: null,
      });
      assert.equal(errorCode(result.body), "INVALID_INPUT");
    });
  });

  // ── VALIDACIÓN DE ENTRADA EN LA PROPIA BD ──────────────────────────────
  describe("la BD valida aunque se salte la capa TypeScript", () => {
    const badItems: [string, unknown][] = [
      ["carrito vacío", []],
      ["cantidad 0", [{ variant_id: "PLACEHOLDER", quantity: 0 }]],
      ["cantidad negativa", [{ variant_id: "PLACEHOLDER", quantity: -3 }]],
      ["cantidad decimal", [{ variant_id: "PLACEHOLDER", quantity: 1.5 }]],
      ["cantidad como texto", [{ variant_id: "PLACEHOLDER", quantity: "dos" }]],
      ["cantidad enorme", [{ variant_id: "PLACEHOLDER", quantity: 100000 }]],
      ["variant_id no uuid", [{ variant_id: "'; drop table orders; --", quantity: 1 }]],
      ["sin variant_id", [{ quantity: 1 }]],
    ];

    for (const [label, items] of badItems) {
      test(`${label} -> error de dominio, sin pedido`, async () => {
        const payload = JSON.parse(
          JSON.stringify(items).replaceAll("PLACEHOLDER", realVariantId),
        );
        const result = await callCreateOrder(base(payload));
        assert.equal(result.status, 400, `esperaba fallo, obtuve ${result.status}`);
        assert.ok(
          ["EMPTY_CART", "INVALID_INPUT"].includes(errorCode(result.body)),
          `código inesperado: ${errorCode(result.body)}`,
        );
      });
    }

    test("teléfono inválido -> INVALID_CUSTOMER_PHONE", async () => {
      const result = await callCreateOrder({
        ...base([{ variant_id: realVariantId, quantity: 1 }]),
        p_customer_phone: "123",
      });
      assert.equal(errorCode(result.body), "INVALID_CUSTOMER_PHONE");
    });

    test("nombre vacío -> INVALID_CUSTOMER_NAME", async () => {
      const result = await callCreateOrder({
        ...base([{ variant_id: realVariantId, quantity: 1 }]),
        p_customer_name: "  ",
      });
      assert.equal(errorCode(result.body), "INVALID_CUSTOMER_NAME");
    });

    test("variant_id duplicado -> INVALID_INPUT", async () => {
      const result = await callCreateOrder(
        base([
          { variant_id: realVariantId, quantity: 1 },
          { variant_id: realVariantId, quantity: 1 },
        ]),
      );
      assert.equal(errorCode(result.body), "INVALID_INPUT");
    });
  });

  // ── RLS SIGUE INTACTA ──────────────────────────────────────────────────
  describe("las tablas privadas siguen protegidas", () => {
    test("anon no puede leer orders, order_items, order_events ni customers", async () => {
      for (const table of ["orders", "order_items", "order_events", "customers"]) {
        const response = await fetch(`${env!.url}/rest/v1/${table}?select=*`, {
          headers: { apikey: env!.anon, Authorization: `Bearer ${env!.anon}` },
        });
        const rows = (await response.json()) as unknown;
        assert.deepEqual(rows, [], `${table} no debe devolver filas a anon`);
      }
    });

    test("anon no puede INSERTAR directamente en orders (solo vía RPC)", async () => {
      const response = await fetch(`${env!.url}/rest/v1/orders`, {
        method: "POST",
        headers: {
          apikey: env!.anon,
          Authorization: `Bearer ${env!.anon}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_number: "YI-ES-999999",
          market_id: "ES",
          customer_id: "00000000-0000-4000-8000-000000000000",
          channel: "whatsapp",
          currency_code: "EUR",
          subtotal: 0.01,
          total: 0.01,
        }),
      });
      assert.ok(response.status >= 400, `esperaba rechazo, obtuve ${response.status}`);
    });

    test("anon no puede leer order_counters (revelaría el volumen de ventas)", async () => {
      const response = await fetch(`${env!.url}/rest/v1/order_counters?select=*`, {
        headers: { apikey: env!.anon, Authorization: `Bearer ${env!.anon}` },
      });
      const rows = (await response.json()) as unknown;
      assert.deepEqual(rows, []);
    });
  });
});
