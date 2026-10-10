import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAX_UNITS_PER_ORDER, totalUnits } from "../limits.ts";
import { CHECKOUT_ERROR_CODES, checkoutErrorMessage } from "../errors.ts";
import { MAX_QUANTITY_PER_LINE as CART_MAX_PER_LINE } from "../../cart/reducer.ts";

/**
 * Límites anti-abuso del checkout (Fase 10, DEC-088).
 *
 * El tope de unidades está escrito en TRES sitios —la migración 0046, que es
 * la autoridad; `limits.ts`, que alimenta la validación y el aviso del
 * checkout; y el carrito, que no puede importar del checkout—. Estos tests
 * leen los tres y fallan si divergen.
 *
 * Además fijan el ORDEN dentro de `create_order`, que es parte de la garantía:
 * después de la idempotencia, bajo el candado y antes de tocar stock.
 */

/** La 0046 crea las columnas de umbral; la 0047 es la versión VIGENTE de la función. */
const sql = fs.readFileSync("supabase/migrations/0046_checkout_abuse_limits.sql", "utf8");
const current = fs.readFileSync(
  "supabase/migrations/0047_checkout_lock_before_idempotency.sql",
  "utf8",
);

/** Solo el cuerpo de la función: los comentarios de cabecera no cuentan. */
const body = current.slice(current.indexOf("create or replace function public.create_order("));

function positionOf(fragment: string): number {
  const index = body.indexOf(fragment);
  assert.notEqual(index, -1, `no aparece en create_order: ${fragment}`);
  return index;
}

describe("tope de unidades por pedido", () => {
  test("es 10 (decisión de Juan)", () => {
    assert.equal(MAX_UNITS_PER_ORDER, 10);
  });

  test("la migración aplica el MISMO número", () => {
    assert.match(body, new RegExp(`v_units > ${MAX_UNITS_PER_ORDER} then`));
  });

  test("el carrito no deja elegir más de lo que admite un pedido", () => {
    assert.equal(CART_MAX_PER_LINE, MAX_UNITS_PER_ORDER);
  });

  test("totalUnits suma cantidades, no cuenta líneas", () => {
    assert.equal(totalUnits([]), 0);
    assert.equal(totalUnits([{ quantity: 6 }, { quantity: 5 }]), 11);
  });
});

describe("códigos de error de la 0046", () => {
  for (const code of ["ORDER_TOO_LARGE", "TOO_MANY_ORDERS", "CHECKOUT_BUSY"]) {
    test(`${code} lo lanza la BD y lo entiende la UI`, () => {
      assert.match(body, new RegExp(`raise exception '${code}'`));
      assert.ok(
        (CHECKOUT_ERROR_CODES as readonly string[]).includes(code),
        `${code} caería a SERVER_ERROR`,
      );
    });
  }

  test("el mensaje del tope dice el número real y no habla de abuso", () => {
    const message = checkoutErrorMessage("ORDER_TOO_LARGE");
    assert.match(message, new RegExp(`${MAX_UNITS_PER_ORDER} unidades`));
    for (const code of ["ORDER_TOO_LARGE", "TOO_MANY_ORDERS", "CHECKOUT_BUSY"] as const) {
      assert.doesNotMatch(checkoutErrorMessage(code), /abuso|bloquead|ataque|límite de/i);
    }
  });
});

describe("orden dentro de create_order", () => {
  test("los límites van DESPUÉS de la idempotencia: un reintento nunca se rechaza", () => {
    assert.ok(positionOf("'reused', true") < positionOf("raise exception 'ORDER_TOO_LARGE'"));
  });

  test("y ANTES de descontar stock: un rechazo no se lleva ninguna unidad", () => {
    const stock = positionOf("set stock = stock - v_qtys[i]");
    for (const code of ["ORDER_TOO_LARGE", "TOO_MANY_ORDERS", "CHECKOUT_BUSY"]) {
      assert.ok(positionOf(`raise exception '${code}'`) < stock, code);
    }
  });

  test("el candado va ANTES de la idempotencia: un doble envío simultáneo no choca con el índice único (0047)", () => {
    assert.ok(
      positionOf("pg_advisory_xact_lock(") <
        positionOf("where client_request_id = p_client_request_id"),
    );
    assert.equal(body.split("pg_advisory_xact_lock(").length, 2, "un solo candado");
  });

  test("el candado por mercado se toma ANTES de contar", () => {
    const lock = positionOf("pg_advisory_xact_lock(");
    assert.ok(lock < positionOf("raise exception 'TOO_MANY_ORDERS'"));
    assert.ok(lock < positionOf("raise exception 'CHECKOUT_BUSY'"));
  });

  test("no cuenta por IP ni lee cabeceras: todos llegarían con la IP del servidor", () => {
    assert.doesNotMatch(body, /request\.headers|x-forwarded-for|inet_client_addr/i);
  });
});

describe("umbrales configurables en settings", () => {
  test("el respaldo sin fila de settings es el mismo que el default de la columna", () => {
    assert.match(sql, /checkout_max_orders_per_phone_hour integer not null default 3/);
    assert.match(sql, /checkout_max_orders_per_market_10min integer not null default 30/);
    assert.match(body, /v_phone_limit := coalesce\(v_phone_limit, 3\)/);
    assert.match(body, /v_market_limit := coalesce\(v_market_limit, 30\)/);
  });

  test("no se pueden poner a cero: cerraría la tienda sin decidirlo", () => {
    assert.match(sql, /check \(checkout_max_orders_per_phone_hour >= 1\)/);
    assert.match(sql, /check \(checkout_max_orders_per_market_10min >= 1\)/);
  });

  test("nacen privadas: ningún grant a anon (0041)", () => {
    assert.doesNotMatch(sql, /grant select[^;]*to anon/i);
  });

  test("la firma no cambia: no aparece una segunda puerta", () => {
    for (const migration of [sql, current]) {
      assert.doesNotMatch(migration, /drop function/i);
      assert.match(
        migration,
        /grant execute on function public\.create_order\(text, jsonb, text, text, uuid, uuid, text, jsonb\) to anon, authenticated/,
      );
    }
  });
});
