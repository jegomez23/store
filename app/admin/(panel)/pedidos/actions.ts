"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  isOrderStatus,
  normalizeOrderQuery,
  restoresStock,
  type OrderStatus,
} from "@/lib/admin/orders";
import { parseNoteBody } from "@/lib/admin/timeline";
import { revalidateProducts } from "@/lib/admin/revalidate";
import { addOrderNote } from "@/lib/data/admin/orders";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Cambio de estado de un pedido (Fase 7, DEC-032/DEC-033).
 *
 * SEGURIDAD — una Server Action es un endpoint POST público: cualquiera puede
 * invocarla sin pasar por la UI, y los docs de Next 16 avisan de que un cambio
 * de `matcher` puede además sacarla de la cobertura de `proxy.ts` sin que nada
 * falle a la vista. Por eso:
 *
 * 1. `requireAdmin()` SIEMPRE, aunque el layout ya haya comprobado el rol.
 * 2. El payload llega como `FormData` sin tipar y se valida aquí entero.
 * 3. Esta validación es solo la primera barrera: `admin_update_order_status`
 *    repite TODO dentro de PostgreSQL —con la fila del pedido bloqueada— y RLS
 *    filtra debajo. El cliente no puede proponer un estado arbitrario ni saltar
 *    un paso de la máquina de estados.
 * 4. El cliente NO envía precios, totales, stock ni el estado actual: la
 *    función SQL los lee del pedido real.
 */

export interface UpdateOrderStatusState {
  error: string | null;
  success: string | null;
}

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "No tienes permisos para hacer esto.",
  ORDER_NOT_FOUND: "El pedido no existe.",
  INVALID_STATUS: "Ese estado no existe.",
  INVALID_INPUT: "Los datos enviados no son válidos.",
  TRANSITION_NOT_ALLOWED:
    "Ese cambio de estado no está permitido desde el estado actual. Recarga la página: puede que el pedido ya haya cambiado.",
  PAYMENT_NOT_CONFIRMED:
    "Para marcar el pedido como pagado debes confirmar que has recibido el pago.",
};
const GENERIC = "No se pudo actualizar el pedido. Inténtalo de nuevo.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Slugs de los productos afectados por las líneas de un pedido, para poder
 * invalidar SUS fichas por ruta literal.
 *
 * `order_items.variant_id` es `ON DELETE SET NULL`: una línea cuya variante ya
 * no existe se salta —igual que hace `admin_update_order_status` al devolver
 * stock (DEC-033)—, no se inventa un slug. Si la consulta falla no se rompe la
 * acción: el pedido YA cambió de estado en PostgreSQL, y un fallo de
 * invalidación solo significa esperar al ISR de 5 min.
 */
async function affectedProductSlugs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("product_variants(products(slug))")
    .eq("order_id", orderId);

  if (error) {
    console.error("[admin] no se pudieron resolver los slugs del pedido", {
      orderId,
      code: error.code,
    });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const slug = row.product_variants?.products?.slug;
    return slug ? [slug] : [];
  });
}

export async function updateOrderStatusAction(
  _prevState: UpdateOrderStatusState,
  formData: FormData,
): Promise<UpdateOrderStatusState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { error: MESSAGES.FORBIDDEN, success: null };
  }

  const orderId = readString(formData, "orderId");
  const orderNumber = readString(formData, "orderNumber");
  const toStatus = readString(formData, "toStatus");
  const note = readString(formData, "note").trim();
  // Un checkbox no marcado sencillamente no viaja en el FormData.
  const paymentConfirmed = formData.get("paymentConfirmed") === "on";

  if (!UUID.test(orderId)) {
    return { error: MESSAGES.INVALID_INPUT, success: null };
  }
  if (!isOrderStatus(toStatus)) {
    return { error: MESSAGES.INVALID_STATUS, success: null };
  }
  if (note.length > 500) {
    return { error: "La nota no puede superar los 500 caracteres.", success: null };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_update_order_status", {
    p_order_id: orderId,
    p_to_status: toStatus,
    p_note: note.length > 0 ? note : undefined,
    p_payment_confirmed: paymentConfirmed,
  });

  if (error) {
    // Sin datos personales en el log (docs/rules/backend.md #16).
    console.error("[admin] admin_update_order_status falló", {
      orderId,
      toStatus,
      code: error.code,
      message: error.message,
    });
    return {
      error: MESSAGES[error.message] ?? GENERIC,
      success: null,
    };
  }

  // El panel es `force-dynamic`, así que no necesita invalidarse. La tienda sí:
  // cancelar devuelve stock (DEC-033) y las fichas de producto son SSG con ISR
  // de 5 min, así que sin esto mostrarían disponibilidad desactualizada.
  //
  // CORRECCIÓN DE FASE 9: aquí se invalidaba con el PATRÓN
  // `revalidatePath("/producto/[slug]", "page")`, la misma forma que Fase 8
  // midió que NO invalida las fichas prerenderizadas (DEC-037). Es decir: el
  // stock volvía a la BD y la ficha seguía mostrando el anterior hasta 5
  // minutos. Ahora se resuelven los slugs REALES de las líneas del pedido y se
  // invalida cada ficha por ruta literal.
  if (restoresStock(toStatus as OrderStatus)) {
    revalidateProducts(await affectedProductSlugs(supabase, orderId));
  }

  if (orderNumber) {
    revalidatePath(`/admin/pedidos/${orderNumber}`);
  }

  return { error: null, success: "Pedido actualizado." };
}

// ──────────────────────────────────── Notas internas (Fase 9.5, 5A)

export interface AddOrderNoteState {
  error: string | null;
  success: string | null;
}

/**
 * Añade una nota interna al pedido.
 *
 * MISMO CONTRATO DE SEGURIDAD que la action de arriba, y conviene ser explícito
 * sobre lo que esta acción NO puede hacer, porque es justo lo que la separa de
 * `order_events`:
 *
 *   · No cambia el estado del pedido. No hay ni un `status` en el payload.
 *   · No toca stock. La tabla `order_notes` no tiene relación con las variantes.
 *   · No firma la nota: el `actor_id` lo pone `auth.uid()` en la base.
 *   · No acepta un id de pedido — solo el número, que se resuelve contra el
 *     mercado activo del servidor.
 *
 * El pedido se identifica por NÚMERO y no por UUID a propósito: el número ya
 * está en la URL, y resolverlo obliga a pasar por el filtro de mercado.
 */
export async function addOrderNoteAction(
  _prev: AddOrderNoteState,
  formData: FormData,
): Promise<AddOrderNoteState> {
  if (!(await requireAdmin())) {
    return { error: MESSAGES.FORBIDDEN, success: null };
  }

  const orderNumber = normalizeOrderQuery(readString(formData, "orderNumber"));
  if (!orderNumber) {
    return { error: MESSAGES.INVALID_INPUT, success: null };
  }

  const parsed = parseNoteBody(formData.get("body"));
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();

  let saved: boolean;
  try {
    saved = await addOrderNote(market, orderNumber, parsed.body);
  } catch (error) {
    // Sin el cuerpo de la nota en el log: puede llevar la dirección del cliente
    // (docs/rules/backend.md #16).
    console.error("[admin] addOrderNote falló", {
      orderNumber,
      message: error instanceof Error ? error.message : "desconocido",
    });
    return { error: GENERIC, success: null };
  }

  if (!saved) return { error: MESSAGES.ORDER_NOT_FOUND, success: null };

  // El panel es `force-dynamic`; esto solo fuerza que la página que hizo el
  // POST vuelva a renderizarse con la nota ya dentro.
  revalidatePath(`/admin/pedidos/${orderNumber}`);

  return { error: null, success: "Nota guardada." };
}
