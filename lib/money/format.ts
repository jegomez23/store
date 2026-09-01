/**
 * Formateo de dinero centralizado (docs/rules/architecture.md #15: prohibido
 * `toFixed`/concatenación sueltos). Envoltorio mínimo sobre `Intl.NumberFormat`.
 * Desde Fase 4 los llamantes reales pasan siempre moneda/locale resueltos por
 * `lib/markets.ts` (`getActiveMarket()`); los defaults (ES/EUR, DEC-014) son
 * solo una red de seguridad si algún caller los omite.
 */

/**
 * Monedas que por convención se muestran SIN decimales. El peso colombiano se
 * escribe `$ 89.900`, no `$ 89.900,00` — pero `Intl` sí devuelve los dos
 * decimales para COP, así que hay que forzarlo.
 *
 * Fase 4.5: antes se aplicaba `maximumFractionDigits: 0` a TODAS las monedas,
 * lo que redondeaba los precios en euros del catálogo real (89,90 € se
 * mostraba como «90 €», 34,90 € como «35 €»). Detectado al validar la ficha de
 * producto contra datos reales. El redondeo por moneda evita reintroducirlo al
 * activar Colombia (DEC-008/DEC-014).
 */
const ZERO_DECIMAL_DISPLAY_CURRENCIES = new Set(["COP", "CLP", "JPY", "KRW"]);

export function formatPrice(
  amount: number,
  currencyCode: string = "EUR",
  locale: string = "es-ES",
): string {
  const zeroDecimal = ZERO_DECIMAL_DISPLAY_CURRENCIES.has(
    currencyCode.toUpperCase(),
  );

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    ...(zeroDecimal
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : {}),
  }).format(amount);
}
