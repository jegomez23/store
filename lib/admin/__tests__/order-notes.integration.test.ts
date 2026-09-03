import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Integración de las notas internas del pedido (Fase 9.5, 5A, migración 0027)
 * contra el Supabase REAL.
 *
 * Lo que estos tests protegen, por orden de importancia:
 *   1. **AUTORÍA NO FALSIFICABLE.** Un admin no puede firmar una nota como
 *      otro administrador, ni siquiera enviando `actor_id` a mano por POST
 *      directo a PostgREST. Es lo que hace que la firma valga algo.
 *   2. **APPEND-ONLY.** UPDATE y DELETE están revocados. Una nota es constancia
 *      de lo que se dijo; poder reescribirla la haría inútil como constancia.
 *   3. **INVISIBILIDAD PARA ANON.** Las notas llevan la dirección del cliente.
 *      Ni anon ni un autenticado sin rol las leen.
 *   4. **CONCURRENCIA.** Dos notas simultáneas sobre el mismo pedido son dos
 *      filas. Ninguna pisa a la otra.
 *   5. **AISLAMIENTO.** Una nota no cambia el estado del pedido ni el stock.
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

/** Cliente con service role: SOLO para montar y limpiar fixtures. */
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

/** Cliente con anon key + el token que se le pase: el camino REAL del panel. */
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

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `note-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Nt-${Math.random().toString(36).slice(2)}-D5`;

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
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Prueba" }),
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

const PFX = "ZZ-F95A";

let adminA: TestUser;
let adminB: TestUser;
let plainUser: TestUser;
let esOrderId = "";
let coOrderId = "";
let esCustomerId = "";

async function makeOrder(market: string, suffix: string) {
  const { body: customer } = await db("customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: market,
      phone: `34999${Date.now().toString().slice(-6)}${suffix}`,
      name: `${PFX} Cliente`,
    }),
  });
  const customerId = (customer as { id: string }[])[0].id;

  const { body: order } = await db("orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_number: `${PFX}-${suffix}-${Date.now().toString().slice(-6)}`,
      market_id: market,
      customer_id: customerId,
      channel: "whatsapp",
      status: "pending",
      currency_code: market === "ES" ? "EUR" : "COP",
      subtotal: 10,
      total: 10,
    }),
  });
  const row = (order as { id: string; order_number: string }[])[0];
  return { id: row.id, number: row.order_number, customerId };
}

async function cleanup() {
  if (!env) return;
  const { body: orders } = await db(`orders?order_number=like.${PFX}*&select=id`);
  for (const o of (orders ?? []) as { id: string }[]) {
    await db(`order_notes?order_id=eq.${o.id}`, { method: "DELETE" });
    await db(`order_events?order_id=eq.${o.id}`, { method: "DELETE" });
    await db(`orders?id=eq.${o.id}`, { method: "DELETE" });
  }
  await db(`customers?name=like.${PFX}*`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();
  adminA = await createUser(true);
  adminB = await createUser(true);
  plainUser = await createUser(false);

  const es = await makeOrder("ES", "es");
  esOrderId = es.id;

  esCustomerId = es.customerId;

  const co = await makeOrder("CO", "co");
  coOrderId = co.id;
});

after(async () => {
  if (!env) return;
  await cleanup();
  for (const user of [adminA, adminB, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

// ───────────────────────────────────────────── autoría no falsificable

describe("order_notes · autoría", { skip }, () => {
  test("el actor_id lo pone la base, no el cliente", async () => {
    const { status, body } = await as(adminA.token, "order_notes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ order_id: esOrderId, body: "Calle Mayor 3, 2º B" }),
    });

    assert.equal(status, 201, JSON.stringify(body));
    const note = (body as { actor_id: string; created_at: string }[])[0];
    // No se envió actor_id en el payload: lo puso el DEFAULT auth.uid().
    assert.equal(note.actor_id, adminA.id);
    assert.ok(note.created_at, "created_at debe venir de la base");
  });

  test("un admin NO puede firmar una nota como otro admin", async () => {
    // POST directo a PostgREST, saltándose la UI por completo: exactamente lo
    // que hace alguien que quiere fabricar una nota a nombre de otro.
    const { status, body } = await as(adminA.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({
        order_id: esOrderId,
        body: "Nota falsificada",
        actor_id: adminB.id,
      }),
    });

    // La policy exige actor_id = auth.uid(): el WITH CHECK lo rechaza.
    assert.equal(status, 403, JSON.stringify(body));

    const { body: rows } = await db(
      `order_notes?order_id=eq.${esOrderId}&body=eq.Nota falsificada&select=id`,
    );
    assert.equal((rows as unknown[]).length, 0, "no debe haberse escrito nada");
  });

  test("tampoco puede firmar como un uuid inventado", async () => {
    const { status } = await as(adminA.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({
        order_id: esOrderId,
        body: "Nota de nadie",
        actor_id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    assert.equal(status, 403);
  });
});

// ───────────────────────────────────────────── append-only

describe("order_notes · append-only", { skip }, () => {
  test("un admin no puede reescribir una nota ya escrita", async () => {
    const { body } = await as(adminA.token, "order_notes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ order_id: esOrderId, body: "Original" }),
    });
    const id = (body as { id: string }[])[0].id;

    const patched = await as(adminA.token, `order_notes?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: "Reescrita" }),
    });
    assert.notEqual(patched.status, 200);
    assert.notEqual(patched.status, 204);

    const { body: after } = await db(`order_notes?id=eq.${id}&select=body`);
    assert.equal((after as { body: string }[])[0].body, "Original");
  });

  test("un admin no puede borrar una nota", async () => {
    const { body } = await as(adminA.token, "order_notes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ order_id: esOrderId, body: "Indeleble" }),
    });
    const id = (body as { id: string }[])[0].id;

    const deleted = await as(adminA.token, `order_notes?id=eq.${id}`, {
      method: "DELETE",
    });
    assert.notEqual(deleted.status, 204);

    const { body: after } = await db(`order_notes?id=eq.${id}&select=id`);
    assert.equal((after as unknown[]).length, 1, "la nota debe seguir ahí");
  });
});

// ───────────────────────────────────────────── quién puede leerlas

describe("order_notes · acceso", { skip }, () => {
  test("anon no ve ni una nota", async () => {
    const { body } = await as(null, "order_notes?select=id,body");
    // Sin policy para anon: RLS devuelve el conjunto vacío, no un error.
    assert.deepEqual(body, []);
  });

  test("anon no puede escribir una nota", async () => {
    const { status } = await as(null, "order_notes", {
      method: "POST",
      body: JSON.stringify({ order_id: esOrderId, body: "Desde fuera" }),
    });
    assert.notEqual(status, 201);
  });

  test("un autenticado SIN rol de admin no ve ni escribe notas", async () => {
    const { body: read } = await as(plainUser.token, "order_notes?select=id");
    assert.deepEqual(read, []);

    const { status } = await as(plainUser.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({ order_id: esOrderId, body: "Sin rol" }),
    });
    assert.notEqual(status, 201);
  });

  test("CONTROL POSITIVO: el admin sí las lee", async () => {
    const { body } = await as(
      adminA.token,
      `order_notes?order_id=eq.${esOrderId}&select=id`,
    );
    assert.ok(
      (body as unknown[]).length > 0,
      "si esto falla, los tests de arriba pasan por un motivo equivocado",
    );
  });
});

// ───────────────────────────────────────────── contenido

describe("order_notes · contenido", { skip }, () => {
  test("rechaza una nota vacía o de solo espacios", async () => {
    for (const value of ["", "   ", "\n\t "]) {
      const { status } = await as(adminA.token, "order_notes", {
        method: "POST",
        body: JSON.stringify({ order_id: esOrderId, body: value }),
      });
      assert.equal(status, 400, `debía rechazar ${JSON.stringify(value)}`);
    }
  });

  test("rechaza más de 2000 caracteres y acepta exactamente 2000", async () => {
    const tooLong = await as(adminA.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({ order_id: esOrderId, body: "a".repeat(2001) }),
    });
    assert.equal(tooLong.status, 400);

    const exact = await as(adminA.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({ order_id: esOrderId, body: "b".repeat(2000) }),
    });
    assert.equal(exact.status, 201);
  });

  test("conserva los saltos de línea de una dirección pegada del chat", async () => {
    const direccion = "Calle Mayor 3\n2º B\n28013 Madrid";
    const { body } = await as(adminA.token, "order_notes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ order_id: esOrderId, body: direccion }),
    });
    assert.equal((body as { body: string }[])[0].body, direccion);
  });
});

// ───────────────────────────────────────────── concurrencia

describe("order_notes · concurrencia", { skip }, () => {
  test("dos administradores escriben a la vez y no se pisan", async () => {
    const order = await makeOrder("ES", "cc1");

    const [a, b] = await Promise.all([
      as(adminA.token, "order_notes", {
        method: "POST",
        body: JSON.stringify({ order_id: order.id, body: "Nota de A" }),
      }),
      as(adminB.token, "order_notes", {
        method: "POST",
        body: JSON.stringify({ order_id: order.id, body: "Nota de B" }),
      }),
    ]);

    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const { body: rows } = await db(
      `order_notes?order_id=eq.${order.id}&select=body,actor_id&order=created_at`,
    );
    const notes = rows as { body: string; actor_id: string }[];
    assert.equal(notes.length, 2, "deben existir las DOS notas");
    // Y cada una conserva a su autor: la simultaneidad no mezcla las firmas.
    assert.equal(notes.find((n) => n.body === "Nota de A")?.actor_id, adminA.id);
    assert.equal(notes.find((n) => n.body === "Nota de B")?.actor_id, adminB.id);
  });

  test("diez notas simultáneas sobre el mismo pedido son diez filas", async () => {
    const order = await makeOrder("ES", "cc2");

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        as(adminA.token, "order_notes", {
          method: "POST",
          body: JSON.stringify({ order_id: order.id, body: `Simultánea ${i}` }),
        }),
      ),
    );
    for (const r of results) assert.equal(r.status, 201);

    const { body: rows } = await db(
      `order_notes?order_id=eq.${order.id}&select=body`,
    );
    // Insertar filas no tiene el problema de la reposición de stock: no hay
    // read-modify-write, así que no hay nada que perder. Se comprueba igual.
    assert.equal((rows as unknown[]).length, 10);
  });

  test("el doble submit de un formulario crea DOS notas, no una", async () => {
    // Comportamiento esperado y documentado: una nota no es idempotente. Dos
    // pulsaciones son dos apuntes, igual que en una libreta. No se silencia
    // ninguna: silenciarla perdería lo que alguien quiso escribir.
    const order = await makeOrder("ES", "cc3");
    const payload = JSON.stringify({ order_id: order.id, body: "Doble submit" });

    await as(adminA.token, "order_notes", { method: "POST", body: payload });
    await as(adminA.token, "order_notes", { method: "POST", body: payload });

    const { body: rows } = await db(`order_notes?order_id=eq.${order.id}&select=id`);
    assert.equal((rows as unknown[]).length, 2);
  });
});

// ───────────────────────────────────────────── lo que una nota NO toca

describe("order_notes · efectos colaterales", { skip }, () => {
  test("escribir una nota no cambia el estado del pedido", async () => {
    const order = await makeOrder("ES", "fx1");

    await as(adminA.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({ order_id: order.id, body: "No cambies nada" }),
    });

    const { body } = await db(
      `orders?id=eq.${order.id}&select=status,updated_at,created_at`,
    );
    const row = (body as { status: string; updated_at: string; created_at: string }[])[0];
    assert.equal(row.status, "pending");
    // Y no toca `updated_at`, que es lo que mide la antigüedad del estado en el
    // listado: una nota no puede hacer que un pedido parezca recién movido.
    assert.equal(row.updated_at, row.created_at);
  });

  test("escribir una nota no crea ningún order_event", async () => {
    const order = await makeOrder("ES", "fx2");

    await as(adminA.token, "order_notes", {
      method: "POST",
      body: JSON.stringify({ order_id: order.id, body: "Sin eventos" }),
    });

    const { body } = await db(`order_events?order_id=eq.${order.id}&select=id`);
    assert.equal(
      (body as unknown[]).length,
      0,
      "las notas y el historial de transiciones son tablas separadas a propósito",
    );
  });
});

// ───────────────────────────────────────────── mercado y cliente recurrente

describe("order_notes · mercado y contexto", { skip }, () => {
  test("el pedido se resuelve por (mercado, número): un número de CO no existe en ES", async () => {
    // Es la barrera que aplica la action: no acepta un id, resuelve el número
    // filtrando por el mercado activo del servidor.
    const { body: co } = await db(`orders?id=eq.${coOrderId}&select=order_number`);
    const coNumber = (co as { order_number: string }[])[0].order_number;

    const { body: found } = await as(
      adminA.token,
      `orders?market_id=eq.ES&order_number=eq.${coNumber}&select=id`,
    );
    assert.deepEqual(found, [], "un número de CO no debe encontrarse en ES");
  });

  test("el recuento de pedidos del cliente es exacto y no cruza mercados", async () => {
    // `customers` es única por (market_id, phone): quien vuelve es la misma
    // fila. Se añade un segundo pedido al mismo cliente de ES.
    const { body: second } = await db("orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        order_number: `${PFX}-rep-${Date.now().toString().slice(-6)}`,
        market_id: "ES",
        customer_id: esCustomerId,
        channel: "whatsapp",
        status: "pending",
        currency_code: "EUR",
        subtotal: 5,
        total: 5,
      }),
    });
    assert.ok((second as unknown[]).length === 1);

    const response = await fetch(
      `${env!.url}/rest/v1/orders?select=id&market_id=eq.ES&customer_id=eq.${esCustomerId}`,
      {
        method: "HEAD",
        headers: {
          apikey: env!.anon,
          Authorization: `Bearer ${adminA.token}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    );
    // Mismo camino que usa el data layer: `head: true` + count exacto, así que
    // el número sale de la cabecera y NO viaja ni una fila.
    const range = response.headers.get("content-range");
    assert.equal(range?.split("/")[1], "2");
  });
});
