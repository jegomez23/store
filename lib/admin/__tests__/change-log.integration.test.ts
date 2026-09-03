import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Integración de la auditoría administrativa (Fase 9.5, 5C, migración 0032)
 * contra el Supabase REAL.
 *
 * Lo que protegen, por orden de importancia:
 *   1. **EL TRIGGER ES LA ÚNICA AUTORIDAD.** Un admin no puede insertar,
 *      modificar ni borrar un registro de auditoría. Ni por POST directo.
 *   2. **REGISTRA EL CAMBIO REAL**, el que quedó en la fila, no el que la
 *      interfaz creía escribir. De ahí que la concurrencia salga bien.
 *   3. **NO DUPLICA `order_events`.** Ventas y cancelaciones no entran.
 *   4. **NO GENERA BASURA.** Escribir el mismo valor no produce un registro.
 *
 * Los fixtures se crean y se BORRAN aquí; la BD vuelve a su baseline.
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

/** Service role: SOLO para montar y limpiar fixtures y para LEER el log. */
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

/** Anon key + token: el camino REAL del panel, el que dispara el trigger. */
async function as(token: string | null, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    apikey: env!.anon,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${env!.url}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function rpc(token: string | null, fn: string, args: unknown) {
  const headers: Record<string, string> = {
    apikey: env!.anon,
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${env!.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
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
  const email = `log-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Lg-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Log" }),
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

const PFX = "zz-5c-log";

let adminA: TestUser;
let adminB: TestUser;
let plainUser: TestUser;
let categoryId = "";

interface LogRow {
  id: number;
  product_id: string;
  variant_id: string | null;
  sku: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  actor_id: string;
  created_at: string;
}

async function logOf(productId: string): Promise<LogRow[]> {
  const { body } = await db(
    `admin_change_log?product_id=eq.${productId}&select=*&order=id`,
  );
  return (body ?? []) as LogRow[];
}

/** Producto publicado por el camino real: borrador → variante → publicar. */
async function makeProduct(stock = 10, price = 20): Promise<{ id: string; variantId: string }> {
  const { body: p } = await db("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      category_id: categoryId,
      name: `ZZ 5C ${Math.random().toString(36).slice(2, 7)}`,
      slug: `${PFX}-${Math.random().toString(36).slice(2, 8)}`,
      status: "draft",
    }),
  });
  const id = (p as { id: string }[])[0].id;

  const { body: v } = await db("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: id,
      sku: `${PFX}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
      price,
      stock,
      is_active: true,
    }),
  });
  const variantId = (v as { id: string }[])[0].id;

  // Publicar con la service role NO deja rastro (sin `auth.uid()`), así que el
  // fixture nace limpio y cada test empieza con el log de su producto vacío.
  await db(`products?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });

  return { id, variantId };
}

async function cleanup() {
  if (!env) return;
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
  adminA = await createUser(true);
  adminB = await createUser(true);
  plainUser = await createUser(false);

  const { body } = await db("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ 5C log",
      slug: `${PFX}-cat`,
      sort_order: 999,
    }),
  });
  categoryId = (body as { id: string }[])[0].id;
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [adminA, adminB, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

// ───────────────────────────────────── lo básico: qué, cuándo, quién, de → a

describe("admin_change_log · registra la decisión", { skip }, () => {
  test("un cambio de precio deja quién, cuándo y de cuánto a cuánto", async () => {
    const { id, variantId } = await makeProduct(10, 29.9);

    const patch = await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 34.9 }),
    });
    assert.ok(patch.status < 300, JSON.stringify(patch.body));

    const rows = await logOf(id);
    assert.equal(rows.length, 1, JSON.stringify(rows));
    const row = rows[0];
    assert.equal(row.field_name, "price");
    assert.equal(Number(row.old_value), 29.9);
    assert.equal(Number(row.new_value), 34.9);
    assert.equal(row.actor_id, adminA.id, "la autoría sale de auth.uid()");
    assert.equal(row.variant_id, variantId);
    assert.ok(row.sku, "el SKU se guarda para poder leerlo tras un borrado");
    assert.ok(Date.parse(row.created_at) > 0);
  });

  test("distingue REPOSICIÓN de CORRECCIÓN por el camino usado", async () => {
    const { id, variantId } = await makeProduct(10);

    // Reposición: RPC.
    const restock = await rpc(adminA.token, "admin_restock_variants", {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, delta: 12 }],
    });
    assert.ok(restock.status < 300, JSON.stringify(restock.body));

    // Corrección absoluta: PATCH directo a la tabla.
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: 5 }),
    });

    const rows = await logOf(id);
    assert.equal(rows.length, 2, JSON.stringify(rows));
    assert.deepEqual(
      rows.map((r) => [r.source, r.old_value, r.new_value]),
      [
        ["reposicion", "10", "22"],
        ["correccion", "22", "5"],
      ],
    );
  });

  test("publicar, despublicar, archivar y desarchivar", async () => {
    const { id } = await makeProduct();

    for (const status of ["draft", "archived", "draft", "active"]) {
      const r = await as(adminA.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      assert.ok(r.status < 300, `${status}: ${JSON.stringify(r.body)}`);
    }

    const rows = await logOf(id);
    assert.deepEqual(
      rows.map((r) => `${r.old_value}→${r.new_value}`),
      ["active→draft", "draft→archived", "archived→draft", "draft→active"],
    );
    assert.ok(rows.every((r) => r.field_name === "status"));
    assert.ok(rows.every((r) => r.variant_id === null), "es un campo del producto");
  });

  test("el borrado lógico se registra pese a venir de NULL", async () => {
    // `deleted_at` es NULL casi toda su vida. Con `<>` en vez de
    // `is distinct from`, la comparación daría NULL y no se registraría nada.
    const { id } = await makeProduct();

    const r = await as(adminA.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        deleted_at: new Date().toISOString(),
        status: "archived",
      }),
    });
    assert.ok(r.status < 300, JSON.stringify(r.body));

    const rows = await logOf(id);
    const fields = rows.map((x) => x.field_name).sort();
    assert.deepEqual(fields, ["deleted_at", "status"], "un UPDATE, dos campos");

    const del = rows.find((x) => x.field_name === "deleted_at")!;
    assert.equal(del.old_value, null, "venía de NULL");
    assert.ok(del.new_value, "y va a una fecha");
  });

  test("restaurar un producto borrado también se registra", async () => {
    const { id } = await makeProduct();
    await as(adminA.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    await as(adminA.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: null }),
    });

    const rows = (await logOf(id)).filter((r) => r.field_name === "deleted_at");
    assert.equal(rows.length, 2);
    assert.equal(rows[1].new_value, null, "vuelve a NULL y queda constancia");
  });
});

// ───────────────────────────────────── nada de basura

describe("admin_change_log · no genera basura", { skip }, () => {
  test("escribir el MISMO precio no registra nada", async () => {
    const { id, variantId } = await makeProduct(10, 20);

    const r = await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 20 }),
    });
    assert.ok(r.status < 300);

    assert.deepEqual(await logOf(id), [], "20 → 20 no es un cambio");
  });

  test("el mismo status y el mismo stock tampoco", async () => {
    const { id, variantId } = await makeProduct(10);

    await as(adminA.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: 10 }),
    });

    assert.deepEqual(await logOf(id), []);
  });

  test("un `deleted_at` que sigue siendo NULL no registra nada", async () => {
    const { id } = await makeProduct();
    await as(adminA.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ deleted_at: null }),
    });
    assert.deepEqual(await logOf(id), [], "NULL → NULL no es un cambio");
  });

  test("cambiar el nombre o la descripción NO se audita", async () => {
    const { id } = await makeProduct();
    await as(adminA.token, `products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "ZZ 5C renombrado",
        short_description: "otra cosa",
        meta_title: "SEO nuevo",
      }),
    });
    assert.deepEqual(await logOf(id), [], "solo cuatro campos, no todo el UPDATE");
  });

  test("el umbral de stock bajo tampoco: no cuesta dinero ni visibilidad", async () => {
    const { id, variantId } = await makeProduct();
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ low_stock_threshold: 7 }),
    });
    assert.deepEqual(await logOf(id), []);
  });
});

// ───────────────────────────────────── no duplica order_events

describe("admin_change_log · no duplica order_events", { skip }, () => {
  test("una VENTA no genera auditoría administrativa", async () => {
    const { id, variantId } = await makeProduct(10);

    const order = await rpc(null, "create_order", {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 2 }],
      p_customer_phone: "34600111222",
      p_customer_name: "ZZ 5C Cliente",
      p_client_request_id: crypto.randomUUID(),
    });
    assert.ok(order.status < 300, JSON.stringify(order.body));

    const { body: variant } = await db(`product_variants?id=eq.${variantId}&select=stock`);
    assert.equal((variant as { stock: number }[])[0].stock, 8, "el stock sí bajó");

    assert.deepEqual(
      await logOf(id),
      [],
      "la venta la cubren el pedido, sus líneas y su order_event",
    );

    // Limpieza del pedido creado.
    const orderId = (order.body as { order_id: string }).order_id;
    await db(`order_events?order_id=eq.${orderId}`, { method: "DELETE" });
    await db(`order_items?order_id=eq.${orderId}`, { method: "DELETE" });
    await db(`orders?id=eq.${orderId}`, { method: "DELETE" });
    await db(`customers?name=like.ZZ 5C*`, { method: "DELETE" });
  });

  test("una CANCELACIÓN devuelve stock y tampoco genera auditoría", async () => {
    const { id, variantId } = await makeProduct(10);

    const order = await rpc(null, "create_order", {
      p_market_id: "ES",
      p_items: [{ variant_id: variantId, quantity: 3 }],
      p_customer_phone: "34600111333",
      p_customer_name: "ZZ 5C Cliente",
      p_client_request_id: crypto.randomUUID(),
    });
    const orderId = (order.body as { order_id: string }).order_id;

    const cancel = await rpc(adminA.token, "admin_update_order_status", {
      p_order_id: orderId,
      p_to_status: "cancelled",
    });
    assert.ok(cancel.status < 300, JSON.stringify(cancel.body));

    const { body: variant } = await db(`product_variants?id=eq.${variantId}&select=stock`);
    assert.equal((variant as { stock: number }[])[0].stock, 10, "el stock volvió");

    assert.deepEqual(
      await logOf(id),
      [],
      "order_events guarda actor, fecha y las unidades devueltas",
    );

    // Y el CONTROL POSITIVO de que la trazabilidad existe donde debe.
    const { body: events } = await db(
      `order_events?order_id=eq.${orderId}&select=to_status,note,actor_id`,
    );
    const cancelled = (events as { to_status: string; note: string; actor_id: string }[]).find(
      (e) => e.to_status === "cancelled",
    );
    assert.ok(cancelled, "debe existir el evento de cancelación");
    assert.equal(cancelled.actor_id, adminA.id);
    assert.match(cancelled.note, /stock devuelto/);

    await db(`order_events?order_id=eq.${orderId}`, { method: "DELETE" });
    await db(`order_items?order_id=eq.${orderId}`, { method: "DELETE" });
    await db(`orders?id=eq.${orderId}`, { method: "DELETE" });
    await db(`customers?name=like.ZZ 5C*`, { method: "DELETE" });
  });
});

// ───────────────────────────────────── la tabla no se puede tocar

describe("admin_change_log · append-only e infalsificable", { skip }, () => {
  test("un ADMIN no puede insertar un registro a mano", async () => {
    const { id } = await makeProduct();

    const { status } = await as(adminA.token, "admin_change_log", {
      method: "POST",
      body: JSON.stringify({
        product_id: id,
        field_name: "price",
        old_value: "100",
        new_value: "1",
        source: "directo",
        actor_id: adminB.id,
      }),
    });

    // Sin policy de INSERT y sin privilegio: no hay forma de fabricar un
    // registro diciendo que otro bajó un precio.
    assert.ok(status >= 400, `esperaba rechazo, dio ${status}`);
    assert.deepEqual(await logOf(id), []);
  });

  test("tampoco puede modificar ni borrar uno existente", async () => {
    const { id, variantId } = await makeProduct(10, 50);
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 10 }),
    });
    const rows = await logOf(id);
    assert.equal(rows.length, 1);

    const patched = await as(adminA.token, `admin_change_log?id=eq.${rows[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ new_value: "999" }),
    });
    assert.ok(patched.status >= 400 || (await logOf(id))[0].new_value === "10");

    const deleted = await as(adminA.token, `admin_change_log?id=eq.${rows[0].id}`, {
      method: "DELETE",
    });
    assert.ok(deleted.status >= 400);
    assert.equal((await logOf(id)).length, 1, "el registro sigue ahí");
  });

  test("ANON no lee ni escribe la auditoría", async () => {
    const { body: read } = await as(null, "admin_change_log?select=id");
    assert.deepEqual(read, []);

    const { status } = await as(null, "admin_change_log", {
      method: "POST",
      body: JSON.stringify({ product_id: crypto.randomUUID(), field_name: "price", source: "directo" }),
    });
    assert.ok(status >= 400);
  });

  test("un autenticado SIN rol de admin tampoco la lee", async () => {
    const { body } = await as(plainUser.token, "admin_change_log?select=id");
    assert.deepEqual(body, []);
  });

  test("CONTROL POSITIVO: un admin SÍ la lee", async () => {
    const { id, variantId } = await makeProduct(10, 44);
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ price: 45 }),
    });

    const { body } = await as(
      adminA.token,
      `admin_change_log?product_id=eq.${id}&select=id,new_value`,
    );
    assert.equal((body as unknown[]).length, 1, "si esto falla, los de arriba engañan");
  });
});

// ───────────────────────────────────── concurrencia

describe("admin_change_log · concurrencia", { skip }, () => {
  test("dos reposiciones simultáneas encadenan, no se pisan", async () => {
    const { id, variantId } = await makeProduct(10);

    await Promise.all([
      rpc(adminA.token, "admin_restock_variants", {
        p_market_id: "ES",
        p_items: [{ variant_id: variantId, delta: 5 }],
      }),
      rpc(adminB.token, "admin_restock_variants", {
        p_market_id: "ES",
        p_items: [{ variant_id: variantId, delta: 7 }],
      }),
    ]);

    const rows = await logOf(id);
    assert.equal(rows.length, 2);

    // El orden de llegada no está garantizado, pero el ENCADENADO sí: el
    // `new_value` de uno es el `old_value` del otro, y se acaba en 22. Es lo
    // que hace que la auditoría no pueda decir 10→15 y 10→17.
    const pairs = rows.map((r) => [Number(r.old_value), Number(r.new_value)]);
    const encadenan =
      (pairs[0][1] === pairs[1][0]) && pairs[0][0] === 10 && pairs[1][1] === 22;
    assert.ok(encadenan, `esperaba una cadena 10→x→22, obtuve ${JSON.stringify(pairs)}`);

    const { body: variant } = await db(`product_variants?id=eq.${variantId}&select=stock`);
    assert.equal((variant as { stock: number }[])[0].stock, 22);
  });

  test("una corrección RECHAZADA por bloqueo optimista no deja rastro", async () => {
    // El escenario del enunciado: A y B ven 10; A escribe 20; B intenta 30 con
    // el testigo viejo y es rechazado. Solo puede existir 10 → 20.
    const { id, variantId } = await makeProduct(10);

    const { body: before } = await db(
      `product_variants?id=eq.${variantId}&select=updated_at`,
    );
    const staleToken = (before as { updated_at: string }[])[0].updated_at;

    const first = await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ stock: 20 }),
    });
    assert.equal((first.body as unknown[]).length, 1);

    // B llega con el testigo caducado: cero filas afectadas.
    const second = await as(
      adminB.token,
      `product_variants?id=eq.${variantId}&updated_at=eq.${encodeURIComponent(staleToken)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ stock: 30 }),
      },
    );
    assert.equal((second.body as unknown[]).length, 0, "debía rechazarse");

    const rows = await logOf(id);
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.deepEqual([rows[0].old_value, rows[0].new_value], ["10", "20"]);
    assert.equal(rows[0].actor_id, adminA.id);
  });

  test("dos correcciones ACEPTADAS encadenan 10 → 20 → 30", async () => {
    const { id, variantId } = await makeProduct(10);

    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: 20 }),
    });
    await as(adminB.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock: 30 }),
    });

    const rows = await logOf(id);
    assert.deepEqual(
      rows.map((r) => `${r.old_value}→${r.new_value}`),
      ["10→20", "20→30"],
      "nunca 10→20 y 10→30",
    );
    assert.deepEqual([rows[0].actor_id, rows[1].actor_id], [adminA.id, adminB.id]);
  });

  test("publicar y despublicar a la vez deja las dos decisiones", async () => {
    const { id } = await makeProduct();

    await Promise.all([
      as(adminA.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      }),
      as(adminB.token, `products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      }),
    ]);

    const rows = await logOf(id);
    assert.ok(rows.length >= 1 && rows.length <= 2, JSON.stringify(rows));
    // Sea cual sea el orden, el último `new_value` es el estado real de la fila.
    const { body: product } = await db(`products?id=eq.${id}&select=status`);
    assert.equal(
      rows[rows.length - 1].new_value,
      (product as { status: string }[])[0].status,
      "la auditoría refleja lo que quedó en PostgreSQL",
    );
  });

  test("el doble submit del mismo valor deja UN registro, no dos", async () => {
    const { id, variantId } = await makeProduct(10, 20);

    const payload = JSON.stringify({ price: 25 });
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: payload,
    });
    await as(adminA.token, `product_variants?id=eq.${variantId}`, {
      method: "PATCH",
      body: payload,
    });

    const rows = await logOf(id);
    assert.equal(rows.length, 1, "el segundo envío no cambia nada, así que no registra");
    assert.deepEqual([rows[0].old_value, rows[0].new_value], ["20.00", "25.00"]);
  });
});
