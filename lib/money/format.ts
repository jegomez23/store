/**
 * Formateo de dinero centralizado (docs/rules/architecture.md #15: prohibido
 * `toFixed`/concatenación sueltos). Envoltorio mínimo sobre `Intl.NumberFormat`.
 * Desde Fase 4 los llamantes reales pasan siempre moneda/locale resueltos por
 * `lib/markets.ts` (`getActiveMarket()`); los defaults (ES/EUR, DEC-014) son
 * solo una red de seguridad si algún caller los omite.
 */
export function formatPrice(
  amount: number,
  currencyCode: string = "EUR",
  locale: string = "es-ES",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}
