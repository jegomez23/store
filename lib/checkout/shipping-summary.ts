import type { ShippingMethodOption } from "@/lib/checkout/shipping";

/**
 * Qué se le puede decir al cliente sobre el envío ANTES del checkout
 * (incremento 19) — LÓGICA PURA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AQUÍ NO SE INVENTA NI UN IMPORTE NI UNA PROMESA
 * ═══════════════════════════════════════════════════════════════════════════
 * Todo sale de `shipping_methods` del mercado activo, la MISMA tabla que
 * alimenta el checkout y que `create_order` vuelve a leer para cobrar
 * (DEC-063, DEC-064). Si el administrador cambia un precio, cambia aquí; si
 * borra los métodos, esto no dice nada en vez de mentir.
 *
 * Lo que NUNCA se hace:
 *   · prometer plazos de entrega — no hay ninguna columna que los guarde;
 *   · sumar el envío al precio del producto — el total lo calcula PostgreSQL;
 *   · afirmar "envío gratis" a secas — solo se dice el umbral, que es un dato.
 *
 * ⚠️ ES INFORMATIVO, NO AUTORIDAD. Lo que se cobra lo decide `create_order`
 * dentro de la transacción del pedido. Esto solo evita que el cliente descubra
 * el coste del envío al final.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export interface ShippingSummary {
  /** Precio del método de pago más barato que NO es gratis. `null` si no hay. */
  cheapestPaid: number | null;
  /** `true` si algún método cuesta 0: recogida, entrega en mano, etc. */
  hasFreeMethod: boolean;
  /** Nombre del método gratuito más barato, para poder nombrarlo. */
  freeMethodName: string | null;
  /** Umbral MÁS BAJO a partir del cual algún método sale gratis. */
  freeFrom: number | null;
  /** Cuántos métodos hay en total. `0` = no se puede decir nada. */
  count: number;
}

/**
 * Resume los métodos activos. Recibe exactamente lo que ya carga el checkout,
 * así que no hay una segunda consulta ni un segundo criterio.
 */
export function summarizeShipping(
  methods: readonly ShippingMethodOption[],
): ShippingSummary {
  const paid = methods.filter((method) => method.price > 0);
  const free = methods.filter((method) => method.price === 0);

  const thresholds = methods
    .map((method) => method.freeShippingThreshold)
    .filter((value): value is number => value !== null && value > 0);

  return {
    cheapestPaid:
      paid.length > 0 ? Math.min(...paid.map((method) => method.price)) : null,
    hasFreeMethod: free.length > 0,
    freeMethodName:
      free.length > 0
        ? [...free].sort((a, b) => a.name.localeCompare(b.name))[0].name
        : null,
    freeFrom: thresholds.length > 0 ? Math.min(...thresholds) : null,
    count: methods.length,
  };
}

/**
 * ¿Hay algo real que contar?
 *
 * Sin métodos activos no se dice nada: la tienda además está bloqueada para
 * vender (`resolveSaleBlockers`), y pintar «envío: —» sería ruido.
 */
export function hasShippingToShow(summary: ShippingSummary): boolean {
  return summary.count > 0 && (summary.cheapestPaid !== null || summary.hasFreeMethod);
}
