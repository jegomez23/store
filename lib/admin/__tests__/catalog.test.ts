import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAX_PRICE,
  MAX_STOCK,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  isLowStock,
  isProductStatus,
  parsePrice,
  parseStock,
  parseWhatsAppNumber,
} from "../catalog.ts";

describe("estados de producto", () => {
  test("son exactamente los del CHECK de la migración 0006", () => {
    const sql = fs.readFileSync("supabase/migrations/0006_products.sql", "utf8");
    const match = sql.match(/status in \(([^)]+)\)/);
    assert.ok(match, "no se encontró el CHECK de status");
    assert.deepEqual(
      [...PRODUCT_STATUSES].sort(),
      match[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort(),
    );
  });

  test("todos tienen etiqueta", () => {
    for (const status of PRODUCT_STATUSES) {
      assert.ok(PRODUCT_STATUS_LABELS[status]);
    }
  });

  test("isProductStatus rechaza lo que no lo es", () => {
    assert.equal(isProductStatus("active"), true);
    assert.equal(isProductStatus("ACTIVE"), false);
    assert.equal(isProductStatus("published"), false);
    assert.equal(isProductStatus(undefined), false);
  });
});

describe("parseStock", () => {
  test("acepta enteros válidos", () => {
    assert.deepEqual(parseStock("0"), { ok: true, value: 0 });
    assert.deepEqual(parseStock("7"), { ok: true, value: 7 });
    assert.deepEqual(parseStock(" 12 "), { ok: true, value: 12 });
  });

  test("rechaza lo que Number() aceptaría por error", () => {
    // Number("1e3") === 1000 y Number("") === 0: por eso se valida con regex
    // ANTES de convertir, no después.
    for (const bad of ["1e3", "", "  ", "-1", "1.5", "abc", "0x10", "Infinity", "NaN", "+5"]) {
      assert.equal(parseStock(bad).ok, false, `stock "${bad}"`);
    }
  });

  test("rechaza valores desmesurados", () => {
    assert.equal(parseStock(String(MAX_STOCK)).ok, true);
    assert.equal(parseStock(String(MAX_STOCK + 1)).ok, false);
    assert.equal(parseStock("9".repeat(30)).ok, false);
  });
});

describe("parsePrice", () => {
  test("acepta precios válidos con coma o punto", () => {
    assert.deepEqual(parsePrice("89.90"), { ok: true, value: 89.9 });
    assert.deepEqual(parsePrice("89,90"), { ok: true, value: 89.9 });
    assert.deepEqual(parsePrice("0"), { ok: true, value: 0 });
    assert.deepEqual(parsePrice("34.9"), { ok: true, value: 34.9 });
  });

  test("rechaza más de 2 decimales (numeric(12,2))", () => {
    assert.equal(parsePrice("10.999").ok, false);
    assert.equal(parsePrice("10.001").ok, false);
  });

  test("rechaza negativos, vacíos y basura", () => {
    for (const bad of ["-1", "", "  ", "abc", "1e2", "10.", ".5", "10,5,5"]) {
      assert.equal(parsePrice(bad).ok, false, `precio "${bad}"`);
    }
  });

  test("rechaza precios desmesurados", () => {
    assert.equal(parsePrice(String(MAX_PRICE)).ok, true);
    assert.equal(parsePrice(String(MAX_PRICE + 1)).ok, false);
  });
});

describe("parseWhatsAppNumber", () => {
  test("normaliza a E.164 sin +, igual que create_order", () => {
    assert.deepEqual(parseWhatsAppNumber("+34 600 11 22 33"), {
      ok: true,
      value: "34600112233",
    });
    assert.deepEqual(parseWhatsAppNumber("(34) 600-112-233"), {
      ok: true,
      value: "34600112233",
    });
  });

  test("rechaza longitudes imposibles", () => {
    assert.equal(parseWhatsAppNumber("123").ok, false);
    assert.equal(parseWhatsAppNumber("").ok, false);
    assert.equal(parseWhatsAppNumber("sin digitos").ok, false);
    assert.equal(parseWhatsAppNumber("9".repeat(21)).ok, false);
  });
});

describe("isLowStock", () => {
  test("el umbral es inclusivo", () => {
    assert.equal(isLowStock(3, 3), true);
    assert.equal(isLowStock(2, 3), true);
    assert.equal(isLowStock(4, 3), false);
    assert.equal(isLowStock(0, 3), true);
  });
});
