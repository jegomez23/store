import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  amountToFreeShipping,
  isFreeByThreshold,
  resolveShippingCost,
} from "../shipping.ts";

/**
 * Regla del coste de envío — lógica pura (incremento 8).
 *
 * Esto NO prueba que la tienda cobre bien: prueba la previsión que ve el
 * cliente. Que coincida con lo que hace PostgreSQL lo comprueba
 * `shipping.integration.test.ts` contra la BD real.
 */

const conUmbral = { price: 4.9, freeShippingThreshold: 60 };
const sinUmbral = { price: 4.9, freeShippingThreshold: null };
const gratis = { price: 0, freeShippingThreshold: null };

describe("resolveShippingCost", () => {
  test("por debajo del umbral se cobra el precio", () => {
    assert.equal(resolveShippingCost(conUmbral, 0), 4.9);
    assert.equal(resolveShippingCost(conUmbral, 34.9), 4.9);
    assert.equal(resolveShippingCost(conUmbral, 59.99), 4.9);
  });

  test("EXACTAMENTE en el umbral ya es gratis (>=, no >)", () => {
    // La decisión de Juan fue "a partir de", que es como se anuncian estas
    // ofertas. Si algún día cambia a ">", este test es el que hay que tocar.
    assert.equal(resolveShippingCost(conUmbral, 60), 0);
  });

  test("por encima del umbral, gratis", () => {
    assert.equal(resolveShippingCost(conUmbral, 89.9), 0);
    assert.equal(resolveShippingCost(conUmbral, 1000), 0);
  });

  test("sin umbral se cobra siempre, por alto que sea el pedido", () => {
    assert.equal(resolveShippingCost(sinUmbral, 5000), 4.9);
  });

  test("un método de 0 € cuesta 0 con o sin umbral", () => {
    assert.equal(resolveShippingCost(gratis, 0), 0);
    assert.equal(resolveShippingCost(gratis, 5000), 0);
  });

  test("un umbral de 0 hace el envío gratis desde el primer euro", () => {
    assert.equal(resolveShippingCost({ price: 4.9, freeShippingThreshold: 0 }, 0), 0);
  });
});

describe("isFreeByThreshold", () => {
  test("solo es true cuando un método de pago se vuelve gratis", () => {
    assert.equal(isFreeByThreshold(conUmbral, 60), true);
    assert.equal(isFreeByThreshold(conUmbral, 59), false);
    // Un método que ya vale 0 no "se vuelve" gratis: siempre lo fue.
    assert.equal(isFreeByThreshold(gratis, 5000), false);
    assert.equal(isFreeByThreshold(sinUmbral, 5000), false);
  });
});

describe("amountToFreeShipping", () => {
  test("dice cuánto falta, y solo mientras falte algo", () => {
    assert.equal(amountToFreeShipping(conUmbral, 40), 20);
    assert.equal(amountToFreeShipping(conUmbral, 59.9), 0.10000000000000142);
    assert.equal(amountToFreeShipping(conUmbral, 60), null);
    assert.equal(amountToFreeShipping(conUmbral, 100), null);
  });

  test("no dice nada de un método sin umbral ni de uno gratuito", () => {
    assert.equal(amountToFreeShipping(sinUmbral, 10), null);
    assert.equal(amountToFreeShipping(gratis, 10), null);
  });
});

describe("aritmética del total, con los importes reales de la tienda", () => {
  /*
    El riesgo aquí no es la regla, es el binario: 39 + 4.9 en coma flotante da
    43.900000000000006. Se comprueba que el TOTAL que se enseña, ya formateado,
    no arrastre esa basura — y que el importe que manda el navegador no exista:
    lo definitivo lo calcula PostgreSQL en `numeric`.
  */
  /*
    `Intl` separa el importe del símbolo con un espacio DURO (U+00A0/U+202F),
    no con uno normal. Sin normalizarlo, "43,90 €" y "43,90 €" se ven idénticos
    en el informe de fallos y no lo son — costó un rato descubrirlo.
  */
  const money = (amount: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })
      .format(amount)
      .replace(/[  ]/g, " ");

  const casos: [number, number, string][] = [
    [39, 4.9, "43,90 €"],
    [39.99, 4.9, "44,89 €"],
    [34.9, 4.9, "39,80 €"],
    [24.9 * 3, 4.9, "79,60 €"],
    [0, 0, "0,00 €"],
    [89.9, 0, "89,90 €"],
  ];

  for (const [subtotal, shipping, expected] of casos) {
    test(`${subtotal} + ${shipping} se muestra como ${expected}`, () => {
      assert.equal(money(subtotal + shipping), expected);
    });
  }

  test("39 + 4,9 en coma flotante NO es exacto, y por eso la autoridad es PostgreSQL", () => {
    // Se deja escrito para que nadie "arregle" el formateo pensando que el
    // problema estaba en la UI: el valor guardado es `numeric(12,2)`.
    // 39 + 4.9 sí da 43.9 exacto; el caso que se desvía es otro.
    assert.notEqual(24.9 * 3, 74.7);
    assert.equal(24.9 * 3, 74.69999999999999);
    assert.equal(money(24.9 * 3 + 4.9), "79,60 €");
  });
});
