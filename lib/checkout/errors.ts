/**
 * Errores de dominio del checkout (Fase 6).
 *
 * REGLA (docs/rules/security.md #10): el usuario nunca ve un error de Supabase
 * ni un mensaje técnico. La función `create_order` lanza estos códigos como
 * `RAISE EXCEPTION` con `errcode P0001`; aquí se traducen a copy comprensible.
 *
 * Módulo puro: sin I/O, testeable sin red ni BD.
 */

export const CHECKOUT_ERROR_CODES = [
  /** El carrito llegó vacío. */
  "EMPTY_CART",
  /** Estructura del payload inválida (uuid, cantidad, duplicados, tamaño). */
  "INVALID_INPUT",
  /** Teléfono con formato inaceptable. */
  "INVALID_CUSTOMER_PHONE",
  /** Nombre vacío o demasiado largo. */
  "INVALID_CUSTOMER_NAME",
  /** El mercado no existe o está inactivo. */
  "MARKET_UNAVAILABLE",
  /** La variante no existe (o fue borrada). */
  "VARIANT_NOT_FOUND",
  /** La variante existe pero está desactivada. */
  "VARIANT_INACTIVE",
  /** El producto no está publicado o está soft-deleted. */
  "PRODUCT_UNAVAILABLE",
  /** La variante pertenece a otro mercado. */
  "WRONG_MARKET",
  /** No hay stock suficiente en el momento de comprar. */
  "OUT_OF_STOCK",
  /** Misma clave de idempotencia con un payload distinto. */
  "IDEMPOTENCY_KEY_REUSED",
  /** El mercado no tiene número de WhatsApp configurado. */
  "CHECKOUT_NOT_CONFIGURED",
  /** Fallo al crear el pedido (BD caída, error inesperado). */
  "ORDER_CREATION_FAILED",
  /** Cualquier otra cosa. */
  "SERVER_ERROR",
] as const;

export type CheckoutErrorCode = (typeof CHECKOUT_ERROR_CODES)[number];

function isCheckoutErrorCode(value: string): value is CheckoutErrorCode {
  return (CHECKOUT_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Copy visible. TODO(i18n): mover a lib/i18n/messages.ts cuando exista (DEC-013).
 * Se evita el lenguaje técnico: el usuario solo necesita saber qué hacer ahora.
 */
const MESSAGES: Record<CheckoutErrorCode, string> = {
  EMPTY_CART: "Tu carrito está vacío.",
  INVALID_INPUT: "No hemos podido procesar tu pedido. Revisa el carrito e inténtalo de nuevo.",
  INVALID_CUSTOMER_PHONE: "Revisa tu número de teléfono.",
  INVALID_CUSTOMER_NAME: "Escribe tu nombre para continuar.",
  MARKET_UNAVAILABLE: "La tienda no está disponible en este momento.",
  VARIANT_NOT_FOUND: "Uno de los productos de tu carrito ya no está disponible.",
  VARIANT_INACTIVE: "Uno de los productos de tu carrito ya no está disponible.",
  PRODUCT_UNAVAILABLE: "Uno de los productos de tu carrito ya no está a la venta.",
  WRONG_MARKET: "Uno de los productos de tu carrito no está disponible en esta tienda.",
  OUT_OF_STOCK: "Se ha agotado alguno de los productos. Ajusta las cantidades y vuelve a intentarlo.",
  IDEMPOTENCY_KEY_REUSED: "Este pedido ya se había enviado. Vuelve al carrito y empieza de nuevo.",
  CHECKOUT_NOT_CONFIGURED: "La compra por WhatsApp no está disponible ahora mismo.",
  ORDER_CREATION_FAILED: "No hemos podido registrar tu pedido. Inténtalo de nuevo en unos segundos.",
  SERVER_ERROR: "Algo ha ido mal. Inténtalo de nuevo en unos segundos.",
};

export function checkoutErrorMessage(code: CheckoutErrorCode): string {
  return MESSAGES[code];
}

/**
 * Traduce el error crudo de PostgREST a un código de dominio.
 *
 * `create_order` señala los errores con `RAISE EXCEPTION 'CODIGO'`, así que el
 * código viaja en `message`. Cualquier cosa que no reconozcamos se degrada a
 * `SERVER_ERROR`: preferimos un mensaje genérico antes que filtrar detalles
 * internos de la base de datos.
 */
export function mapPostgresError(error: {
  message?: string | null;
  code?: string | null;
}): CheckoutErrorCode {
  const raw = (error.message ?? "").trim();
  if (isCheckoutErrorCode(raw)) return raw;
  return "SERVER_ERROR";
}
