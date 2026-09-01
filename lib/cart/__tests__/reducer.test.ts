import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_CART,
  MAX_QUANTITY_PER_LINE,
  cartReducer,
  isValidQuantity,
  maxQuantityFor,
  sanitizeLine,
  sanitizeLines,
  selectCheckoutItems,
  selectSubtotal,
  selectTotalUnits,
  selectTotals,
} from "../reducer.ts";
import type { AddItemInput, CartLine, CartState } from "../types.ts";

/**
 * Tests del reducer del carrito (Fase 5). Se ejecutan con el runner nativo de
 * Node (`npm test`), sin dependencias nuevas — ver DEC-025.
 */

const MARKET = "ES";

function makeItem(overrides: Partial<AddItemInput> = {}): AddItemInput {
  return {
    variantId: "var-1",
    productId: "prod-1",
    productSlug: "chaqueta-cortavientos-cumbre",
    productName: "Chaqueta cortavientos Cumbre",
    imageUrl: "https://example.test/img.jpg",
    colorName: "Negro",
    sizeLabel: "M",
    unitPrice: 89.9,
    marketId: MARKET,
    stockSnapshot: 12,
    ...overrides,
  };
}

function stateWith(...items: AddItemInput[]): CartState {
  return items.reduce<CartState>(
    (state, item) => cartReducer(state, { type: "ADD_ITEM", item }),
    EMPTY_CART,
  );
}

describe("ADD_ITEM", () => {
  test("añade una línea nueva con cantidad 1 por defecto", () => {
    const state = cartReducer(EMPTY_CART, { type: "ADD_ITEM", item: makeItem() });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].variantId, "var-1");
    assert.equal(state.lines[0].quantity, 1);
  });

  test("respeta la cantidad explícita", () => {
    const state = stateWith(makeItem({ quantity: 3 }));
    assert.equal(state.lines[0].quantity, 3);
  });

  test("fusiona duplicados por variantId sumando cantidades", () => {
    const state = stateWith(makeItem({ quantity: 2 }), makeItem({ quantity: 3 }));
    assert.equal(state.lines.length, 1, "no debe crear una segunda línea");
    assert.equal(state.lines[0].quantity, 5);
  });

  test("la identidad es variantId, no nombre/color/talla", () => {
    // Mismo variantId pero con color y talla distintos: sigue siendo una línea.
    const state = stateWith(
      makeItem({ colorName: "Negro", sizeLabel: "M" }),
      makeItem({ colorName: "Blanco", sizeLabel: "L" }),
    );
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].quantity, 2);
  });

  test("variantes distintas del mismo producto son líneas distintas", () => {
    const state = stateWith(
      makeItem({ variantId: "var-1", sizeLabel: "M" }),
      makeItem({ variantId: "var-2", sizeLabel: "L" }),
    );
    assert.equal(state.lines.length, 2);
    assert.deepEqual(
      state.lines.map((l) => l.variantId),
      ["var-1", "var-2"],
    );
  });

  test("refresca el snapshot de precio al volver a añadir", () => {
    const state = stateWith(
      makeItem({ unitPrice: 89.9 }),
      makeItem({ unitPrice: 79.9 }),
    );
    assert.equal(state.lines[0].unitPrice, 79.9);
  });

  test("no supera el stock conocido al fusionar", () => {
    const state = stateWith(
      makeItem({ quantity: 3, stockSnapshot: 4 }),
      makeItem({ quantity: 5, stockSnapshot: 4 }),
    );
    assert.equal(state.lines[0].quantity, 4);
  });

  test("no supera el tope duro por línea", () => {
    const state = stateWith(
      makeItem({ quantity: 90, stockSnapshot: null }),
      makeItem({ quantity: 50, stockSnapshot: null }),
    );
    assert.equal(state.lines[0].quantity, MAX_QUANTITY_PER_LINE);
  });

  test("no muta el estado anterior", () => {
    const first = stateWith(makeItem());
    const snapshot = JSON.stringify(first);
    cartReducer(first, { type: "ADD_ITEM", item: makeItem({ variantId: "var-2" }) });
    assert.equal(JSON.stringify(first), snapshot);
  });
});

describe("ADD_ITEM — entradas inválidas", () => {
  const badQuantities: [string, number][] = [
    ["negativa", -1],
    ["cero", 0],
    ["decimal", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["por encima del tope", MAX_QUANTITY_PER_LINE + 1],
  ];

  for (const [label, quantity] of badQuantities) {
    test(`ignora la acción con cantidad ${label}`, () => {
      const state = cartReducer(EMPTY_CART, {
        type: "ADD_ITEM",
        item: makeItem({ quantity }),
      });
      assert.deepEqual(state.lines, []);
    });
  }

  const badFields: [string, Partial<AddItemInput>][] = [
    ["variantId vacío", { variantId: "" }],
    ["variantId en blanco", { variantId: "   " }],
    ["productId vacío", { productId: "" }],
    ["productSlug vacío", { productSlug: "" }],
    ["productName vacío", { productName: "" }],
    ["market vacío", { marketId: "" }],
    ["precio negativo", { unitPrice: -10 }],
    ["precio NaN", { unitPrice: Number.NaN }],
    ["precio Infinity", { unitPrice: Number.POSITIVE_INFINITY }],
  ];

  for (const [label, overrides] of badFields) {
    test(`rechaza la línea con ${label}`, () => {
      const state = cartReducer(EMPTY_CART, {
        type: "ADD_ITEM",
        item: makeItem(overrides),
      });
      assert.deepEqual(state.lines, []);
    });
  }

  test("acepta color y talla nulos (accesorios, DEC-019)", () => {
    const state = stateWith(makeItem({ colorName: null, sizeLabel: null }));
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].colorName, null);
    assert.equal(state.lines[0].sizeLabel, null);
  });

  test("acepta precio 0", () => {
    const state = stateWith(makeItem({ unitPrice: 0 }));
    assert.equal(state.lines[0].unitPrice, 0);
  });

  test("acepta imageUrl null", () => {
    const state = stateWith(makeItem({ imageUrl: null }));
    assert.equal(state.lines[0].imageUrl, null);
  });
});

describe("UPDATE_QUANTITY", () => {
  test("actualiza la cantidad de la variante indicada", () => {
    const state = cartReducer(stateWith(makeItem()), {
      type: "UPDATE_QUANTITY",
      variantId: "var-1",
      quantity: 4,
    });
    assert.equal(state.lines[0].quantity, 4);
  });

  test("cantidad 0 elimina la línea (nunca se guarda una línea en 0)", () => {
    const state = cartReducer(stateWith(makeItem()), {
      type: "UPDATE_QUANTITY",
      variantId: "var-1",
      quantity: 0,
    });
    assert.deepEqual(state.lines, []);
  });

  test("cantidad negativa elimina la línea", () => {
    const state = cartReducer(stateWith(makeItem()), {
      type: "UPDATE_QUANTITY",
      variantId: "var-1",
      quantity: -3,
    });
    assert.deepEqual(state.lines, []);
  });

  test("recorta al stock conocido", () => {
    const state = cartReducer(stateWith(makeItem({ stockSnapshot: 5 })), {
      type: "UPDATE_QUANTITY",
      variantId: "var-1",
      quantity: 20,
    });
    assert.equal(state.lines[0].quantity, 5);
  });

  test("ignora cantidades no enteras o no finitas", () => {
    const base = stateWith(makeItem({ quantity: 2 }));
    for (const quantity of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const state = cartReducer(base, {
        type: "UPDATE_QUANTITY",
        variantId: "var-1",
        quantity,
      });
      assert.equal(state.lines[0].quantity, 2, `cantidad ${quantity}`);
    }
  });

  test("no hace nada si la variante no existe", () => {
    const base = stateWith(makeItem());
    const state = cartReducer(base, {
      type: "UPDATE_QUANTITY",
      variantId: "no-existe",
      quantity: 5,
    });
    assert.equal(state, base, "debe devolver el mismo estado");
  });

  test("solo afecta a la variante indicada", () => {
    const base = stateWith(
      makeItem({ variantId: "var-1", quantity: 1 }),
      makeItem({ variantId: "var-2", quantity: 1 }),
    );
    const state = cartReducer(base, {
      type: "UPDATE_QUANTITY",
      variantId: "var-2",
      quantity: 7,
    });
    assert.equal(state.lines[0].quantity, 1);
    assert.equal(state.lines[1].quantity, 7);
  });
});

describe("REMOVE_ITEM", () => {
  test("elimina únicamente esa variante", () => {
    const base = stateWith(
      makeItem({ variantId: "var-1" }),
      makeItem({ variantId: "var-2" }),
      makeItem({ variantId: "var-3" }),
    );
    const state = cartReducer(base, { type: "REMOVE_ITEM", variantId: "var-2" });
    assert.deepEqual(
      state.lines.map((l) => l.variantId),
      ["var-1", "var-3"],
    );
  });

  test("es inocuo si la variante no existe", () => {
    const base = stateWith(makeItem());
    const state = cartReducer(base, { type: "REMOVE_ITEM", variantId: "nope" });
    assert.equal(state, base);
  });

  test("ignora un variantId vacío", () => {
    const base = stateWith(makeItem());
    const state = cartReducer(base, { type: "REMOVE_ITEM", variantId: "" });
    assert.equal(state.lines.length, 1);
  });
});

describe("CLEAR_CART", () => {
  test("vacía completamente el carrito", () => {
    const base = stateWith(
      makeItem({ variantId: "var-1" }),
      makeItem({ variantId: "var-2" }),
    );
    const state = cartReducer(base, { type: "CLEAR_CART" });
    assert.deepEqual(state.lines, []);
  });

  test("sobre un carrito vacío devuelve el mismo estado", () => {
    const state = cartReducer(EMPTY_CART, { type: "CLEAR_CART" });
    assert.equal(state, EMPTY_CART);
  });
});

describe("HYDRATE", () => {
  const validLine: CartLine = {
    variantId: "var-1",
    productId: "prod-1",
    productSlug: "gorra-horizonte",
    productName: "Gorra Horizonte",
    imageUrl: null,
    colorName: "Negro",
    sizeLabel: "Única",
    quantity: 2,
    unitPrice: 24.9,
    marketId: MARKET,
    stockSnapshot: 30,
  };

  test("restaura líneas válidas", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [validLine],
      marketId: MARKET,
    });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].quantity, 2);
  });

  test("reemplaza el estado anterior en vez de acumularlo", () => {
    const base = stateWith(makeItem({ variantId: "var-9" }));
    const state = cartReducer(base, {
      type: "HYDRATE",
      payload: [validLine],
      marketId: MARKET,
    });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].variantId, "var-1");
  });

  const corruptPayloads: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["string", "no soy un carrito"],
    ["número", 42],
    ["objeto en vez de array", { lines: [] }],
    ["array vacío", []],
  ];

  for (const [label, payload] of corruptPayloads) {
    test(`payload ${label} produce carrito vacío sin lanzar`, () => {
      const state = cartReducer(EMPTY_CART, {
        type: "HYDRATE",
        payload,
        marketId: MARKET,
      });
      assert.deepEqual(state.lines, []);
    });
  }

  test("descarta elementos corruptos y conserva los válidos", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [
        null,
        "basura",
        { variantId: "sin-el-resto" },
        { ...validLine, unitPrice: -5 },
        validLine,
      ],
      marketId: MARKET,
    });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].variantId, "var-1");
  });

  test("corrige una cantidad inválida a 1 en vez de perder la línea", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [{ ...validLine, quantity: -7 }],
      marketId: MARKET,
    });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].quantity, 1);
  });

  test("recorta al tope duro una cantidad enorme del storage", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [{ ...validLine, quantity: 99999, stockSnapshot: null }],
      marketId: MARKET,
    });
    assert.equal(state.lines[0].quantity, MAX_QUANTITY_PER_LINE);
  });

  test("una cantidad inservible (no entera) sí cae a 1", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [{ ...validLine, quantity: 2.7 }],
      marketId: MARKET,
    });
    assert.equal(state.lines[0].quantity, 1);
  });

  test("recorta al stock conocido al restaurar", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [{ ...validLine, quantity: 90, stockSnapshot: 3 }],
      marketId: MARKET,
    });
    assert.equal(state.lines[0].quantity, 3);
  });

  test("descarta líneas de otro mercado (DEC-024)", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [validLine, { ...validLine, variantId: "var-co", marketId: "CO" }],
      marketId: MARKET,
    });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].marketId, MARKET);
  });

  test("fusiona duplicados de variantId presentes en el storage", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [validLine, { ...validLine, quantity: 3 }],
      marketId: MARKET,
    });
    assert.equal(state.lines.length, 1);
    assert.equal(state.lines[0].quantity, 5);
  });
});

describe("status de hidratación", () => {
  test("el carrito nace en \"pending\" (aún no se ha leído localStorage)", () => {
    assert.equal(EMPTY_CART.status, "pending");
  });

  test("HYDRATE marca el carrito como \"ready\"", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [],
      marketId: MARKET,
    });
    assert.equal(state.status, "ready");
  });

  test("HYDRATE con datos corruptos también deja el carrito listo", () => {
    const state = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: "basura",
      marketId: MARKET,
    });
    assert.equal(state.status, "ready");
    assert.deepEqual(state.lines, []);
  });

  test("las demás acciones conservan el status", () => {
    const hydrated = cartReducer(EMPTY_CART, {
      type: "HYDRATE",
      payload: [],
      marketId: MARKET,
    });
    const added = cartReducer(hydrated, { type: "ADD_ITEM", item: makeItem() });
    assert.equal(added.status, "ready");
    const updated = cartReducer(added, {
      type: "UPDATE_QUANTITY",
      variantId: "var-1",
      quantity: 3,
    });
    assert.equal(updated.status, "ready");
    const cleared = cartReducer(updated, { type: "CLEAR_CART" });
    assert.equal(cleared.status, "ready", "vaciar no debe volver a pending");
    const removed = cartReducer(added, { type: "REMOVE_ITEM", variantId: "var-1" });
    assert.equal(removed.status, "ready");
  });
});

describe("validadores y selectores", () => {
  test("isValidQuantity", () => {
    assert.equal(isValidQuantity(1), true);
    assert.equal(isValidQuantity(MAX_QUANTITY_PER_LINE), true);
    assert.equal(isValidQuantity(0), false);
    assert.equal(isValidQuantity(-1), false);
    assert.equal(isValidQuantity(2.5), false);
    assert.equal(isValidQuantity(Number.NaN), false);
    assert.equal(isValidQuantity(Number.POSITIVE_INFINITY), false);
    assert.equal(isValidQuantity("3"), false);
    assert.equal(isValidQuantity(null), false);
    assert.equal(isValidQuantity(undefined), false);
  });

  test("maxQuantityFor usa el stock cuando existe", () => {
    assert.equal(maxQuantityFor({ stockSnapshot: 4 }), 4);
    assert.equal(maxQuantityFor({ stockSnapshot: null }), MAX_QUANTITY_PER_LINE);
    assert.equal(maxQuantityFor({ stockSnapshot: 0 }), MAX_QUANTITY_PER_LINE);
    assert.equal(maxQuantityFor({ stockSnapshot: 500 }), MAX_QUANTITY_PER_LINE);
  });

  test("sanitizeLine devuelve null para valores no-objeto", () => {
    for (const value of [null, undefined, 3, "x", true, []]) {
      assert.equal(sanitizeLine(value), null, String(value));
    }
  });

  test("sanitizeLines ignora lo que no sea array", () => {
    assert.deepEqual(sanitizeLines("nope", MARKET), []);
    assert.deepEqual(sanitizeLines(null, MARKET), []);
  });

  test("selectTotalUnits suma unidades, no líneas", () => {
    const state = stateWith(
      makeItem({ variantId: "var-1", quantity: 2 }),
      makeItem({ variantId: "var-2", quantity: 1 }),
    );
    assert.equal(selectTotalUnits(state), 3);
    assert.equal(state.lines.length, 2);
  });

  test("selectSubtotal multiplica precio por cantidad", () => {
    const state = stateWith(
      makeItem({ variantId: "var-1", unitPrice: 10, quantity: 2 }),
      makeItem({ variantId: "var-2", unitPrice: 5.5, quantity: 4 }),
    );
    assert.equal(selectSubtotal(state), 42);
  });

  test("selectTotals agrega unidades, líneas y subtotal", () => {
    const state = stateWith(
      makeItem({ variantId: "var-1", unitPrice: 10, quantity: 2 }),
      makeItem({ variantId: "var-2", unitPrice: 20, quantity: 1 }),
    );
    assert.deepEqual(selectTotals(state), {
      totalUnits: 3,
      lineCount: 2,
      subtotal: 40,
    });
  });

  test("carrito vacío: totales en cero", () => {
    assert.deepEqual(selectTotals(EMPTY_CART), {
      totalUnits: 0,
      lineCount: 0,
      subtotal: 0,
    });
  });

  test("selectCheckoutItems expone SOLO variantId y quantity (DEC-007)", () => {
    const state = stateWith(makeItem({ quantity: 2 }));
    const items = selectCheckoutItems(state);
    assert.deepEqual(items, [{ variantId: "var-1", quantity: 2 }]);
    // El snapshot de precio nunca debe viajar al checkout: el servidor lo resuelve.
    assert.deepEqual(Object.keys(items[0]), ["variantId", "quantity"]);
  });
});

describe("robustez general", () => {
  test("una acción desconocida devuelve el mismo estado", () => {
    const base = stateWith(makeItem());
    // Simula un estado persistido/acción de una versión futura.
    const unknownAction = { type: "NOPE" } as unknown as Parameters<
      typeof cartReducer
    >[1];
    assert.equal(cartReducer(base, unknownAction), base);
  });

  test("el reducer no toca globals del navegador", () => {
    // Si el reducer usara window/localStorage, esto lanzaría en Node.
    assert.equal(typeof globalThis.window, "undefined");
    const state = stateWith(makeItem());
    assert.equal(state.lines.length, 1);
  });
});
