import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_CART, cartReducer, selectTotals } from "../reducer.ts";
import {
  CART_STORAGE_KEY,
  readPersistedLines,
  writePersistedCart,
} from "../storage.ts";
import type { AddItemInput, CartState } from "../types.ts";

/**
 * Flujo completo del carrito (Fase 5): reducer + persistencia trabajando
 * juntos, incluyendo el ciclo "recargar la página".
 *
 * Reproduce sin navegador los pasos de validación funcional de la fase.
 * Lo que NO cubre: el render real en el DOM y los eventos de click — eso
 * requiere un navegador, que no está disponible en este entorno.
 */

const MARKET = "ES";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  seed(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const chaqueta: AddItemInput = {
  variantId: "var-chaqueta-M",
  productId: "prod-chaqueta",
  productSlug: "chaqueta-cortavientos-cumbre",
  productName: "Chaqueta cortavientos Cumbre",
  imageUrl: null,
  colorName: "Negro",
  sizeLabel: "M",
  unitPrice: 89.9,
  marketId: MARKET,
  stockSnapshot: 12,
};

const camiseta: AddItemInput = {
  variantId: "var-camiseta-L",
  productId: "prod-camiseta",
  productSlug: "camiseta-sendero-oversize",
  productName: "Camiseta Sendero Oversize",
  imageUrl: null,
  colorName: "Piedra",
  sizeLabel: "L",
  unitPrice: 34.9,
  marketId: MARKET,
  stockSnapshot: 20,
};

/**
 * Simula una sesión de navegador: mantiene el estado y lo persiste tras cada
 * acción, igual que hace `CartProvider` con su efecto de escritura.
 */
class Session {
  state: CartState = EMPTY_CART;

  /** Equivale al montaje del provider: HYDRATE desde localStorage. */
  load(): this {
    this.state = cartReducer(this.state, {
      type: "HYDRATE",
      payload: readPersistedLines(MARKET),
      marketId: MARKET,
    });
    return this;
  }

  dispatch(action: Parameters<typeof cartReducer>[1]): this {
    this.state = cartReducer(this.state, action);
    if (this.state.status === "ready") {
      writePersistedCart(this.state, MARKET);
    }
    return this;
  }

  get totals() {
    return selectTotals(this.state);
  }
}

/** Una recarga = una sesión nueva sobre el mismo localStorage. */
function reload(): Session {
  return new Session().load();
}

describe("flujo de usuario completo", () => {
  test("añadir → contador → recargar → sigue ahí", () => {
    const session = reload();
    assert.equal(session.totals.totalUnits, 0, "arranca vacío");

    session.dispatch({ type: "ADD_ITEM", item: chaqueta });
    assert.equal(session.totals.totalUnits, 1);

    const afterReload = reload();
    assert.equal(afterReload.totals.totalUnits, 1, "persiste tras recargar");
    assert.equal(afterReload.state.lines[0].variantId, "var-chaqueta-M");
    assert.equal(afterReload.state.lines[0].productName, "Chaqueta cortavientos Cumbre");
  });

  test("varias variantes, cantidades y subtotales", () => {
    const session = reload()
      .dispatch({ type: "ADD_ITEM", item: chaqueta })
      .dispatch({ type: "ADD_ITEM", item: { ...camiseta, quantity: 2 } });

    assert.equal(session.state.lines.length, 2);
    assert.equal(session.totals.totalUnits, 3, "cuenta unidades, no líneas");
    assert.equal(session.totals.lineCount, 2);
    assert.equal(session.totals.subtotal, 89.9 + 34.9 * 2);

    const afterReload = reload();
    assert.equal(afterReload.totals.totalUnits, 3);
    assert.equal(afterReload.totals.subtotal, 89.9 + 34.9 * 2);
  });

  test("añadir la MISMA variante dos veces no crea una línea nueva", () => {
    const session = reload()
      .dispatch({ type: "ADD_ITEM", item: chaqueta })
      .dispatch({ type: "ADD_ITEM", item: chaqueta });

    assert.equal(session.state.lines.length, 1);
    assert.equal(session.state.lines[0].quantity, 2);
    assert.equal(reload().state.lines.length, 1);
  });

  test("dos variantes del MISMO producto son líneas separadas", () => {
    const session = reload()
      .dispatch({ type: "ADD_ITEM", item: chaqueta })
      .dispatch({
        type: "ADD_ITEM",
        item: { ...chaqueta, variantId: "var-chaqueta-L", sizeLabel: "L" },
      });

    assert.equal(session.state.lines.length, 2);
    assert.deepEqual(
      reload().state.lines.map((l) => l.sizeLabel),
      ["M", "L"],
    );
  });

  test("modificar cantidad persiste", () => {
    reload()
      .dispatch({ type: "ADD_ITEM", item: chaqueta })
      .dispatch({
        type: "UPDATE_QUANTITY",
        variantId: "var-chaqueta-M",
        quantity: 5,
      });

    const afterReload = reload();
    assert.equal(afterReload.state.lines[0].quantity, 5);
    assert.equal(afterReload.totals.subtotal, 89.9 * 5);
  });

  test("eliminar una línea persiste y no toca las demás", () => {
    reload()
      .dispatch({ type: "ADD_ITEM", item: chaqueta })
      .dispatch({ type: "ADD_ITEM", item: camiseta })
      .dispatch({ type: "REMOVE_ITEM", variantId: "var-chaqueta-M" });

    const afterReload = reload();
    assert.equal(afterReload.state.lines.length, 1);
    assert.equal(afterReload.state.lines[0].variantId, "var-camiseta-L");
  });

  test("vaciar el carrito persiste el estado vacío", () => {
    reload()
      .dispatch({ type: "ADD_ITEM", item: chaqueta })
      .dispatch({ type: "ADD_ITEM", item: camiseta })
      .dispatch({ type: "CLEAR_CART" });

    const afterReload = reload();
    assert.deepEqual(afterReload.state.lines, []);
    assert.equal(afterReload.totals.totalUnits, 0);
  });
});

describe("recuperación tras manipulación del storage", () => {
  test("storage corrupto: la app arranca con carrito vacío, sin lanzar", () => {
    storage.seed(CART_STORAGE_KEY, "{esto no es json");

    let session: Session | undefined;
    assert.doesNotThrow(() => {
      session = reload();
    });
    assert.deepEqual(session?.state.lines, []);
    assert.equal(session?.state.status, "ready", "la UI no se queda cargando");
    assert.equal(storage.has(CART_STORAGE_KEY), false, "la entrada se limpia");
  });

  test("tras storage corrupto se puede seguir usando el carrito", () => {
    storage.seed(CART_STORAGE_KEY, "%%%");
    const session = reload().dispatch({ type: "ADD_ITEM", item: chaqueta });
    assert.equal(session.totals.totalUnits, 1);
    assert.equal(reload().totals.totalUnits, 1, "vuelve a persistir bien");
  });

  test("versión desconocida: se descarta sin romper", () => {
    storage.seed(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 99, marketId: MARKET, lines: [chaqueta] }),
    );
    const session = reload();
    assert.deepEqual(session.state.lines, []);
    assert.equal(session.state.status, "ready");
  });

  test("precio manipulado en storage se restaura tal cual: NO es autoridad", () => {
    // Un usuario edita localStorage y se pone la chaqueta a 1 €.
    storage.seed(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        marketId: MARKET,
        lines: [{ ...chaqueta, quantity: 1, unitPrice: 1 }],
      }),
    );
    const session = reload();

    // El carrito lo acepta: es solo un snapshot de UX. Este test documenta
    // el límite de seguridad — la Fase 6 DEBE recalcular el precio en servidor
    // contra Supabase antes de crear el pedido.
    assert.equal(session.state.lines[0].unitPrice, 1);
    assert.equal(session.totals.subtotal, 1);
  });

  test("cantidad manipulada se recorta al stock conocido", () => {
    storage.seed(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        marketId: MARKET,
        lines: [{ ...chaqueta, quantity: 99999, stockSnapshot: 12 }],
      }),
    );
    assert.equal(reload().state.lines[0].quantity, 12);
  });

  test("líneas basura se descartan y las válidas sobreviven", () => {
    storage.seed(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        marketId: MARKET,
        lines: [{ hola: "mundo" }, null, { ...chaqueta, quantity: 1 }, 12345],
      }),
    );
    const session = reload();
    assert.equal(session.state.lines.length, 1);
    assert.equal(session.state.lines[0].variantId, "var-chaqueta-M");
  });

  test("carrito de otro mercado no contamina el mercado activo (DEC-024)", () => {
    storage.seed(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        marketId: "CO",
        lines: [{ ...chaqueta, marketId: "CO" }],
      }),
    );
    const session = reload();
    assert.deepEqual(session.state.lines, []);
  });
});

describe("independencia del checkout (DEC-007)", () => {
  test("el módulo del carrito no importa nada de checkout/WhatsApp/Supabase", async () => {
    // Comprobación estructural: si algún día alguien acopla el carrito al
    // canal de checkout, este test lo detecta.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(import.meta.dirname, "..");
    const forbidden = /whatsapp|wa\.me|stripe|mercadopago|wompi|supabase|checkout/i;

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      // Solo las líneas de import: los comentarios sí pueden citar DEC-007.
      const imports = source
        .split(/\r?\n/)
        .filter((line) => /^\s*import\s/.test(line) || /\bfrom\s+["']/.test(line));
      for (const line of imports) {
        assert.equal(
          forbidden.test(line),
          false,
          `${file} importa algo prohibido para el carrito: ${line.trim()}`,
        );
      }
    }
  });
});
