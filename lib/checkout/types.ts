/**
 * Contratos del checkout (Fase 6).
 *
 * DOS CONCEPTOS QUE NUNCA SE MEZCLAN:
 *
 * 1. `CheckoutInput` — lo que envía el CLIENTE. Es dato NO CONFIABLE. Solo
 *    contiene identificadores, cantidades y datos de contacto. Deliberadamente
 *    NO tiene precio, nombre de producto, stock ni totales: si no se reciben,
 *    no se pueden falsificar.
 *
 * 2. `TrustedOrder` — lo que devuelve el SERVIDOR tras resolver todo contra
 *    PostgreSQL. Es la única fuente válida para mostrar totales y construir el
 *    mensaje de WhatsApp.
 *
 * Este archivo solo contiene tipos: sus imports se borran al compilar, así que
 * los módulos puros que lo usan pueden ejecutarse bajo `node --test`.
 */

import type { CheckoutLineRef } from "../cart/types.ts";

/** Referencia mínima a una línea: lo único que el cliente puede decidir. */
export type { CheckoutLineRef };

/** Datos de contacto. Obligatorios: `orders.customer_id` es NOT NULL (DEC-030). */
export interface CheckoutCustomerInput {
  name: string;
  phone: string;
}

/** Payload no confiable que llega desde el navegador. */
export interface CheckoutInput {
  items: CheckoutLineRef[];
  customer: CheckoutCustomerInput;
  /**
   * UUID v4 generado por el cliente UNA VEZ por intento de checkout (no por
   * clic). Hace idempotente la creación frente a doble clic, recarga y varias
   * pestañas (DEC-028).
   */
  clientRequestId: string;
  /** URL desde la que se generó el pedido. Se recorta y guarda como referencia. */
  sourceUrl?: string;
}

/** Línea ya resuelta por el servidor. Todos estos valores vienen de la BD. */
export interface TrustedOrderLine {
  variantId: string;
  productName: string;
  colorName: string | null;
  sizeLabel: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** Pedido confiable: lo devuelve `create_order` tras validarlo todo. */
export interface TrustedOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  marketId: string;
  currencyCode: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  items: TrustedOrderLine[];
  /** true si esta llamada reutilizó un pedido ya existente (retry idempotente). */
  reused: boolean;
}

export interface CheckoutSuccess {
  ok: true;
  order: TrustedOrder;
  /** A dónde debe ir el usuario para cerrar la compra (wa.me en v1). */
  redirectUrl: string;
}

export interface CheckoutFailure {
  ok: false;
  error: import("./errors.ts").CheckoutErrorCode;
  /** Mensaje ya listo para mostrar. Nunca contiene detalles internos. */
  message: string;
}

export type CheckoutResult = CheckoutSuccess | CheckoutFailure;

/**
 * Abstracción del canal de cierre de venta (DEC-007).
 *
 * La UI solo conoce esta interfaz. Hoy la implementa `WhatsAppChannel`; mañana
 * un `OnlinePaymentChannel` (Stripe/Wompi) sin tocar carrito, dominio ni UI.
 */
export interface CheckoutChannel {
  submitOrder(input: CheckoutInput): Promise<CheckoutResult>;
}

/** Locale y moneda del mercado activo, para formatear el mensaje. */
export interface CheckoutMarket {
  id: string;
  currencyCode: string;
  locale: string;
}
