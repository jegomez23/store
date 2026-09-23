import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  hasShippingToShow,
  summarizeShipping,
} from "../shipping-summary.ts";
import type { ShippingMethodOption } from "../shipping.ts";

/**
 * Lo que la tienda puede decir del envío ANTES del checkout (Incremento 19).
 *
 * La invariante que protegen estos tests: **aquí no se inventa nada**. Todo
 * sale de `shipping_methods`, y cuando no hay datos no se dice nada en vez de
 * rellenar con una promesa.
 */

const metodo = (over: Partial<ShippingMethodOption> = {}): ShippingMethodOption => ({
  id: over.id ?? "m1",
  name: over.name ?? "Envío a Península",
  description: over.description ?? null,
  price: over.price ?? 4.9,
  freeShippingThreshold:
    over.freeShippingThreshold === undefined ? null : over.freeShippingThreshold,
});

describe("summarizeShipping", () => {
  test("sin métodos no hay nada que contar", () => {
    const resumen = summarizeShipping([]);
    assert.equal(resumen.count, 0);
    assert.equal(hasShippingToShow(resumen), false);
  });

  test("coge el método de pago MÁS BARATO, no el primero", () => {
    const resumen = summarizeShipping([
      metodo({ id: "a", price: 9.9 }),
      metodo({ id: "b", price: 4.9 }),
      metodo({ id: "c", price: 7.5 }),
    ]);
    assert.equal(resumen.cheapestPaid, 4.9);
  });

  test("un método a 0 es GRATUITO, no «sin precio»", () => {
    // Es la distinción del incremento 9: recoger en tienda cuesta 0 de verdad.
    const resumen = summarizeShipping([
      metodo({ id: "a", price: 4.9 }),
      metodo({ id: "b", name: "Recogida en tienda", price: 0 }),
    ]);
    assert.equal(resumen.hasFreeMethod, true);
    assert.equal(resumen.freeMethodName, "Recogida en tienda");
    assert.equal(resumen.cheapestPaid, 4.9, "el de 0 no puede contar como el más barato de pago");
  });

  test("el umbral que se anuncia es el MÁS BAJO de todos", () => {
    const resumen = summarizeShipping([
      metodo({ id: "a", price: 4.9, freeShippingThreshold: 60 }),
      metodo({ id: "b", price: 9.9, freeShippingThreshold: 40 }),
    ]);
    assert.equal(resumen.freeFrom, 40);
  });

  test("umbral NULL no se convierte en una promesa de envío gratis", () => {
    // `null` = ese método NUNCA sale gratis por importe (DEC-064).
    const resumen = summarizeShipping([metodo({ freeShippingThreshold: null })]);
    assert.equal(resumen.freeFrom, null);
  });

  test("un umbral de 0 no se anuncia como «gratis a partir de 0 €»", () => {
    /*
      Umbral 0 significa «gratis siempre» (DEC-064). Decir «gratis a partir de
      0,00 €» sería verdad y sonaría a error; que el método valga 0 ya lo dice
      `hasFreeMethod`, y si el método cuesta dinero con umbral 0 el precio real
      es 0 y se anuncia por otra vía.
    */
    const resumen = summarizeShipping([metodo({ price: 4.9, freeShippingThreshold: 0 })]);
    assert.equal(resumen.freeFrom, null);
  });

  test("solo métodos gratuitos: hay algo que contar", () => {
    const resumen = summarizeShipping([metodo({ name: "Recogida", price: 0 })]);
    assert.equal(resumen.cheapestPaid, null);
    assert.equal(hasShippingToShow(resumen), true);
  });
});

describe("no se inventa información de envío", () => {
  test("el módulo no contiene ni un importe ni un plazo escritos a mano", () => {
    const source = fs.readFileSync("lib/checkout/shipping-summary.ts", "utf8");
    const codigo = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.ok(
      !/\d+[,.]\d{2}|\b\d+\s*(días|horas|h)\b|24\/48|gratis/i.test(codigo),
      `hay un dato comercial escrito a mano: ${codigo.slice(0, 200)}`,
    );
  });

  test("el componente tampoco promete plazos de entrega", () => {
    /*
      No existe ninguna columna con plazos: `shipping_methods` tiene nombre,
      descripción, precio y umbral. Escribir «recíbelo en 24-48 h» sería
      inventarse una promesa que la tienda no puede cumplir.
    */
    const source = fs.readFileSync("components/store/ShippingNote.tsx", "utf8");
    const visible = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.ok(
      !/\b\d+\s*[-–]\s*\d+\s*(h|horas|días)|24\/48|entrega en \d/i.test(visible),
      "el componente promete un plazo de entrega que no existe en el modelo",
    );
  });

  test("la ficha y el carrito usan la MISMA fuente que el checkout", () => {
    // Si la ficha leyera de otro sitio, podría contradecir lo que se cobra.
    for (const file of [
      "app/(store)/producto/[slug]/page.tsx",
      "app/(store)/carrito/page.tsx",
    ]) {
      const source = fs.readFileSync(file, "utf8");
      assert.match(source, /listShippingMethods/, `${file} no lee shipping_methods`);
      assert.match(source, /summarizeShipping/, `${file} no usa el resumen común`);
    }
  });

  test("cambiar un método invalida la ficha y el carrito", () => {
    /*
      Sin esto, el administrador cambia 4,90 → 6,90 y la ficha —estática con
      ISR— seguiría diciendo 4,90 mientras `create_order` cobra 6,90. La
      contradicción exacta que este incremento venía a quitar.
    */
    const actions = fs.readFileSync("app/admin/(panel)/ajustes/actions.ts", "utf8");
    const envio = actions.slice(actions.indexOf("createShippingMethodAction"));
    const llamadas = (envio.match(/revalidateStorefront\(\)/g) ?? []).length;
    assert.equal(llamadas, 3, "las tres acciones de envío tienen que invalidar el escaparate");
  });

  test("`/carrito` tiene ISR: el precio de envío no puede hornearse en el build", () => {
    const source = fs.readFileSync("app/(store)/carrito/page.tsx", "utf8");
    assert.match(source, /export const revalidate = \d+/);
  });
});
