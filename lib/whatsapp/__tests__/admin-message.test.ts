import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_MESSAGE_KINDS,
  buildAdminMessage,
  messageKindForStatus,
  type AdminMessageKind,
  type AdminMessageOrder,
} from "../admin-message.ts";
import { buildWhatsAppUrl } from "../phone.ts";
import { ORDER_STATUSES } from "../../admin/orders.ts";

/**
 * Mensaje tienda → cliente (Fase 9.5). Función pura.
 *
 * Lo que estos tests protegen, por orden de importancia:
 *   1. Que el importe salga del PEDIDO y no del catálogo vivo.
 *   2. Que los estados sin plantilla sigan sin plantilla — es una decisión de
 *      producto, no un olvido.
 *   3. Que el enlace se componga con la primitiva existente y no con una
 *      segunda implementación de wa.me.
 */

/** `Intl` separa importe y símbolo con espacio duro (U+00A0). */
const plain = (text: string) => text.replace(/ /g, " ");

function order(overrides: Partial<AdminMessageOrder> = {}): AdminMessageOrder {
  return {
    orderNumber: "YI-ES-000123",
    customerName: "Ana",
    currencyCode: "EUR",
    locale: "es-ES",
    total: 84.8,
    lines: [
      {
        productName: "Camiseta Sendero Oversize",
        colorName: "Negro",
        sizeLabel: "M",
        quantity: 2,
        unitPrice: 42.4,
        lineTotal: 84.8,
      },
    ],
    ...overrides,
  };
}

describe("messageKindForStatus", () => {
  test("pending y contacted comparten el primer contacto", () => {
    assert.equal(messageKindForStatus("pending"), "first_contact");
    assert.equal(messageKindForStatus("contacted"), "first_contact");
  });

  test("confirmed, shipped y cancelled tienen la suya", () => {
    assert.equal(messageKindForStatus("confirmed"), "confirmed");
    assert.equal(messageKindForStatus("shipped"), "shipped");
    assert.equal(messageKindForStatus("cancelled"), "cancelled");
  });

  test("paid tiene la suya: el pago es un hecho nuevo y verificable", () => {
    assert.equal(messageKindForStatus("paid"), "paid");
  });

  test("preparing y delivered NO tienen plantilla (decisión, no olvido)", () => {
    assert.equal(messageKindForStatus("preparing"), null);
    assert.equal(messageKindForStatus("delivered"), null);
  });

  test("cubre los ocho estados sin lanzar", () => {
    for (const status of ORDER_STATUSES) {
      const kind = messageKindForStatus(status);
      assert.ok(
        kind === null || (ADMIN_MESSAGE_KINDS as readonly string[]).includes(kind),
        `${status} devolvió ${kind}`,
      );
    }
  });

  test("solo hay 5 plantillas con texto: la cifra es deliberada", () => {
    const withText = ADMIN_MESSAGE_KINDS.filter((k) => k !== "plain");
    assert.equal(withText.length, 5);
  });
});

describe("buildAdminMessage — contenido", () => {
  test("siempre lleva el número de pedido", () => {
    for (const kind of ["first_contact", "confirmed", "paid", "shipped", "cancelled"] as const) {
      assert.ok(
        buildAdminMessage(order(), kind).includes("YI-ES-000123"),
        `${kind} perdió el número de pedido`,
      );
    }
  });

  test("usa el nombre del cliente cuando existe", () => {
    assert.ok(buildAdminMessage(order(), "first_contact").startsWith("Hola Ana"));
  });

  test("sin nombre saluda igual, sin escribir 'null' ni 'undefined'", () => {
    const text = buildAdminMessage(order({ customerName: null }), "first_contact");
    assert.ok(text.startsWith("Hola 👋"));
    assert.ok(!/null|undefined/.test(text));
  });

  test("un nombre en blanco se trata como ausente", () => {
    const text = buildAdminMessage(order({ customerName: "   " }), "first_contact");
    assert.ok(text.startsWith("Hola 👋"));
  });

  test("el importe se formatea con la moneda DEL PEDIDO, no la del mercado", () => {
    const es = plain(buildAdminMessage(order(), "first_contact"));
    assert.ok(es.includes("84,80 €"), es);

    const co = plain(
      buildAdminMessage(
        order({ currencyCode: "COP", locale: "es-CO", total: 89900, lines: [] }),
        "first_contact",
      ),
    );
    assert.ok(co.includes("$ 89.900"), co);
    assert.ok(!co.includes("€"));
  });

  test("el desglose usa los snapshots de la línea (nombre, color, talla)", () => {
    const text = buildAdminMessage(order(), "first_contact");
    assert.ok(text.includes("2x Camiseta Sendero Oversize · Negro · M"));
  });

  test("una línea sin color ni talla no deja separadores sueltos", () => {
    const text = buildAdminMessage(
      order({
        lines: [
          {
            productName: "Gorra Horizonte",
            colorName: null,
            sizeLabel: null,
            quantity: 1,
            unitPrice: 24.9,
            lineTotal: 24.9,
          },
        ],
      }),
      "first_contact",
    );
    assert.ok(text.includes("1x Gorra Horizonte —"));
    assert.ok(!text.includes("· ·"));
    assert.ok(!text.includes(" ·  "));
  });

  test("sin líneas (listado) el mensaje sigue siendo válido y lleva el total", () => {
    const text = plain(buildAdminMessage(order({ lines: undefined }), "first_contact"));
    assert.ok(text.includes("YI-ES-000123"));
    assert.ok(text.includes("Total: 84,80 €"));
  });

  test("pago, envío y cancelación NO repiten el desglose: sería ruido", () => {
    for (const kind of ["paid", "shipped", "cancelled"] as const) {
      const text = buildAdminMessage(order(), kind);
      assert.ok(!text.includes("Camiseta Sendero"), `${kind} repite el desglose`);
      assert.ok(!text.includes("Total:"), `${kind} repite el total`);
    }
  });

  test("el aviso de pago NO promete plazos ni logística", () => {
    // El modelo no guarda transportista, seguimiento ni fecha de entrega:
    // prometerlo seria inventar informacion que nadie puede cumplir.
    const text = buildAdminMessage(order(), "paid").toLowerCase();
    for (const inventado of [
      "24h", "48h", "horas", "días", "dias", "mañana", "semana",
      "correos", "seur", "mrw", "seguimiento", "tracking", "entrega el",
    ]) {
      assert.ok(!text.includes(inventado), `promete logística: "${inventado}"`);
    }
  });

  test("el aviso de pago dice el hecho: pago recibido y pasa a prepararse", () => {
    const text = buildAdminMessage(order(), "paid");
    assert.ok(text.includes("YI-ES-000123"));
    assert.ok(/recibido el pago/i.test(text));
  });

  test("la cancelación NO inventa un motivo", () => {
    const text = buildAdminMessage(order(), "cancelled").toLowerCase();
    for (const inventado of ["sin stock", "agotado", "impago", "no has pagado", "porque"]) {
      assert.ok(!text.includes(inventado), `inventa un motivo: "${inventado}"`);
    }
  });

  test("'plain' devuelve cadena vacía: abre el chat sin texto", () => {
    assert.equal(buildAdminMessage(order(), "plain"), "");
  });

  test("ningún mensaje filtra datos internos del pedido", () => {
    // Nada de ids, estados internos ni notas del panel viaja al cliente.
    for (const kind of ADMIN_MESSAGE_KINDS) {
      const text = buildAdminMessage(order(), kind as AdminMessageKind);
      assert.ok(!/pending|contacted|preparing|uuid|market_id/i.test(text), kind);
    }
  });
});

describe("integración con la primitiva de wa.me existente", () => {
  test("el enlace se construye con buildWhatsAppUrl, sin segunda implementación", () => {
    const message = buildAdminMessage(order(), "first_contact");
    const url = buildWhatsAppUrl("+34 600 11 22 33", message);
    assert.ok(url !== null);
    assert.ok(url!.startsWith("https://wa.me/34600112233?text="));
  });

  test("un teléfono inutilizable no produce enlace", () => {
    assert.equal(buildWhatsAppUrl("", buildAdminMessage(order(), "first_contact")), null);
    assert.equal(buildWhatsAppUrl("123", buildAdminMessage(order(), "first_contact")), null);
    assert.equal(buildWhatsAppUrl(null, "hola"), null);
  });

  test("los saltos de línea y el emoji sobreviven codificados", () => {
    const url = buildWhatsAppUrl("34600112233", buildAdminMessage(order(), "first_contact"))!;
    assert.ok(url.includes("%0A"), "el salto de línea debe ir codificado");
    assert.ok(!url.includes("\n"), "no puede quedar un salto crudo en la URL");
  });

  test("un nombre con caracteres de URL no rompe el enlace", () => {
    const url = buildWhatsAppUrl(
      "34600112233",
      buildAdminMessage(order({ customerName: "Ana&co?x=1#z" }), "first_contact"),
    )!;
    // Todo lo peligroso queda codificado detrás de ?text=
    const query = url.slice(url.indexOf("?text=") + 6);
    assert.ok(!query.includes("&"), "un & sin codificar partiría el querystring");
    assert.ok(!query.includes("#"), "un # sin codificar truncaría el mensaje");
  });
});
