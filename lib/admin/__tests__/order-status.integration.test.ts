import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Tests de INTEGRACIÓN de `admin_update_order_status` contra el Supabase REAL
 * (Fase 7, DEC-032 y DEC-033).
 *
 * Se llama a la RPC **con el JWT de un usuario**, por el mismo camino exacto
 * que usaría el panel. La service role key solo prepara fixtures y limpia:
 * nunca ejercita el flujo bajo prueba.
 *
 * El admin de las pruebas se crea y se BORRA aquí; no se usa la cuenta real de
 * nadie ni se depende de que exista.
 *
 * Si falta `.env.local` la suite se salta entera (nunca se marca como validado
 * algo que no se ha podido ejecutar).
 *
 * LIMPIEZA: al terminar, pedidos, líneas, eventos, clientes, contadores,
 * usuarios de prueba y stock quedan exactamente en el baseline del seed.
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

/** Acceso administrativo directo, SOLO para fixtures y limpieza. */
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

/**
 * Invoca la RPC igual que lo haría el panel: `apikey` = anon key y el JWT del
 * usuario en `Authorization`. Mandar el JWT en ambos headers es el falso verde
 * clásico que advierte AI-DEVELOPMENT §8.1.
 */
async function callStatusRpc(
  args: Record<string, unknown>,
  token: string | null,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${env!.url}/rest/v1/rpc/admin_update_order_status`,
    {
      method: "POST",
      headers: {
        apikey: env!.anon,
        Authorization: `Bearer ${token ?? env!.anon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    },
  );
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

function result(body: unknown): Record<string, unknown> {
  assert.equal(
    typeof body,
    "object",
    `respuesta inesperada: ${JSON.stringify(body)}`,
  );
  assert.notEqual(body, null, "respuesta nula");
  return body as Record<string, unknown>;
}

interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** Crea un usuario en Auth y devuelve su access token real. */
async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `fase7-${isAdmin ? "admin" : "user"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Fx-${Math.random().toString(36).slice(2)}-A9`;

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
  assert.ok(user.id, `no se pudo crear el usuario de prueba: ${JSON.stringify(user)}`);

  if (isAdmin) {
    // Alta de admin fuera de banda, como exige DEC-020: no existe ningún
    // camino en la aplicación que conceda este rol.
    const profile = await admin("profiles", {
      method: "POST",
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Fixture" }),
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

  return { id: user.id, email, token: tokens.access_token };
}

async function deleteUser(id: string): Promise<void> {
  await admin(`profiles?id=eq.${id}`, { method: "DELETE" });
  await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

/** Crea un pedido REAL por el camino público (`create_order` con la anon key). */
async function makeOrder(
  variantId: string,
  quantity = 1,
): Promise<{ id: string; number: string }> {
  const response = await fetch(`${env!.url}/rest/v1/rpc/create_order`, {
    method: "POST",
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${env!.anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity }],
      p_customer_phone: "+34 600 11 22 33",
      p_customer_name: "Fixture Fase 7",
      p_client_request_id: crypto.randomUUID(),
    }),
  });
  const body = (await response.json()) as { order_id?: string; order_number?: string };
  assert.ok(body.order_id, `create_order falló: ${JSON.stringify(body)}`);
  return { id: body.order_id, number: body.order_number! };
}

async function stockOf(variantId: string): Promise<number> {
  const rows = (await admin(`product_variants?select=stock&id=eq.${variantId}`))
    .body as { stock: number }[];
  return rows[0].stock;
}

async function statusOf(orderId: string): Promise<string> {
  const rows = (await admin(`orders?select=status&id=eq.${orderId}`)).body as {
    status: string;
  }[];
  return rows[0].status;
}

async function eventsOf(
  orderId: string,
): Promise<{ from_status: string | null; to_status: string; note: string | null; actor_id: string | null }[]> {
  return (
    await admin(
      `order_events?select=from_status,to_status,note,actor_id&order_id=eq.${orderId}&order=created_at.asc`,
    )
  ).body as {
    from_status: string | null;
    to_status: string;
    note: string | null;
    actor_id: string | null;
  }[];
}

/** Lleva un pedido hasta el estado pedido usando solo transiciones legales. */
const CHAIN = [
  "pending",
  "contacted",
  "confirmed",
  "paid",
  "preparing",
  "shipped",
  "delivered",
] as const;

describe("admin_update_order_status — integración contra Supabase real", { skip }, () => {
  let adminUser: TestUser;
  let plainUser: TestUser;
  /** Producto + variante DESECHABLES. */
  let productId = "";
  let variantId = "";

  before(async () => {
    // Se usa un fixture propio y no una variante del seed: esta suite crea
    // decenas de pedidos y agotaría el stock real (lo descubrió el primer
    // intento, que falló con OUT_OF_STOCK). Así el catálogo sembrado queda
    // intacto y el baseline no depende de restaurar nada a mano.
    const slug = `fx-fase7-${Math.random().toString(36).slice(2, 10)}`;
    const categoryId = (
      (await admin("categories?select=id&market_id=eq.ES&limit=1")).body as {
        id: string;
      }[]
    )[0].id;
    const colorId = ((await admin("colors?select=id&limit=1")).body as { id: string }[])[0].id;
    const sizeId = (
      (await admin("sizes?select=id&size_group=eq.apparel&order=sort_order&limit=1"))
        .body as { id: string }[]
    )[0].id;

    const product = await admin("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        market_id: "ES",
        category_id: categoryId,
        name: `FIXTURE ${slug}`,
        slug,
        // Borrador primero: publicar sin variantes activas lo rechaza el
        // trigger `enforce_publishable_product` (migración 0031). Se publica
        // justo después de crear la variante.
        status: "draft",
      }),
    });
    productId = (product.body as { id: string }[])[0].id;

    const variant = await admin("product_variants", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_id: productId,
        color_id: colorId,
        size_id: sizeId,
        sku: `FX-${slug}`,
        price: 10,
        stock: 500,
        is_active: true,
      }),
    });
    variantId = (variant.body as { id: string }[])[0].id;

    await admin(`products?id=eq.${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });

    adminUser = await createUser(true);
    plainUser = await createUser(false);
  });

  after(async () => {
    await admin("order_items?order_id=not.is.null", { method: "DELETE" });
    // order_events cae por `on delete cascade` al borrar el pedido.
    await admin("orders?id=not.is.null", { method: "DELETE" });
    await admin("customers?id=not.is.null", { method: "DELETE" });
    await admin("order_counters?market_id=not.is.null", { method: "DELETE" });
    if (variantId) await admin(`product_variants?id=eq.${variantId}`, { method: "DELETE" });
    if (productId) await admin(`products?id=eq.${productId}`, { method: "DELETE" });
    if (adminUser) await deleteUser(adminUser.id);
    if (plainUser) await deleteUser(plainUser.id);
  });

  async function advanceTo(orderId: string, target: string): Promise<void> {
    const targetIndex = CHAIN.indexOf(target as (typeof CHAIN)[number]);
    for (let i = 1; i <= targetIndex; i++) {
      const to = CHAIN[i];
      const response = await callStatusRpc(
        {
          p_order_id: orderId,
          p_to_status: to,
          ...(to === "paid" ? { p_payment_confirmed: true } : {}),
        },
        adminUser.token,
      );
      assert.equal(response.status, 200, `avanzar a ${to}: ${errorCode(response.body)}`);
    }
  }

  // ───────────────────────────────────────────────────────────── AUTORIZACIÓN

  describe("autorización", () => {
    test("anon no puede ejecutar la función", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "contacted" },
        null,
      );
      assert.notEqual(response.status, 200, JSON.stringify(response.body));
      assert.equal(await statusOf(order.id), "pending");
    });

    test("authenticated sin rol admin es rechazado", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "contacted" },
        plainUser.token,
      );
      assert.notEqual(response.status, 200);
      assert.match(errorCode(response.body), /FORBIDDEN|permission|not exist/i);
      assert.equal(
        await statusOf(order.id),
        "pending",
        "el pedido no debe haber cambiado",
      );
      assert.equal((await eventsOf(order.id)).length, 1, "no debe crear evento");
    });

    test("admin sí puede", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "contacted" },
        adminUser.token,
      );
      assert.equal(response.status, 200, errorCode(response.body));
      assert.equal(await statusOf(order.id), "contacted");
    });

    test("un no-admin tampoco puede saltarse la función y hacer UPDATE directo", async () => {
      const order = await makeOrder(variantId);
      const response = await fetch(
        `${env!.url}/rest/v1/orders?id=eq.${order.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: env!.anon,
            Authorization: `Bearer ${plainUser.token}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ status: "paid" }),
        },
      );
      const body = (await response.json()) as unknown;
      assert.deepEqual(body, [], "RLS debe dejarlo en 0 filas afectadas");
      assert.equal(await statusOf(order.id), "pending");
    });
  });

  // ─────────────────────────────────────────────────────────────── TRANSICIONES

  describe("transiciones", () => {
    test("la cadena completa pending → delivered es válida", async () => {
      const order = await makeOrder(variantId);
      for (let i = 1; i < CHAIN.length; i++) {
        const to = CHAIN[i];
        const response = await callStatusRpc(
          {
            p_order_id: order.id,
            p_to_status: to,
            ...(to === "paid" ? { p_payment_confirmed: true } : {}),
          },
          adminUser.token,
        );
        assert.equal(response.status, 200, `${CHAIN[i - 1]} → ${to}: ${errorCode(response.body)}`);
        assert.equal(result(response.body).previous_status, CHAIN[i - 1]);
        assert.equal(result(response.body).status, to);
      }
      assert.equal(await statusOf(order.id), "delivered");
    });

    test("saltarse un paso es ilegal (pending → paid)", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "paid", p_payment_confirmed: true },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "TRANSITION_NOT_ALLOWED");
      assert.equal(await statusOf(order.id), "pending");
    });

    test("retroceder es ilegal (contacted → pending)", async () => {
      const order = await makeOrder(variantId);
      await advanceTo(order.id, "contacted");
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "pending" },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "TRANSITION_NOT_ALLOWED");
      assert.equal(await statusOf(order.id), "contacted");
    });

    test("repetir el estado actual es ilegal", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "pending" },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "TRANSITION_NOT_ALLOWED");
    });

    test("delivered es terminal: ni siquiera admite cancelación", async () => {
      const order = await makeOrder(variantId);
      await advanceTo(order.id, "delivered");
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "TRANSITION_NOT_ALLOWED");
      assert.equal(await statusOf(order.id), "delivered");
    });

    test("cancelled es terminal", async () => {
      const order = await makeOrder(variantId);
      await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      for (const to of ["contacted", "confirmed", "pending", "delivered"]) {
        const response = await callStatusRpc(
          { p_order_id: order.id, p_to_status: to },
          adminUser.token,
        );
        assert.equal(errorCode(response.body), "TRANSITION_NOT_ALLOWED", `→ ${to}`);
      }
      assert.equal(await statusOf(order.id), "cancelled");
    });

    test("cancelar es legal desde cualquier estado no terminal", async () => {
      for (const from of ["pending", "contacted", "confirmed", "paid", "preparing", "shipped"]) {
        const order = await makeOrder(variantId);
        await advanceTo(order.id, from);
        const response = await callStatusRpc(
          { p_order_id: order.id, p_to_status: "cancelled" },
          adminUser.token,
        );
        assert.equal(response.status, 200, `${from} → cancelled: ${errorCode(response.body)}`);
      }
    });
  });

  // ───────────────────────────────────────────────────── ESTADOS MANIPULADOS

  describe("input manipulado", () => {
    test("un estado inventado se rechaza", async () => {
      const order = await makeOrder(variantId);
      for (const bad of ["PAID", "superadmin", "", "refunded", "pending; drop table orders"]) {
        const response = await callStatusRpc(
          { p_order_id: order.id, p_to_status: bad },
          adminUser.token,
        );
        assert.equal(errorCode(response.body), "INVALID_STATUS", `estado "${bad}"`);
      }
      assert.equal(await statusOf(order.id), "pending");
    });

    test("un pedido inexistente da ORDER_NOT_FOUND, no un 500", async () => {
      const response = await callStatusRpc(
        { p_order_id: crypto.randomUUID(), p_to_status: "contacted" },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "ORDER_NOT_FOUND");
    });

    test("una nota gigante se rechaza", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "contacted", p_note: "x".repeat(501) },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "INVALID_INPUT");
      assert.equal(await statusOf(order.id), "pending");
    });
  });

  // ────────────────────────────────────────────────────────────────── PAGO

  describe("paid nunca es automático", () => {
    test("sin confirmación explícita se rechaza", async () => {
      const order = await makeOrder(variantId);
      await advanceTo(order.id, "confirmed");
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "paid" },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "PAYMENT_NOT_CONFIRMED");
      assert.equal(await statusOf(order.id), "confirmed");
    });

    test("con p_payment_confirmed = false explícito tampoco", async () => {
      const order = await makeOrder(variantId);
      await advanceTo(order.id, "confirmed");
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "paid", p_payment_confirmed: false },
        adminUser.token,
      );
      assert.equal(errorCode(response.body), "PAYMENT_NOT_CONFIRMED");
    });

    test("un pedido nace pending, nunca paid", async () => {
      const order = await makeOrder(variantId);
      assert.equal(await statusOf(order.id), "pending");
    });
  });

  // ────────────────────────────────────────────────────────────── AUDITORÍA

  describe("auditoría", () => {
    test("cada transición escribe su order_event con actor y estados", async () => {
      const order = await makeOrder(variantId);
      await advanceTo(order.id, "confirmed");

      const events = await eventsOf(order.id);
      assert.equal(events.length, 3, "creación + 2 transiciones");
      assert.equal(events[0].to_status, "pending");
      assert.deepEqual(
        events.slice(1).map((e) => [e.from_status, e.to_status]),
        [
          ["pending", "contacted"],
          ["contacted", "confirmed"],
        ],
      );
      for (const event of events.slice(1)) {
        assert.equal(
          event.actor_id,
          adminUser.id,
          "el evento debe registrar QUIÉN lo hizo",
        );
      }
      assert.equal(events[0].actor_id, null, "el evento de creación no tiene actor");
    });

    test("la nota del admin se guarda", async () => {
      const order = await makeOrder(variantId);
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "contacted", p_note: "  Le escribí por WhatsApp  " },
        adminUser.token,
      );
      assert.equal(response.status, 200, errorCode(response.body));
      const events = await eventsOf(order.id);
      assert.equal(events[1].note, "Le escribí por WhatsApp", "debe recortar espacios");
    });

    test("una transición rechazada NO deja evento", async () => {
      const order = await makeOrder(variantId);
      await callStatusRpc(
        { p_order_id: order.id, p_to_status: "delivered" },
        adminUser.token,
      );
      assert.equal((await eventsOf(order.id)).length, 1, "solo el de creación");
    });

    test("el historial es append-only incluso para el admin", async () => {
      const order = await makeOrder(variantId);
      await advanceTo(order.id, "contacted");
      const events = (
        await admin(`order_events?select=id&order_id=eq.${order.id}&limit=1`)
      ).body as { id: string }[];

      for (const method of ["PATCH", "DELETE"]) {
        const response = await fetch(
          `${env!.url}/rest/v1/order_events?id=eq.${events[0].id}`,
          {
            method,
            headers: {
              apikey: env!.anon,
              Authorization: `Bearer ${adminUser.token}`,
              "Content-Type": "application/json",
            },
            ...(method === "PATCH"
              ? { body: JSON.stringify({ note: "reescrito" }) }
              : {}),
          },
        );
        assert.ok(
          response.status >= 400,
          `${method} sobre order_events debería fallar, dio ${response.status}`,
        );
      }
      assert.equal((await eventsOf(order.id)).length, 2, "nada se borró");
    });
  });

  // ──────────────────────────────────────────────────────────────── STOCK

  describe("cancelación y stock (DEC-033)", () => {
    test("cancelar devuelve exactamente las unidades del pedido", async () => {
      const before = await stockOf(variantId);
      const order = await makeOrder(variantId, 2);
      assert.equal(await stockOf(variantId), before - 2, "create_order descuenta");

      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      assert.equal(response.status, 200, errorCode(response.body));
      assert.equal(result(response.body).stock_restored_units, 2);
      assert.equal(await stockOf(variantId), before, "stock restaurado al original");
    });

    test("cancelar dos veces NO devuelve el stock dos veces", async () => {
      const before = await stockOf(variantId);
      const order = await makeOrder(variantId, 3);
      await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      assert.equal(await stockOf(variantId), before);

      const second = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      assert.equal(errorCode(second.body), "TRANSITION_NOT_ALLOWED");
      assert.equal(await stockOf(variantId), before, "el stock NO se duplicó");
      assert.equal(
        (await eventsOf(order.id)).filter((e) => e.to_status === "cancelled").length,
        1,
        "un solo evento de cancelación",
      );
    });

    test("10 cancelaciones simultáneas: solo una devuelve stock", async () => {
      const before = await stockOf(variantId);
      const order = await makeOrder(variantId, 2);

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          callStatusRpc(
            { p_order_id: order.id, p_to_status: "cancelled" },
            adminUser.token,
          ),
        ),
      );

      const ok = responses.filter((r) => r.status === 200);
      assert.equal(ok.length, 1, "exactamente una cancelación debe triunfar");
      assert.equal(await stockOf(variantId), before, "stock devuelto UNA vez");
      assert.equal(
        (await eventsOf(order.id)).filter((e) => e.to_status === "cancelled").length,
        1,
      );
    });

    test("cancelar un pedido ya enviado también devuelve stock (DEC-033)", async () => {
      const before = await stockOf(variantId);
      const order = await makeOrder(variantId, 1);
      await advanceTo(order.id, "shipped");
      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      assert.equal(result(response.body).stock_restored_units, 1);
      assert.equal(await stockOf(variantId), before);
    });

    test("una transición que no es cancelación no toca el stock", async () => {
      const order = await makeOrder(variantId, 1);
      const before = await stockOf(variantId);
      await advanceTo(order.id, "confirmed");
      assert.equal(await stockOf(variantId), before, "solo cancelar mueve stock");
    });

    test("el evento de cancelación deja constancia del stock devuelto", async () => {
      const order = await makeOrder(variantId, 2);
      await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled", p_note: "Cliente se arrepintió" },
        adminUser.token,
      );
      const events = await eventsOf(order.id);
      const cancellation = events.find((e) => e.to_status === "cancelled");
      assert.ok(cancellation, "debe existir el evento");
      assert.match(cancellation.note ?? "", /Cliente se arrepintió/);
      assert.match(cancellation.note ?? "", /stock devuelto: 2 uds/);
    });

    test("una línea sin variante viva no inventa stock", async () => {
      const order = await makeOrder(variantId, 1);
      const before = await stockOf(variantId);
      // Simula la variante borrada: `order_items.variant_id` es ON DELETE SET NULL.
      await admin(`order_items?order_id=eq.${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ variant_id: null }),
      });

      const response = await callStatusRpc(
        { p_order_id: order.id, p_to_status: "cancelled" },
        adminUser.token,
      );
      assert.equal(response.status, 200, errorCode(response.body));
      assert.equal(result(response.body).stock_restored_units, 0);
      assert.equal(result(response.body).stock_skipped_lines, 1);
      assert.equal(await stockOf(variantId), before, "no se devuelve a ciegas");

      const cancellation = (await eventsOf(order.id)).find(
        (e) => e.to_status === "cancelled",
      );
      assert.match(
        cancellation?.note ?? "",
        /sin variante viva/,
        "la limitación queda documentada en el historial",
      );
    });
  });
});
