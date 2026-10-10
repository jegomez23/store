/**
 * Límites anti-abuso del checkout (Fase 10, DEC-088) — LÓGICA PURA.
 *
 * La AUTORIDAD es `create_order` (migración 0046): este número está escrito
 * también allí, y en el tope por línea del carrito (`lib/cart/reducer.ts`), que
 * no puede importar nada del checkout. `limits.test.ts` lee los tres sitios y
 * falla si divergen: si lo cambias, cámbialo en los tres.
 *
 * Los otros dos límites —pedidos por teléfono y por mercado— NO están aquí: son
 * columnas de `settings` que solo conoce PostgreSQL, y el navegador no tiene
 * forma honesta de preverlos.
 */

/** Unidades máximas en un pedido, sumando todas las líneas (decisión de Juan). */
export const MAX_UNITS_PER_ORDER = 10;

/** Unidades totales de una lista de líneas. */
export function totalUnits(items: readonly { quantity: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
