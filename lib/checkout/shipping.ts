/**
 * Coste del envío — LÓGICA PURA (incremento 8).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTA FUNCIÓN NO ES LA AUTORIDAD
 * ─────────────────────────────────────────────────────────────────────────
 * La autoridad es `create_order`, que recalcula el envío contra
 * `shipping_methods` dentro de la misma transacción que crea el pedido. Lo que
 * hay aquí sirve para UNA cosa: que el cliente vea el total ANTES de confirmar.
 * Si las dos discreparan, gana PostgreSQL y el pedido se registra con su
 * número, no con el que pintó el navegador.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SÍ, ESTÁ DUPLICADA. Y ES DELIBERADO, CON UN PRECIO
 * ─────────────────────────────────────────────────────────────────────────
 * La regla vive en dos sitios —aquí y en el `case` de la migración 0035—
 * porque el cliente necesita una previsión y no puede ir a la BD por cada
 * pulsación. Es duplicación real y se paga con un test de integración que
 * ejecuta LOS DOS caminos sobre los mismos casos y falla si difieren aunque
 * sea en un céntimo (`shipping.integration.test.ts`). Si algún día cambia la
 * regla, ese test obliga a cambiar los dos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ CONTRA EL SUBTOTAL Y NO CONTRA EL TOTAL
 * ─────────────────────────────────────────────────────────────────────────
 * El total incluye el envío. Comparar el umbral contra el total sería
 * circular: el envío dependería de un número que depende del envío. El
 * subtotal de productos es el único valor con una definición estable.
 *
 * No hay ni un precio, ni un umbral, ni un nombre de método escritos aquí:
 * todo llega como argumento desde la fila de `shipping_methods` del mercado.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

/** Lo que el cliente puede ver de un método. Refleja `shipping_methods`. */
export interface ShippingMethodOption {
  id: string;
  name: string;
  description: string | null;
  /** Precio base. `0` es un método gratuito, no "sin precio". */
  price: number;
  /** Subtotal a partir del cual el envío sale gratis. `null` = sin umbral. */
  freeShippingThreshold: number | null;
}

/**
 * Coste del envío para un subtotal dado.
 *
 * Espejo exacto del `case` de la migración 0035:
 *
 *     when free_shipping_threshold is not null
 *          and subtotal >= free_shipping_threshold then 0
 *     else price
 */
export function resolveShippingCost(
  method: Pick<ShippingMethodOption, "price" | "freeShippingThreshold">,
  subtotal: number,
): number {
  if (method.freeShippingThreshold !== null && subtotal >= method.freeShippingThreshold) {
    return 0;
  }
  return method.price;
}

/** `true` si este método sale gratis con este subtotal por haber umbral. */
export function isFreeByThreshold(
  method: Pick<ShippingMethodOption, "price" | "freeShippingThreshold">,
  subtotal: number,
): boolean {
  return (
    method.price > 0 &&
    method.freeShippingThreshold !== null &&
    subtotal >= method.freeShippingThreshold
  );
}

/**
 * Cuánto falta para que este método salga gratis, o `null` si no aplica.
 *
 * Sirve para decirle al cliente "te faltan 20 € para el envío gratis" con un
 * dato real, sin inventar ninguna campaña: si el método no tiene umbral, o ya
 * se alcanzó, no se dice nada.
 */
export function amountToFreeShipping(
  method: Pick<ShippingMethodOption, "price" | "freeShippingThreshold">,
  subtotal: number,
): number | null {
  if (method.price <= 0 || method.freeShippingThreshold === null) return null;
  const missing = method.freeShippingThreshold - subtotal;
  return missing > 0 ? missing : null;
}
