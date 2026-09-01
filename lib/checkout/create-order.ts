import { createClient } from "@/lib/supabase/static";
import { mapPostgresError, type CheckoutErrorCode } from "@/lib/checkout/errors";
import type { CheckoutInput, TrustedOrder } from "@/lib/checkout/types";

/**
 * Creación del pedido (Fase 6).
 *
 * Es una envoltura FINA sobre la función `create_order` de PostgreSQL: toda la
 * validación y la escritura ocurren allí, dentro de una única transacción
 * (DEC-026). Aquí no hay lógica de negocio que pueda divergir de la BD.
 *
 * NO conoce WhatsApp: devuelve un `TrustedOrder` neutro que cualquier
 * implementación de `CheckoutChannel` puede consumir (DEC-007).
 *
 * Usa el cliente anónimo. NO se usa la service role key: la función es
 * SECURITY DEFINER y `anon` tiene EXECUTE sobre ella, mientras `orders`,
 * `order_items`, `order_events` y `customers` siguen sin policies públicas.
 */

interface RawOrderItem {
  variant_id: string;
  product_name: string;
  color_name: string | null;
  size_label: string | null;
  sku: string | null;
  unit_price: number | string;
  quantity: number;
  line_total: number | string;
}

interface RawOrder {
  order_id: string;
  order_number: string;
  status: string;
  market_id: string;
  currency_code: string;
  subtotal: number | string;
  discount_total: number | string;
  shipping_total: number | string;
  total: number | string;
  items: RawOrderItem[];
  reused: boolean;
}

/**
 * `numeric` de PostgreSQL llega como string por PostgREST para no perder
 * precisión. Se convierte una sola vez, aquí, y nunca se recalcula en la UI.
 */
function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function isRawOrder(value: unknown): value is RawOrder {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.order_id === "string" &&
    typeof raw.order_number === "string" &&
    Array.isArray(raw.items)
  );
}

export type CreateOrderResult =
  | { ok: true; order: TrustedOrder }
  | { ok: false; error: CheckoutErrorCode };

export async function createOrder(
  marketId: string,
  input: CheckoutInput,
): Promise<CreateOrderResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("create_order", {
    p_market_id: marketId,
    // El cliente solo aporta identificador y cantidad. No se envía precio:
    // lo resuelve PostgreSQL desde product_variants.
    p_items: input.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
    })),
    p_customer_phone: input.customer.phone,
    p_customer_name: input.customer.name,
    p_client_request_id: input.clientRequestId,
    // Se omite en vez de mandar null: el DEFAULT de la función ya es null.
    p_source_url: input.sourceUrl,
  });

  if (error) {
    // Log con contexto pero sin datos personales (docs/rules/backend.md #16).
    console.error("[checkout] create_order falló", {
      marketId,
      clientRequestId: input.clientRequestId,
      lines: input.items.length,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: mapPostgresError(error) };
  }

  if (!isRawOrder(data)) {
    console.error("[checkout] create_order devolvió una forma inesperada", {
      marketId,
      clientRequestId: input.clientRequestId,
    });
    return { ok: false, error: "ORDER_CREATION_FAILED" };
  }

  return {
    ok: true,
    order: {
      orderId: data.order_id,
      orderNumber: data.order_number,
      status: data.status,
      marketId: data.market_id,
      currencyCode: data.currency_code,
      subtotal: toNumber(data.subtotal),
      discountTotal: toNumber(data.discount_total),
      shippingTotal: toNumber(data.shipping_total),
      total: toNumber(data.total),
      items: data.items.map((item) => ({
        variantId: item.variant_id,
        productName: item.product_name,
        colorName: item.color_name,
        sizeLabel: item.size_label,
        sku: item.sku,
        unitPrice: toNumber(item.unit_price),
        quantity: item.quantity,
        lineTotal: toNumber(item.line_total),
      })),
      reused: data.reused === true,
    },
  };
}
