import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  CART_STORAGE_KEY,
  CART_STORAGE_VERSION,
  clearPersistedCart,
  readPersistedLines,
  writePersistedCart,
} from "../storage.ts";
import type { CartLine, CartState } from "../types.ts";

/**
 * Tests de la persistencia del carrito (Fase 5).
 *
 * Node no tiene `window`/`localStorage`, así que se instala un doble mínimo.
 * Eso también demuestra que `storage.ts` no depende de nada del navegador más
 * allá de `window.localStorage`.
 */

const MARKET = "ES";

class MemoryStorage {
  private map = new Map<string, string>();
  /** Si es true, cada operación lanza (simula Safari privado / cuota llena). */
  throwOnAccess = false;

  getItem(key: string): string | null {
    if (this.throwOnAccess) throw new Error("storage bloqueado");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOnAccess) throw new Error("QuotaExceededError");
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.throwOnAccess) throw new Error("storage bloqueado");
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  raw(key: string): string | null {
    return this.map.get(key) ?? null;
  }
}

let storage: MemoryStorage;

function installWindow(): void {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
}

function removeWindow(): void {
  delete (globalThis as { window?: unknown }).window;
}

const line: CartLine = {
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

const state: CartState = { lines: [line], status: "ready" };

describe("sin window (SSR / build)", () => {
  beforeEach(removeWindow);

  test("readPersistedLines devuelve null y no lanza", () => {
    assert.equal(readPersistedLines(MARKET), null);
  });

  test("writePersistedCart es no-op y no lanza", () => {
    assert.doesNotThrow(() => writePersistedCart(state, MARKET));
  });

  test("clearPersistedCart es no-op y no lanza", () => {
    assert.doesNotThrow(() => clearPersistedCart());
  });
});

describe("ciclo normal en cliente", () => {
  beforeEach(installWindow);
  afterEach(removeWindow);

  test("escribe y vuelve a leer las líneas", () => {
    writePersistedCart(state, MARKET);
    const restored = readPersistedLines(MARKET);
    assert.deepEqual(restored, [line]);
  });

  test("usa la clave versionada esperada", () => {
    writePersistedCart(state, MARKET);
    assert.ok(storage.has(CART_STORAGE_KEY));
    assert.equal(CART_STORAGE_KEY, "yi-store:cart:v1");
  });

  test("guarda un envoltorio con version y marketId", () => {
    writePersistedCart(state, MARKET);
    const parsed = JSON.parse(storage.raw(CART_STORAGE_KEY) ?? "{}");
    assert.equal(parsed.version, CART_STORAGE_VERSION);
    assert.equal(parsed.marketId, MARKET);
    assert.ok(Array.isArray(parsed.lines));
  });

  test("sin nada guardado devuelve null", () => {
    assert.equal(readPersistedLines(MARKET), null);
  });

  test("clearPersistedCart borra la entrada", () => {
    writePersistedCart(state, MARKET);
    clearPersistedCart();
    assert.equal(storage.has(CART_STORAGE_KEY), false);
    assert.equal(readPersistedLines(MARKET), null);
  });

  test("un carrito vacío se persiste como lista vacía", () => {
    writePersistedCart({ lines: [], status: "ready" }, MARKET);
    assert.deepEqual(readPersistedLines(MARKET), []);
  });
});

describe("recuperación ante datos corruptos", () => {
  beforeEach(installWindow);
  afterEach(removeWindow);

  const corrupt = [
    ["JSON inválido", "{no es json"],
    ["JSON truncado", '{"version":1,"lines":['],
    ["cadena suelta", '"hola"'],
    ["número suelto", "42"],
    ["null", "null"],
    ["array en la raíz", "[1,2,3]"],
  ] as const;

  for (const [label, raw] of corrupt) {
    test(`${label}: devuelve null, limpia la entrada y no lanza`, () => {
      storage.setItem(CART_STORAGE_KEY, raw);
      let result: unknown;
      assert.doesNotThrow(() => {
        result = readPersistedLines(MARKET);
      });
      assert.equal(result, null);
      assert.equal(
        storage.has(CART_STORAGE_KEY),
        false,
        "la entrada corrupta debe eliminarse",
      );
    });
  }

  test("storage que lanza al leer: devuelve null sin romper", () => {
    storage.throwOnAccess = true;
    let result: unknown = "sin asignar";
    assert.doesNotThrow(() => {
      result = readPersistedLines(MARKET);
    });
    assert.equal(result, null);
  });

  test("storage que lanza al escribir: no propaga el error", () => {
    storage.throwOnAccess = true;
    assert.doesNotThrow(() => writePersistedCart(state, MARKET));
  });
});

describe("versión desconocida del storage", () => {
  beforeEach(installWindow);
  afterEach(removeWindow);

  const versions = [
    ["versión futura", 2],
    ["versión antigua", 0],
    ["versión no numérica", "v1"],
    ["versión ausente", undefined],
  ] as const;

  for (const [label, version] of versions) {
    test(`${label}: se ignora de forma segura y se limpia`, () => {
      storage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ version, marketId: MARKET, lines: [line] }),
      );
      assert.equal(readPersistedLines(MARKET), null);
      assert.equal(storage.has(CART_STORAGE_KEY), false);
    });
  }
});

describe("aislamiento por mercado (DEC-024)", () => {
  beforeEach(installWindow);
  afterEach(removeWindow);

  test("un carrito de otro mercado no se lee ni se migra", () => {
    writePersistedCart({ lines: [{ ...line, marketId: "CO" }], status: "ready" }, "CO");
    assert.equal(readPersistedLines("ES"), null);
    assert.equal(
      storage.has(CART_STORAGE_KEY),
      false,
      "debe limpiarse en vez de mezclarse",
    );
  });

  test("el mismo mercado sí se lee", () => {
    writePersistedCart(state, MARKET);
    assert.deepEqual(readPersistedLines(MARKET), [line]);
  });
});
