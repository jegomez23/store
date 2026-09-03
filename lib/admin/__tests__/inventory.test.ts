import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  INVENTORY_FILTERS,
  MAX_RESTOCK_ITEMS,
  isInventoryFilter,
  parseDelta,
  parseRestockBatch,
  restockErrorMessage,
} from "../inventory.ts";
import { MAX_STOCK } from "../catalog.ts";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("parseDelta", () => {
  test("acepta enteros positivos, con y sin signo", () => {
    assert.deepEqual(parseDelta("12"), { ok: true, value: 12 });
    assert.deepEqual(parseDelta("+12"), { ok: true, value: 12 });
    assert.deepEqual(parseDelta("  7  "), { ok: true, value: 7 });
  });

  test("acepta negativos: retirar unidades también es reponer", () => {
    assert.deepEqual(parseDelta("-3"), { ok: true, value: -3 });
  });

  test("RECHAZA decimales: media unidad no significa nada", () => {
    // `Number("5.5")` da 5.5 y un `::int` en PostgreSQL lo redondearía en
    // silencio a 6. El error tiene que darse aquí.
    assert.equal(parseDelta("5.5").ok, false);
    assert.equal(parseDelta("5,5").ok, false);
  });

  test("RECHAZA lo que Number() aceptaría por su cuenta", () => {
    assert.equal(parseDelta("1e3").ok, false);
    assert.equal(parseDelta("0x10").ok, false);
    assert.equal(parseDelta("1 2").ok, false);
    assert.equal(parseDelta("Infinity").ok, false);
    assert.equal(parseDelta("NaN").ok, false);
  });

  test("RECHAZA cero: no es una operación", () => {
    assert.equal(parseDelta("0").ok, false);
    assert.equal(parseDelta("-0").ok, false);
    assert.equal(parseDelta("+0").ok, false);
  });

  test("RECHAZA vacío", () => {
    assert.equal(parseDelta("").ok, false);
    assert.equal(parseDelta("   ").ok, false);
  });

  test("acota el tamaño del cambio", () => {
    assert.equal(parseDelta(String(MAX_STOCK)).ok, true);
    assert.equal(parseDelta(String(MAX_STOCK + 1)).ok, false);
    assert.equal(parseDelta(String(-MAX_STOCK - 1)).ok, false);
  });
});

describe("parseRestockBatch", () => {
  test("ignora las filas vacías: solo se envía lo que se ha escrito", () => {
    const parsed = parseRestockBatch([
      { variantId: ID_A, raw: "10" },
      { variantId: ID_B, raw: "" },
    ]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok && parsed.items, [{ variantId: ID_A, delta: 10 }]);
  });

  test("falla si NADA se ha rellenado", () => {
    const parsed = parseRestockBatch([
      { variantId: ID_A, raw: "" },
      { variantId: ID_B, raw: "  " },
    ]);
    assert.equal(parsed.ok, false);
  });

  test("un id repetido se rechaza en vez de aplicar uno de los dos", () => {
    const parsed = parseRestockBatch([
      { variantId: ID_A, raw: "5" },
      { variantId: ID_A, raw: "7" },
    ]);
    assert.equal(parsed.ok, false);
    assert.match(parsed.ok ? "" : parsed.error, /repetida/i);
  });

  test("un id que no es uuid tumba el lote entero", () => {
    const parsed = parseRestockBatch([
      { variantId: ID_A, raw: "5" },
      { variantId: "no-soy-un-uuid", raw: "7" },
    ]);
    assert.equal(parsed.ok, false);
  });

  test("un delta inválido tumba el lote entero, no solo su fila", () => {
    // Coherente con la función SQL: todo o nada. Un lote a medias sería peor,
    // porque nadie sabría qué parte se aplicó.
    const parsed = parseRestockBatch([
      { variantId: ID_A, raw: "5" },
      { variantId: ID_B, raw: "2.5" },
    ]);
    assert.equal(parsed.ok, false);
  });

  test("acota el número de variantes por lote", () => {
    const many = Array.from({ length: MAX_RESTOCK_ITEMS + 1 }, (_, i) => ({
      variantId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
      raw: "1",
    }));
    assert.equal(parseRestockBatch(many).ok, false);
  });
});

describe("restockErrorMessage", () => {
  test("traduce los códigos de la función SQL", () => {
    assert.match(restockErrorMessage("VARIANT_NOT_IN_MARKET", "x"), /mercado/i);
    assert.match(restockErrorMessage("NEGATIVE_STOCK", "x"), /negativo/i);
    assert.match(restockErrorMessage("FORBIDDEN", "x"), /permisos/i);
  });

  test("los mensajes de fallo dicen que NO se aplicó nada", () => {
    // Es la información que el admin necesita: si algo se aplicó a medias,
    // tendría que ir a comprobar qué. Como el lote es atómico, no.
    assert.match(restockErrorMessage("VARIANT_NOT_IN_MARKET", "x"), /no se ha aplicado nada/i);
    assert.match(restockErrorMessage("NEGATIVE_STOCK", "x"), /no se ha aplicado nada/i);
  });

  test("un error desconocido cae al mensaje genérico", () => {
    assert.equal(restockErrorMessage("algo raro de postgres", "generico"), "generico");
    assert.equal(restockErrorMessage(undefined, "generico"), "generico");
  });
});

describe("filtros del inventario", () => {
  test("solo se aceptan los tres conocidos", () => {
    for (const f of INVENTORY_FILTERS) assert.equal(isInventoryFilter(f), true);
    assert.equal(isInventoryFilter("otro"), false);
    assert.equal(isInventoryFilter(""), false);
    assert.equal(isInventoryFilter(null), false);
    assert.equal(isInventoryFilter(123), false);
  });
});

describe("coherencia con la migración 0026", () => {
  test("el tope del lote coincide con el de la función SQL", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/0026_admin_restock_variants.sql", "utf8");
    assert.match(sql, new RegExp(`> ${MAX_RESTOCK_ITEMS}`));
  });

  test("la función SQL suma, no asigna: es lo que la hace concurrente", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/0026_admin_restock_variants.sql", "utf8");
    assert.match(sql, /set stock = stock \+ v_delta/);
    assert.ok(
      !/set stock = v_new_stock/.test(sql),
      "asignar un valor calculado en TypeScript reintroduciría la pérdida de actualizaciones",
    );
  });

  test("la función SQL revalida el mercado sobre la fila", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("supabase/migrations/0026_admin_restock_variants.sql", "utf8");
    assert.match(sql, /p\.market_id = p_market_id/);
    assert.match(sql, /VARIANT_NOT_IN_MARKET/);
  });
});
