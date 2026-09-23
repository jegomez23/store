import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  STOCK_BATCH_MAX,
  parseExhaustIntent,
  parseStockBatch,
  stockErrorMessage,
} from "../stock.ts";
import { MAX_STOCK } from "../catalog.ts";

/**
 * Validación de la edición de stock por valor ABSOLUTO (Incremento 12).
 *
 * Lo que estos tests protegen: que nunca salga hacia PostgreSQL un lote sin
 * testigo, con un valor que no es un entero, o con la misma variante dos
 * veces. La autoridad sigue siendo `admin_set_variant_stock`; esto es la
 * primera barrera.
 */

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const TS = "2026-09-09T10:00:00.123456+00:00";

describe("parseStockBatch", () => {
  test("solo viaja lo que se ha escrito: las filas vacías se ignoran", () => {
    const parsed = parseStockBatch([
      { variantId: V1, raw: "4", expectedUpdatedAt: TS },
      { variantId: V2, raw: "   ", expectedUpdatedAt: TS },
    ]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok && parsed.items, [
      { variantId: V1, stock: 4, expectedUpdatedAt: TS },
    ]);
  });

  test("acepta el cero: dejar en 0 es una edición legítima", () => {
    const parsed = parseStockBatch([{ variantId: V1, raw: "0", expectedUpdatedAt: TS }]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok && parsed.items[0].stock, 0);
  });

  test("un valor IGUAL al actual también viaja: quien compara es PostgreSQL", () => {
    // El navegador puede estar mirando un número viejo, así que "no ha
    // cambiado" no es una decisión que pueda tomar el cliente.
    const parsed = parseStockBatch([{ variantId: V1, raw: "7", expectedUpdatedAt: TS }]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok && parsed.items.length, 1);
  });

  test("RECHAZA lo que Number() aceptaría por su cuenta", () => {
    for (const raw of ["1e3", "+4", "-1", "4.5", "4,5", "0x10", "cuatro", "4 5"]) {
      const parsed = parseStockBatch([{ variantId: V1, raw, expectedUpdatedAt: TS }]);
      assert.equal(parsed.ok, false, `${raw} no debería aceptarse`);
    }
  });

  test("los espacios de alrededor sí se perdonan: se teclea en un móvil", () => {
    // `parseStock` (Fase 7) recorta antes de validar, y este camino reutiliza
    // esa misma función para no tener dos criterios de "qué es un stock".
    const parsed = parseStockBatch([{ variantId: V1, raw: " 5 ", expectedUpdatedAt: TS }]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok && parsed.items[0].stock, 5);
  });

  test("acota el valor con el MISMO tope que el otro camino de escritura", () => {
    const ok = parseStockBatch([{ variantId: V1, raw: String(MAX_STOCK), expectedUpdatedAt: TS }]);
    assert.equal(ok.ok, true);
    const ko = parseStockBatch([
      { variantId: V1, raw: String(MAX_STOCK + 1), expectedUpdatedAt: TS },
    ]);
    assert.equal(ko.ok, false);
  });

  test("SIN testigo no se envía nada: es lo único que distingue editar de pisar", () => {
    for (const witness of ["", "ayer", "2026-09-09", "null"]) {
      const parsed = parseStockBatch([{ variantId: V1, raw: "4", expectedUpdatedAt: witness }]);
      assert.equal(parsed.ok, false, `testigo ${witness} no debería aceptarse`);
      assert.match(parsed.ok ? "" : parsed.error, /[Rr]ecarga/);
    }
  });

  test("un id repetido se rechaza en vez de aplicar uno de los dos", () => {
    const parsed = parseStockBatch([
      { variantId: V1, raw: "4", expectedUpdatedAt: TS },
      { variantId: V1, raw: "9", expectedUpdatedAt: TS },
    ]);
    assert.equal(parsed.ok, false);
  });

  test("un id que no es uuid tumba el lote entero", () => {
    const parsed = parseStockBatch([
      { variantId: V1, raw: "4", expectedUpdatedAt: TS },
      { variantId: "../../etc", raw: "9", expectedUpdatedAt: TS },
    ]);
    assert.equal(parsed.ok, false);
  });

  test("un valor inválido tumba el lote entero, no solo su fila", () => {
    const parsed = parseStockBatch([
      { variantId: V1, raw: "4", expectedUpdatedAt: TS },
      { variantId: V2, raw: "-3", expectedUpdatedAt: TS },
    ]);
    assert.equal(parsed.ok, false);
  });

  test("no se envía un lote vacío", () => {
    const parsed = parseStockBatch([{ variantId: V1, raw: "", expectedUpdatedAt: TS }]);
    assert.equal(parsed.ok, false);
    assert.match(parsed.ok ? "" : parsed.error, /ninguna cantidad/);
  });

  test("acota el número de variantes por lote", () => {
    const many = Array.from({ length: STOCK_BATCH_MAX + 1 }, (_, i) => ({
      variantId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
      raw: "1",
      expectedUpdatedAt: TS,
    }));
    const parsed = parseStockBatch(many);
    assert.equal(parsed.ok, false);
  });
});

describe("parseExhaustIntent", () => {
  test("reconoce el botón Agotar y devuelve la variante", () => {
    assert.equal(parseExhaustIntent(`exhaust:${V1}`), V1);
  });

  test("no reconoce nada más", () => {
    assert.equal(parseExhaustIntent("save"), null);
    assert.equal(parseExhaustIntent(""), null);
    assert.equal(parseExhaustIntent("exhaust:"), null);
    assert.equal(parseExhaustIntent("exhaust:../../otro"), null);
    assert.equal(parseExhaustIntent(`exhaust:${V1} `), null);
  });
});

describe("stockErrorMessage", () => {
  test("el conflicto dice que NO se guardó nada y qué hacer", () => {
    const message = stockErrorMessage(
      'STOCK_CHANGED detail: 1111',
      "generico",
    );
    assert.match(message, /no se ha guardado nada/i);
    assert.match(message, /[Rr]ecarga/);
  });

  test("traduce el resto de códigos de la función SQL", () => {
    assert.match(stockErrorMessage("FORBIDDEN", "x"), /permisos/i);
    assert.match(stockErrorMessage("VARIANT_NOT_IN_MARKET", "x"), /no se ha guardado nada/i);
    assert.match(stockErrorMessage("STOCK_OUT_OF_RANGE", "x"), new RegExp(String(MAX_STOCK)));
    assert.match(stockErrorMessage("EXPECTED_UPDATED_AT_REQUIRED", "x"), /[Rr]ecarga/);
  });

  test("un error desconocido cae al mensaje genérico", () => {
    assert.equal(stockErrorMessage("algo raro", "generico"), "generico");
    assert.equal(stockErrorMessage(undefined, "generico"), "generico");
  });

  test("nunca devuelve el mensaje crudo de PostgreSQL", () => {
    const raw = 'new row for relation "product_variants" violates check constraint';
    assert.equal(stockErrorMessage(raw, "generico"), "generico");
  });
});

describe("coherencia con la migración 0038", () => {
  const sql = fs.readFileSync("supabase/migrations/0038_admin_set_variant_stock.sql", "utf8");

  test("el tope del lote coincide con el de la función SQL", () => {
    assert.match(sql, new RegExp(`> ${STOCK_BATCH_MAX}`));
  });

  test("el tope de stock coincide con MAX_STOCK", () => {
    assert.match(sql, new RegExp(`> ${MAX_STOCK}`));
  });

  test("la función ASIGNA, no suma: es la semántica del incremento", () => {
    assert.match(sql, /set stock = v_target/);
    assert.ok(
      !/set stock = stock \+/.test(sql),
      "sumar aquí reintroduciría la segunda semántica que este incremento eliminó",
    );
  });

  test("un `set` sin testigo es un ERROR, no una escritura libre", () => {
    assert.match(sql, /EXPECTED_UPDATED_AT_REQUIRED/);
    assert.match(sql, /v_updated_at is distinct from v_expected/);
    assert.match(sql, /STOCK_CHANGED/);
  });

  test("`exhaust` no admite ni valor ni testigo: solo escribe el cero", () => {
    assert.match(sql, /v_item \? 'stock' or v_item \? 'expected_updated_at'/);
  });

  test("revalida el mercado sobre la fila y la bloquea", () => {
    assert.match(sql, /p\.market_id = p_market_id/);
    assert.match(sql, /for update of v/);
    assert.match(sql, /VARIANT_NOT_IN_MARKET/);
  });

  test("NO toca is_active ni el estado del producto: agotado no es despublicado", () => {
    assert.ok(!/set is_active/.test(sql));
    assert.ok(!/update public\.products/.test(sql));
  });

  test("la auditoría reutiliza `correccion`, sin inventar una categoría nueva", () => {
    assert.match(sql, /admin_set_variant_stock' then 'correccion'/);
    const changeLog = fs.readFileSync("supabase/migrations/0032_admin_change_log.sql", "utf8");
    const allowed = changeLog.match(/source in \(([^)]+)\)/);
    assert.ok(allowed, "no se encontró el CHECK de source en la 0032");
    assert.match(allowed![1], /'correccion'/);
  });
});
