import { createOrder } from "@/lib/checkout/create-order";
import { checkoutErrorMessage } from "@/lib/checkout/errors";
import { buildOrderMessage } from "@/lib/whatsapp/message";
import { buildWhatsAppUrl } from "@/lib/whatsapp/phone";
import type {
  CheckoutChannel,
  CheckoutInput,
  CheckoutMarket,
  CheckoutResult,
} from "@/lib/checkout/types";

/**
 * `WhatsAppChannel` — implementación v1 de `CheckoutChannel` (DEC-007).
 *
 * Es la ÚNICA pieza del sistema que sabe que hoy se vende por WhatsApp. Su
 * responsabilidad se limita a: pedir el pedido al dominio, construir el
 * mensaje y devolver la URL. No valida, no calcula precios y no toca la BD —
 * eso vive en `create_order` (PostgreSQL) y `lib/checkout/`.
 *
 * Sustituirlo por `OnlinePaymentChannel` en Fase 11 no exige tocar el carrito,
 * el dominio del pedido ni la UI: solo cambiar lo que devuelve la factory.
 */
export function createWhatsAppChannel(
  market: CheckoutMarket,
  whatsappNumber: string | null,
): CheckoutChannel {
  return {
    async submitOrder(input: CheckoutInput): Promise<CheckoutResult> {
      // Se comprueba ANTES de crear el pedido: si no hay número configurado no
      // tiene sentido registrar un pedido que nadie podrá cerrar.
      const hasNumber = buildWhatsAppUrl(whatsappNumber, "test") !== null;
      if (!hasNumber) {
        console.error("[checkout] WhatsApp sin configurar para el mercado", {
          marketId: market.id,
        });
        return {
          ok: false,
          error: "CHECKOUT_NOT_CONFIGURED",
          message: checkoutErrorMessage("CHECKOUT_NOT_CONFIGURED"),
        };
      }

      const created = await createOrder(market.id, input);
      if (!created.ok) {
        return {
          ok: false,
          error: created.error,
          message: checkoutErrorMessage(created.error),
        };
      }

      // El mensaje se construye SIEMPRE desde el pedido confiable devuelto por
      // PostgreSQL, nunca desde el carrito del cliente.
      const message = buildOrderMessage(created.order, market);
      const redirectUrl = buildWhatsAppUrl(whatsappNumber, message);

      if (!redirectUrl) {
        // El pedido ya existe y es válido; solo falló construir el enlace.
        // Queda `pending` en el admin, que es el comportamiento correcto.
        return {
          ok: false,
          error: "CHECKOUT_NOT_CONFIGURED",
          message: checkoutErrorMessage("CHECKOUT_NOT_CONFIGURED"),
        };
      }

      return { ok: true, order: created.order, redirectUrl };
    },
  };
}
