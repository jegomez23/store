import { formatPrice } from "@/lib/money/format";
import {
  hasShippingToShow,
  type ShippingSummary,
} from "@/lib/checkout/shipping-summary";

/**
 * Lo que cuesta recibirlo, dicho ANTES del checkout (incremento 19).
 *
 * Server Component: no añade JavaScript al cliente. Todos los importes salen
 * de `shipping_methods` del mercado activo — la misma tabla que cobra
 * `create_order`—, así que no puede contradecir al checkout.
 *
 * Si el administrador no tiene métodos configurados, esto **no se pinta**: no
 * hay nada verdadero que decir, y un «envío: consultar» es peor que el
 * silencio.
 */
export function ShippingNote({
  summary,
  currencyCode,
  locale,
  className = "",
}: {
  summary: ShippingSummary;
  currencyCode: string;
  locale: string;
  className?: string;
}) {
  if (!hasShippingToShow(summary)) return null;

  const money = (amount: number) => formatPrice(amount, currencyCode, locale);

  const lineas: string[] = [];

  // TODO(i18n) en todo el componente.
  if (summary.cheapestPaid !== null) {
    lineas.push(`Envío desde ${money(summary.cheapestPaid)}`);
  }
  if (summary.freeFrom !== null) {
    lineas.push(`gratis a partir de ${money(summary.freeFrom)}`);
  }
  if (summary.hasFreeMethod && summary.freeMethodName) {
    lineas.push(`${summary.freeMethodName.toLowerCase()} sin coste`);
  }

  return (
    <p className={`text-sm text-gray-700 ${className}`}>
      {lineas.join(" · ")}.{" "}
      <span className="text-gray-400">Eliges el método al finalizar.</span>
    </p>
  );
}
