import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SHIPPING_LIMITS,
  shippingErrorMessage,
  validateShippingMethodInput,
} from "../shipping.ts";

/**
 * Validación de los métodos de entrega (incremento 9).
 *
 * Primera barrera. La definitiva son los CHECK y el índice UNIQUE de la
 * migración 0036, que se prueban contra la BD real en
 * `shipping-crud.integration.test.ts`.
 */

const form = (over: Partial<Parameters<typeof validateShippingMethodInput>[0]> = {}) =>
  validateShippingMethodInput({
    name: "Envío estándar",
    description: "Llega en 2-4 días.",
    price: "4.90",
    freeShippingThreshold: "",
    sortOrder: "1",
    isActive: true,
    ...over,
  });

describe("validateShippingMethodInput · lo básico", () => {
  test("acepta un método correcto y lo normaliza", () => {
    const result = form();
    assert.ok(result.ok);
    assert.deepEqual(result.input, {
      name: "Envío estándar",
      description: "Llega en 2-4 días.",
      price: 4.9,
      freeShippingThreshold: null,
      sortOrder: 1,
      isActive: true,
    });
  });

  test("colapsa espacios en nombre y descripción", () => {
    const result = form({ name: "  Envío   urgente  ", description: "  dos   días  " });
    assert.ok(result.ok);
    assert.equal(result.input.name, "Envío urgente");
    assert.equal(result.input.description, "dos días");
  });

  test("una descripción vacía es NULL, no cadena vacía", () => {
    const result = form({ description: "   " });
    assert.ok(result.ok);
    assert.equal(result.input.description, null);
  });

  test("el nombre es obligatorio", () => {
    for (const bad of ["", "   "]) {
      const result = form({ name: bad });
      assert.equal(result.ok, false, JSON.stringify(bad));
      assert.match((result as { error: string }).error, /nombre es obligatorio/i);
    }
  });

  test("nombre y descripción tienen tope", () => {
    assert.equal(form({ name: "x".repeat(SHIPPING_LIMITS.name + 1) }).ok, false);
    assert.equal(form({ description: "x".repeat(SHIPPING_LIMITS.description + 1) }).ok, false);
  });
});

describe("validateShippingMethodInput · dinero", () => {
  test("acepta coma y punto como separador decimal", () => {
    // Quien teclea en español escribe "4,90".
    for (const raw of ["4.90", "4,90"]) {
      const result = form({ price: raw });
      assert.ok(result.ok, raw);
      assert.equal(result.input.price, 4.9);
    }
  });

  test("un precio de 0 es válido: es un método gratuito", () => {
    const result = form({ price: "0" });
    assert.ok(result.ok);
    assert.equal(result.input.price, 0);
  });

  test("rechaza negativos, más de dos decimales y texto", () => {
    for (const bad of ["-1", "-0.01", "4.905", "gratis", "", "1e3", "4.90abc", "  "]) {
      assert.equal(form({ price: bad }).ok, false, JSON.stringify(bad));
    }
  });

  test("rechaza un importe desmesurado", () => {
    assert.equal(form({ price: String(SHIPPING_LIMITS.amount + 1) }).ok, false);
  });
});

describe("validateShippingMethodInput · el umbral, que es donde se pierde dinero", () => {
  test("VACÍO significa «nunca gratis», no «gratis siempre»", () => {
    // `Number("")` vale 0, y 0 haría que cualquier subtotal superara el umbral.
    // Esta distinción es la diferencia entre cobrar el envío y regalarlo.
    const result = form({ freeShippingThreshold: "   " });
    assert.ok(result.ok);
    assert.equal(result.input.freeShippingThreshold, null);
  });

  test("CERO significa gratis siempre, y se acepta a propósito", () => {
    const result = form({ freeShippingThreshold: "0" });
    assert.ok(result.ok);
    assert.equal(result.input.freeShippingThreshold, 0);
  });

  test("un umbral negativo se rechaza", () => {
    // Sin esto, `subtotal >= -50` es siempre cierto: envío gratis para todos.
    const result = form({ freeShippingThreshold: "-50" });
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /umbral/i);
  });

  test("acepta un umbral con coma", () => {
    const result = form({ freeShippingThreshold: "59,99" });
    assert.ok(result.ok);
    assert.equal(result.input.freeShippingThreshold, 59.99);
  });
});

describe("validateShippingMethodInput · orden y estado", () => {
  test("orden vacío vale 0; el no numérico se rechaza", () => {
    const empty = form({ sortOrder: "" });
    assert.ok(empty.ok);
    assert.equal(empty.input.sortOrder, 0);
    assert.equal(form({ sortOrder: "1.5" }).ok, false);
    assert.equal(form({ sortOrder: "muchos" }).ok, false);
    assert.equal(form({ sortOrder: "99999999" }).ok, false);
  });

  test("`isActive` viaja tal cual", () => {
    const off = form({ isActive: false });
    assert.ok(off.ok);
    assert.equal(off.input.isActive, false);
  });
});

describe("shippingErrorMessage", () => {
  test("23505 habla de nombre repetido, no de slug", () => {
    assert.match(shippingErrorMessage("23505", "f"), /nombre/i);
  });

  test("23514 menciona negativos y nombre vacío", () => {
    assert.match(shippingErrorMessage("23514", "f"), /negativos|vac/i);
  });

  test("un código desconocido devuelve el fallback", () => {
    assert.equal(shippingErrorMessage("XX999", "fallback"), "fallback");
    assert.equal(shippingErrorMessage(undefined, "fallback"), "fallback");
  });
});
