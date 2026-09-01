import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LINES_PER_ORDER,
  MAX_QUANTITY_PER_LINE,
  isUuid,
  isValidName,
  isValidPhone,
  isValidQuantity,
  validateCheckoutInput,
} from "../validation.ts";

/**
 * Validación del payload del checkout (Fase 6).
 *
 * Recordatorio: esta capa es la PRIMERA barrera, no la definitiva. Todo lo que
 * se comprueba aquí se vuelve a comprobar dentro de `create_order`, que es la
 * autoridad real (ver create-order.integration.test.ts).
 */

const VARIANT_A = "11111111-1111-4111-8111-111111111111";
const VARIANT_B = "22222222-2222-4222-8222-222222222222";

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    items: [{ variantId: VARIANT_A, quantity: 2 }],
    customer: { name: "Ana Pérez", phone: "+34 600 11 22 33" },
    clientRequestId: "33333333-3333-4333-8333-333333333333",
    sourceUrl: "https://yi.test/checkout",
    ...overrides,
  };
}

describe("payload válido", () => {
  test("acepta un checkout correcto y lo normaliza", () => {
    const result = validateCheckoutInput(payload());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.input.items.length, 1);
    assert.equal(result.input.items[0].quantity, 2);
    assert.equal(result.input.customer.name, "Ana Pérez");
  });

  test("recorta espacios del nombre", () => {
    const result = validateCheckoutInput(
      payload({ customer: { name: "  Ana  ", phone: "600112233" } }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.input.customer.name, "Ana");
  });

  test("ordena los ítems por variantId (fingerprint estable)", () => {
    const a = validateCheckoutInput(
      payload({
        items: [
          { variantId: VARIANT_B, quantity: 1 },
          { variantId: VARIANT_A, quantity: 1 },
        ],
      }),
    );
    const b = validateCheckoutInput(
      payload({
        items: [
          { variantId: VARIANT_A, quantity: 1 },
          { variantId: VARIANT_B, quantity: 1 },
        ],
      }),
    );
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.deepEqual(a.input.items, b.input.items);
  });

  test("acepta la cantidad máxima por línea", () => {
    const result = validateCheckoutInput(
      payload({ items: [{ variantId: VARIANT_A, quantity: MAX_QUANTITY_PER_LINE }] }),
    );
    assert.equal(result.ok, true);
  });

  test("sourceUrl es opcional y se recorta a 500 caracteres", () => {
    const long = "https://yi.test/" + "x".repeat(1000);
    const result = validateCheckoutInput(payload({ sourceUrl: long }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.input.sourceUrl?.length, 500);
  });
});

describe("carrito vacío", () => {
  test("items vacío -> EMPTY_CART", () => {
    const result = validateCheckoutInput(payload({ items: [] }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "EMPTY_CART");
  });
});

describe("cantidades inválidas", () => {
  const bad: [string, unknown][] = [
    ["cero", 0],
    ["negativa", -1],
    ["decimal", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["string numérico", "2"],
    ["null", null],
    ["por encima del tope", MAX_QUANTITY_PER_LINE + 1],
  ];

  for (const [label, quantity] of bad) {
    test(`cantidad ${label} -> INVALID_INPUT`, () => {
      const result = validateCheckoutInput(
        payload({ items: [{ variantId: VARIANT_A, quantity }] }),
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error, "INVALID_INPUT");
    });
  }
});

describe("identificadores inválidos", () => {
  const badIds: [string, unknown][] = [
    ["cadena vacía", ""],
    ["no uuid", "abc"],
    ["número", 42],
    ["null", null],
    ["uuid truncado", "11111111-1111-4111-8111"],
    ["inyección SQL", "'; drop table orders; --"],
  ];

  for (const [label, variantId] of badIds) {
    test(`variantId ${label} -> INVALID_INPUT`, () => {
      const result = validateCheckoutInput(
        payload({ items: [{ variantId, quantity: 1 }] }),
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error, "INVALID_INPUT");
    });
  }

  test("clientRequestId no uuid -> INVALID_INPUT", () => {
    const result = validateCheckoutInput(payload({ clientRequestId: "no-soy-uuid" }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "INVALID_INPUT");
  });

  test("clientRequestId ausente -> INVALID_INPUT", () => {
    const base = payload() as Record<string, unknown>;
    delete base.clientRequestId;
    const result = validateCheckoutInput(base);
    assert.equal(result.ok, false);
  });

  test("variantId duplicado -> INVALID_INPUT", () => {
    const result = validateCheckoutInput(
      payload({
        items: [
          { variantId: VARIANT_A, quantity: 1 },
          { variantId: VARIANT_A, quantity: 3 },
        ],
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "INVALID_INPUT");
  });

  test("demasiadas líneas -> INVALID_INPUT", () => {
    const items = Array.from({ length: MAX_LINES_PER_ORDER + 1 }, (_, i) => ({
      variantId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
      quantity: 1,
    }));
    const result = validateCheckoutInput(payload({ items }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "INVALID_INPUT");
  });
});

describe("datos del cliente (DEC-030)", () => {
  const badPhones: [string, unknown][] = [
    ["vacío", ""],
    ["demasiado corto", "12345"],
    ["sin dígitos", "no-soy-un-telefono"],
    ["null", null],
    ["número en vez de string", 600112233],
  ];

  for (const [label, phone] of badPhones) {
    test(`teléfono ${label} -> INVALID_CUSTOMER_PHONE`, () => {
      const result = validateCheckoutInput(
        payload({ customer: { name: "Ana", phone } }),
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error, "INVALID_CUSTOMER_PHONE");
    });
  }

  test("acepta teléfono con prefijo, espacios y guiones", () => {
    for (const phone of ["+34 600 11 22 33", "0034-600-112233", "600112233"]) {
      const result = validateCheckoutInput(payload({ customer: { name: "Ana", phone } }));
      assert.equal(result.ok, true, phone);
    }
  });

  const badNames: [string, unknown][] = [
    ["vacío", ""],
    ["solo espacios", "   "],
    ["una letra", "A"],
    ["null", null],
    ["demasiado largo", "x".repeat(121)],
  ];

  for (const [label, name] of badNames) {
    test(`nombre ${label} -> INVALID_CUSTOMER_NAME`, () => {
      const result = validateCheckoutInput(
        payload({ customer: { name, phone: "600112233" } }),
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error, "INVALID_CUSTOMER_NAME");
    });
  }

  test("customer ausente -> INVALID_INPUT", () => {
    const base = payload() as Record<string, unknown>;
    delete base.customer;
    const result = validateCheckoutInput(base);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "INVALID_INPUT");
  });
});

describe("payload estructuralmente inválido", () => {
  for (const value of [null, undefined, "texto", 42, [], true]) {
    test(`${JSON.stringify(value) ?? "undefined"} -> INVALID_INPUT`, () => {
      const result = validateCheckoutInput(value);
      assert.equal(result.ok, false);
    });
  }

  test("items que no es array -> INVALID_INPUT", () => {
    const result = validateCheckoutInput(payload({ items: "no soy un array" }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "INVALID_INPUT");
  });

  test("una línea que no es objeto -> INVALID_INPUT", () => {
    const result = validateCheckoutInput(payload({ items: ["basura"] }));
    assert.equal(result.ok, false);
  });

  test("el payload NUNCA transporta precio: un precio inyectado se descarta", () => {
    const result = validateCheckoutInput(
      payload({
        items: [{ variantId: VARIANT_A, quantity: 1, unitPrice: 0.01, total: 0.01 }],
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // La línea normalizada solo tiene variantId y quantity.
    assert.deepEqual(Object.keys(result.input.items[0]).sort(), [
      "quantity",
      "variantId",
    ]);
  });
});

describe("predicados sueltos", () => {
  test("isUuid", () => {
    assert.equal(isUuid(VARIANT_A), true);
    assert.equal(isUuid(VARIANT_A.toUpperCase()), true);
    assert.equal(isUuid("nope"), false);
    assert.equal(isUuid(null), false);
  });

  test("isValidQuantity", () => {
    assert.equal(isValidQuantity(1), true);
    assert.equal(isValidQuantity(MAX_QUANTITY_PER_LINE), true);
    assert.equal(isValidQuantity(0), false);
    assert.equal(isValidQuantity(2.5), false);
  });

  test("isValidPhone", () => {
    assert.equal(isValidPhone("600112233"), true);
    assert.equal(isValidPhone("12345"), false);
    assert.equal(isValidPhone("1".repeat(21)), false);
  });

  test("isValidName", () => {
    assert.equal(isValidName("Ana"), true);
    assert.equal(isValidName(" A "), false);
  });
});
