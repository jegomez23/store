import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildOrderMessage } from "../message.ts";
import type { CheckoutMarket, TrustedOrder } from "../../checkout/types.ts";

/**
 * Mensaje de WhatsApp (Fase 6) — plantillas de docs/06-WHATSAPP.md §2.
 *
 * Función pura: recibe un `TrustedOrder` (datos ya resueltos por PostgreSQL),
 * nunca el carrito del cliente.
 */

/**
 * `Intl` separa el importe del símbolo con un espacio duro (U+00A0), no con
 * un espacio normal. Es correcto y llega intacto a WhatsApp, pero haría
 * ilegibles las aserciones, así que se normaliza solo para comparar.
 */
const plain = (text: string) => text.replace(/\u00A0/g, " ");

const ES: CheckoutMarket = { id: "ES", currencyCode: "EUR", locale: "es-ES" };
const CO: CheckoutMarket = { id: "CO", currencyCode: "COP", locale: "es-CO" };

function order(overrides: Partial<TrustedOrder> = {}): TrustedOrder {
  return {
    orderId: "00000000-0000-4000-8000-000000000001",
    orderNumber: "YI-ES-000001",
    status: "pending",
    marketId: "ES",
    currencyCode: "EUR",
    subtotal: 34.9,
    discountTotal: 0,
    shippingTotal: 0,
    total: 34.9,
    reused: false,
    items: [
      {
        variantId: "11111111-1111-4111-8111-111111111111",
        productName: "Camiseta Sendero Oversize",
        colorName: "Piedra",
        sizeLabel: "M",
        sku: "YI-ES-CSO-PIE-M",
        unitPrice: 34.9,
        quantity: 1,
        lineTotal: 34.9,
      },
    ],
    ...overrides,
  };
}

describe("estructura del mensaje", () => {
  test("empieza con el saludo documentado", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(message.startsWith("Hola 👋\nQuiero realizar el siguiente pedido:"));
  });

  test("incluye cantidad, nombre, color y talla", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(plain(message).includes("1x Camiseta Sendero Oversize"));
    assert.ok(plain(message).includes("Color: Piedra"));
    assert.ok(plain(message).includes("Talla: M"));
  });

  test("incluye el total y el número de pedido", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(plain(message).includes("Total: 34,90 €"));
    assert.ok(plain(message).includes("Pedido: YI-ES-000001"));
  });

  test("varias líneas aparecen todas", () => {
    const message = buildOrderMessage(
      order({
        subtotal: 124.8,
        total: 124.8,
        items: [
          ...order().items,
          {
            variantId: "22222222-2222-4222-8222-222222222222",
            productName: "Chaqueta cortavientos Cumbre",
            colorName: "Negro",
            sizeLabel: "L",
            sku: "YI-ES-CCC-NEG-L",
            unitPrice: 89.9,
            quantity: 1,
            lineTotal: 89.9,
          },
        ],
      }),
      ES,
    );
    assert.ok(plain(message).includes("Camiseta Sendero Oversize"));
    assert.ok(plain(message).includes("Chaqueta cortavientos Cumbre"));
    assert.ok(plain(message).includes("Total: 124,80 €"));
  });

  test("muestra el subtotal de línea solo si hay más de una unidad", () => {
    const single = buildOrderMessage(order(), ES);
    assert.ok(!plain(single).includes("Subtotal:"), "con 1 unidad sería redundante");

    const multiple = buildOrderMessage(
      order({
        subtotal: 104.7,
        total: 104.7,
        items: [{ ...order().items[0], quantity: 3, lineTotal: 104.7 }],
      }),
      ES,
    );
    assert.ok(plain(multiple).includes("3x Camiseta Sendero Oversize"));
    assert.ok(plain(multiple).includes("Subtotal: 104,70 €"));
  });
});

describe("variantes sin color o sin talla (DEC-019)", () => {
  test("omite las líneas que no aplican", () => {
    const message = buildOrderMessage(
      order({
        items: [
          {
            ...order().items[0],
            productName: "Gorra Horizonte",
            colorName: null,
            sizeLabel: null,
          },
        ],
      }),
      ES,
    );
    assert.ok(plain(message).includes("1x Gorra Horizonte"));
    assert.ok(!plain(message).includes("Color:"));
    assert.ok(!plain(message).includes("Talla:"));
  });

  test("con color pero sin talla, solo aparece el color", () => {
    const message = buildOrderMessage(
      order({ items: [{ ...order().items[0], sizeLabel: null }] }),
      ES,
    );
    assert.ok(plain(message).includes("Color: Piedra"));
    assert.ok(!plain(message).includes("Talla:"));
  });
});

describe("formato monetario por mercado", () => {
  test("ES usa euros con decimales", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(plain(message).includes("34,90 €"), message);
  });

  test("CO usa pesos sin decimales", () => {
    const message = buildOrderMessage(
      order({
        marketId: "CO",
        currencyCode: "COP",
        orderNumber: "YI-CO-000001",
        subtotal: 89900,
        total: 89900,
        items: [{ ...order().items[0], unitPrice: 89900, lineTotal: 89900 }],
      }),
      CO,
    );
    assert.ok(plain(message).includes("89.900"), message);
    assert.ok(!plain(message).includes(",00"), "COP no lleva decimales");
  });

  test("nunca aparece un precio sin formatear", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(!plain(message).includes("34.9"), "el precio crudo no debe filtrarse");
  });
});

describe("descuentos y envío", () => {
  test("no se muestran cuando son cero (Fase 6 no los aplica)", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(!plain(message).includes("Descuento"));
    assert.ok(!plain(message).includes("Envío"));
  });

  test("se muestran cuando existen (preparado para fases futuras)", () => {
    const message = buildOrderMessage(
      order({ discountTotal: 5, shippingTotal: 4.9, total: 34.8 }),
      ES,
    );
    assert.ok(plain(message).includes("Descuento: -5,00 €"));
    assert.ok(plain(message).includes("Envío: 4,90 €"));
    assert.ok(plain(message).includes("Total: 34,80 €"));
  });
});

describe("el mensaje solo contiene datos confiables", () => {
  test("no incluye ids internos ni datos del cliente", () => {
    const message = buildOrderMessage(order(), ES);
    assert.ok(!plain(message).includes("00000000-0000-4000-8000-000000000001"), "sin order_id");
    assert.ok(!plain(message).includes("11111111"), "sin variant_id");
    assert.ok(!plain(message).toLowerCase().includes("sku"), "el SKU es interno");
  });

  test("es texto plano seguro de codificar", () => {
    const message = buildOrderMessage(order(), ES);
    assert.equal(typeof message, "string");
    assert.equal(decodeURIComponent(encodeURIComponent(message)), message);
  });
});
