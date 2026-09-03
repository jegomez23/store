// Import relativo CON extensión: convención de `lib/` para poder ejecutarse
// bajo `node --test` sin bundler (AI-DEVELOPMENT §8.2).
import { formatPrice } from "../money/format.ts";
import type { OrderStatus } from "../admin/orders.ts";

/**
 * Mensaje de WhatsApp de la TIENDA HACIA EL CLIENTE (Fase 9.5) — FUNCIÓN PURA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE REUTILIZA `buildOrderMessage`
 * ─────────────────────────────────────────────────────────────────────────
 * `lib/whatsapp/message.ts` compone el mensaje en la dirección CONTRARIA:
 * cliente → tienda, al terminar el checkout ("Hola, quiero realizar el
 * siguiente pedido"). Aquí escribe el negocio para responder a un pedido que
 * ya existe. Mismo canal, distinto emisor, distinto contenido y distinto
 * momento del ciclo. Reutilizar aquella función obligaría a parametrizarla
 * hasta que dejara de significar nada.
 *
 * Lo que SÍ se reutiliza, sin tocarlo:
 *   - `normalizePhone()` y `buildWhatsAppUrl()` de `./phone.ts` — no existe una
 *     segunda implementación de wa.me en el proyecto.
 *   - `formatPrice()` de `../money/format.ts` — todo importe pasa por ahí.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALEN LOS DATOS
 * ─────────────────────────────────────────────────────────────────────────
 * Del PEDIDO, nunca del catálogo vivo. Los nombres, tallas, colores y precios
 * que se envían son los SNAPSHOTS de `order_items`, que es lo que el cliente
 * compró. Si mañana sube el precio o se renombra el producto, el mensaje sigue
 * diciendo lo que se vendió. Esta función no tiene acceso a la base de datos,
 * así que el error es imposible por construcción.
 *
 * La moneda es la del PEDIDO (`orders.currency_code`), no la del mercado
 * actual: un pedido histórico se representa con su propia moneda.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ESTADOS TIENEN PLANTILLA, Y POR QUÉ LOS DEMÁS NO
 * ─────────────────────────────────────────────────────────────────────────
 * Cinco plantillas para ocho estados. Una plantilla que no aporta información
 * nueva es ruido para el cliente y un clic desperdiciado para el admin.
 *
 *   pending    → PRIMER CONTACTO. El pedido acaba de entrar y el cliente
 *                espera respuesta. Es el 80% del uso diario.
 *   contacted  → la MISMA plantilla: se sigue insistiendo sobre la misma
 *                conversación, no hay nada nuevo que contar.
 *   confirmed  → CONFIRMACIÓN Y PAGO. Cambia la información: se comunica el
 *                total definitivo y el siguiente paso.
 *   paid       → PAGO RECIBIDO. Hecho nuevo y verificable: el dinero está
 *                confirmado y el pedido pasa a prepararse. Es lo único que se
 *                dice; NO se promete plazo, transportista ni fecha de entrega,
 *                porque el modelo no guarda nada de eso y prometerlo sería
 *                inventar información logística.
 *   preparing  → sin plantilla. El aviso de que se prepara ya va en `paid`;
 *                repetirlo es ruido.
 *   shipped    → ENVÍO. Hecho nuevo y verificable que el cliente necesita.
 *   delivered  → sin plantilla. Es un estado TERMINAL: cuando el admin lo
 *                marca, la operación ya terminó. Un mensaje posterior es
 *                postventa (marketing), no operación, y como plantilla de un
 *                clic se convierte en spam.
 *   cancelled  → CANCELACIÓN. Terminal, pero con razón de negocio clara: el
 *                cliente está esperando y el stock ya volvió al catálogo. No
 *                avisarle es un fallo operativo. La plantilla enuncia el hecho
 *                y NO inventa el motivo — ese lo escribe el admin, porque
 *                cancelar por falta de stock y cancelar por impago no son la
 *                misma conversación.
 *
 * En TODOS los estados, incluidos los que no llevan plantilla, la UI ofrece
 * además abrir el chat sin mensaje: eso es lo que ahorra los seis pasos
 * manuales aunque no haya nada precompuesto.
 */

/** Plantillas que existen de verdad. `plain` = abrir chat sin texto. */
export const ADMIN_MESSAGE_KINDS = [
  "first_contact",
  "confirmed",
  "paid",
  "shipped",
  "cancelled",
  "plain",
] as const;

export type AdminMessageKind = (typeof ADMIN_MESSAGE_KINDS)[number];

/**
 * Estado del pedido → plantilla sugerida. `null` significa "este estado no
 * tiene nada específico que decir": la UI ofrece solo abrir el chat.
 */
export function messageKindForStatus(status: OrderStatus): AdminMessageKind | null {
  switch (status) {
    case "pending":
    case "contacted":
      return "first_contact";
    case "confirmed":
      return "confirmed";
    case "paid":
      return "paid";
    case "shipped":
      return "shipped";
    case "cancelled":
      return "cancelled";
    // preparing y delivered: deliberadamente sin plantilla.
    default:
      return null;
  }
}

/** Etiqueta del botón. TODO(i18n) cuando exista el módulo (DEC-013). */
export const ADMIN_MESSAGE_LABELS: Record<AdminMessageKind, string> = {
  first_contact: "Escribir para confirmar el pedido",
  confirmed: "Enviar total y forma de pago",
  paid: "Confirmar que el pago está recibido",
  shipped: "Avisar de que va en camino",
  cancelled: "Avisar de la cancelación",
  plain: "Abrir chat sin mensaje",
};

/** Línea de pedido, con los snapshots tal y como se guardaron. */
export interface AdminMessageLine {
  productName: string;
  colorName: string | null;
  sizeLabel: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AdminMessageOrder {
  orderNumber: string;
  customerName: string | null;
  currencyCode: string;
  locale: string;
  total: number;
  /**
   * Ausentes en el listado, presentes en el detalle. Cuando no hay líneas el
   * mensaje sale más corto: no se inventa un desglose que no se tiene.
   */
  lines?: readonly AdminMessageLine[];
}

/** "Camiseta Sendero · Negro · M" a partir del snapshot de la línea. */
function describeLine(line: AdminMessageLine): string {
  const parts = [line.productName];
  if (line.colorName) parts.push(line.colorName);
  if (line.sizeLabel) parts.push(line.sizeLabel);
  return parts.join(" · ");
}

/**
 * Saludo. Usa el nombre solo si el cliente lo dio: `customers.name` es
 * nullable y un "Hola null" es peor que un "Hola" a secas.
 */
function greeting(name: string | null): string {
  const clean = (name ?? "").trim();
  return clean.length > 0 ? `Hola ${clean} 👋` : "Hola 👋";
}

/**
 * Compone el mensaje.
 *
 * NOTA SOBRE EL COPY: el texto es deliberadamente FUNCIONAL —número de pedido,
 * artículos, importe y siguiente paso—, no comercial. No inventa promesas de
 * plazos, condiciones ni tono de marca: eso es copy comercial y lo escribe el
 * negocio (regla 9 de CLAUDE.md). Ajustar la voz consiste en cambiar las
 * cadenas de esta función, sin tocar nada más.
 */
export function buildAdminMessage(
  order: AdminMessageOrder,
  kind: AdminMessageKind,
): string {
  if (kind === "plain") return "";

  const money = (amount: number) =>
    formatPrice(amount, order.currencyCode, order.locale);

  const blocks: string[] = [greeting(order.customerName)];

  switch (kind) {
    case "first_contact":
      blocks.push(`Te escribimos por tu pedido ${order.orderNumber}.`);
      break;
    case "confirmed":
      blocks.push(`Tu pedido ${order.orderNumber} está confirmado.`);
      break;
    case "paid":
      blocks.push(
        `Hemos recibido el pago de tu pedido ${order.orderNumber}. Pasamos a prepararlo.`,
      );
      break;
    case "shipped":
      blocks.push(`Tu pedido ${order.orderNumber} ya está en camino.`);
      break;
    case "cancelled":
      // Enuncia el hecho y nada más: el motivo lo escribe el admin.
      blocks.push(`Tu pedido ${order.orderNumber} ha sido cancelado.`);
      break;
  }

  // El desglose solo aparece donde el cliente necesita verificar QUÉ pidió.
  // En un aviso de envío o de cancelación, repetir la lista es ruido.
  const wantsLines = kind === "first_contact" || kind === "confirmed";
  if (wantsLines && order.lines && order.lines.length > 0) {
    blocks.push(
      order.lines
        .map((line) => `• ${line.quantity}x ${describeLine(line)} — ${money(line.lineTotal)}`)
        .join("\n"),
    );
  }

  if (kind === "first_contact" || kind === "confirmed") {
    blocks.push(`Total: ${money(order.total)}`);
  }

  switch (kind) {
    case "first_contact":
      blocks.push("¿Nos confirmas que todo es correcto?");
      break;
    case "confirmed":
      blocks.push("Te indicamos cómo completar el pago.");
      break;
    case "paid":
      // Sin plazos ni promesas de entrega: el modelo no guarda esa información.
      blocks.push("Te avisamos por aquí en cuanto salga.");
      break;
    case "shipped":
      blocks.push("Cualquier cosa, escríbenos por aquí.");
      break;
    case "cancelled":
      blocks.push("Si quieres, te contamos qué ha pasado y buscamos una alternativa.");
      break;
  }

  return blocks.join("\n\n");
}
