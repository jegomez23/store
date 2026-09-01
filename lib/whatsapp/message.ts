// Import relativo CON extensión: es la convención para módulos de `lib/` que
// deben poder ejecutarse bajo `node --test` sin bundler (AI-DEVELOPMENT §8.2).
import { formatPrice } from "../money/format.ts";
import type { CheckoutMarket, TrustedOrder } from "../checkout/types.ts";

/**
 * Construcción del mensaje de WhatsApp (Fase 6) — FUNCIÓN PURA.
 *
 * Sigue las plantillas de `docs/06-WHATSAPP.md` §2. Nunca se construye el
 * mensaje dentro de un componente React (docs/rules/backend.md #14).
 *
 * IMPORTANTE: recibe un `TrustedOrder`, es decir, datos ya resueltos por
 * PostgreSQL. Nunca recibe el carrito del cliente: si el usuario manipuló el
 * precio en localStorage, el mensaje sigue diciendo el precio real.
 *
 * El formato monetario va SIEMPRE por `lib/money/format.ts`, que aplica el
 * locale y la moneda del mercado (es-ES → `89,90 €`; es-CO → `$ 89.900`).
 */

/** "Negro · M" → aquí "Color: …" / "Talla: …" según la plantilla documentada. */
function variantLines(item: TrustedOrder["items"][number]): string[] {
  const lines: string[] = [];
  if (item.colorName) lines.push(`Color: ${item.colorName}`);
  if (item.sizeLabel) lines.push(`Talla: ${item.sizeLabel}`);
  return lines;
}

export function buildOrderMessage(
  order: TrustedOrder,
  market: CheckoutMarket,
): string {
  const money = (amount: number) =>
    formatPrice(amount, market.currencyCode, market.locale);

  const blocks: string[] = [];

  // TODO(i18n): mover el copy a lib/i18n/messages.ts cuando exista (DEC-013).
  blocks.push("Hola 👋\nQuiero realizar el siguiente pedido:");

  for (const item of order.items) {
    const lines = [`${item.quantity}x ${item.productName}`, ...variantLines(item)];
    lines.push(`Precio: ${money(item.unitPrice)}`);
    // Solo se repite el total de línea cuando aporta información nueva
    // (más de una unidad); si no, sería ruido.
    if (item.quantity > 1) {
      lines.push(`Subtotal: ${money(item.lineTotal)}`);
    }
    blocks.push(lines.join("\n"));
  }

  const totals: string[] = [];
  // Fase 6 no aplica promociones ni envío (ver create_order §9): estas líneas
  // solo aparecerán cuando esos importes existan de verdad, no como "0 €".
  if (order.discountTotal > 0) {
    totals.push(`Descuento: -${money(order.discountTotal)}`);
  }
  if (order.shippingTotal > 0) {
    totals.push(`Envío: ${money(order.shippingTotal)}`);
  }
  totals.push(`Total: ${money(order.total)}`);
  blocks.push(totals.join("\n"));

  // Referencia cruzada para que el negocio localice el pedido en el admin
  // (docs/06-WHATSAPP.md §2 "Reglas de generación").
  blocks.push(`Pedido: ${order.orderNumber}`);

  return blocks.join("\n\n");
}
