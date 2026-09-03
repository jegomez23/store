"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  parseRestockBatch,
  restockErrorMessage,
} from "@/lib/admin/inventory";
import { revalidateProducts } from "@/lib/admin/revalidate";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Reposición de stock desde el inventario (Fase 9.5, Incremento 4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ DELTA Y NO VALOR ABSOLUTO
 * ─────────────────────────────────────────────────────────────────────────
 * "Han llegado 12" es una suma. Se envía la suma, no el resultado, y la hace
 * PostgreSQL: `stock = stock + delta` dentro de la transacción de
 * `admin_restock_variants` (migración 0026). Dos reposiciones simultáneas
 * suman las dos.
 *
 * Escribir un valor absoluto calculado aquí reintroduciría la pérdida de
 * actualizaciones que este incremento vino a corregir — está medido: con stock
 * 12 y dos reposiciones de +10 y +7 a la vez, el resultado era 19.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ─────────────────────────────────────────────────────────────────────────
 * `requireAdmin()` aquí, `is_admin()` dentro de la función SQL y RLS debajo.
 * El `market_id` sale de `getActiveMarket()` —del servidor—, nunca del
 * formulario, y la función lo revalida contra cada variante con la fila
 * bloqueada. Un id de otro mercado hace fallar el lote entero.
 */

export interface RestockState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const GENERIC = "No se pudo reponer el stock. Inténtalo de nuevo.";

export async function restockVariantsAction(
  _prev: RestockState,
  formData: FormData,
): Promise<RestockState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  // El formulario manda un campo `delta:<variantId>` por fila visible. Solo se
  // envían las que el admin ha rellenado; las vacías se ignoran.
  const entries: { variantId: string; raw: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("delta:")) continue;
    if (typeof value !== "string") continue;
    entries.push({ variantId: key.slice("delta:".length), raw: value });
  }

  const parsed = parseRestockBatch(entries);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_restock_variants", {
    p_market_id: market.id,
    p_items: parsed.items.map((item) => ({
      variant_id: item.variantId,
      delta: item.delta,
    })),
  });

  if (error) {
    console.error("[admin] admin_restock_variants falló", {
      marketId: market.id,
      items: parsed.items.length,
      code: error.code,
      message: error.message,
    });
    return { error: restockErrorMessage(error.message, GENERIC), success: null };
  }

  const result = (data ?? {}) as { applied?: number; slugs?: string[] };

  // La función devuelve los slugs tocados para poder invalidar cada ficha por
  // RUTA LITERAL (DEC-037/DEC-041). Sin esto, la tienda mostraría la
  // disponibilidad vieja hasta 5 minutos.
  revalidateProducts(result.slugs ?? []);
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin");

  const applied = result.applied ?? 0;
  return {
    error: null,
    success: `Stock actualizado en ${applied} ${applied === 1 ? "variante" : "variantes"}.`,
  };
}
