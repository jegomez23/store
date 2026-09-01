import { getSettings } from "@/lib/data/settings";
import { getActiveMarket } from "@/lib/markets";
import { createWhatsAppChannel } from "@/lib/whatsapp/channel";
import type { CheckoutChannel, CheckoutMarket } from "@/lib/checkout/types";

/**
 * Factory del canal de checkout (DEC-007).
 *
 * La UI llama SOLO a `getCheckoutChannel()`; tiene prohibido importar
 * `WhatsAppChannel` directamente (docs/rules/backend.md #13). Hoy devuelve el
 * canal de WhatsApp; cuando llegue el pago online bastará con decidir aquí qué
 * implementación se devuelve, sin tocar carrito, dominio ni componentes.
 *
 * El número de WhatsApp se lee de `settings` del mercado activo — nunca de una
 * constante ni de una variable de entorno.
 */
export async function getCheckoutChannel(): Promise<{
  channel: CheckoutChannel;
  market: CheckoutMarket;
}> {
  const activeMarket = await getActiveMarket();
  const market: CheckoutMarket = {
    id: activeMarket.id,
    currencyCode: activeMarket.currencyCode,
    locale: activeMarket.locale,
  };

  const settings = await getSettings(activeMarket);

  return {
    channel: createWhatsAppChannel(market, settings?.whatsappNumber ?? null),
    market,
  };
}
