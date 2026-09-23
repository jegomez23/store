"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  parseExhaustIntent,
  parseStockBatch,
  stockErrorMessage,
  type StockFormEntry,
} from "@/lib/admin/stock";
import { revalidateProducts } from "@/lib/admin/revalidate";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Edición de stock desde el inventario (Incremento 12).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNA SOLA ACTION PARA LAS DOS OPERACIONES
 * ─────────────────────────────────────────────────────────────────────────
 * "Guardar cambios" y "Agotar" comparten formulario y se distinguen por el
 * `intent` del BOTÓN que se pulsó. No es un truco: es cómo funciona HTML —el
 * navegador envía el `name`/`value` del botón que activó el envío—, así que
 * los dos caminos funcionan **sin JavaScript**, que es como se ejercitan los
 * E2E de este proyecto. Dos `formAction` distintos habrían necesitado dos
 * estados y una regla para decidir cuál de los dos mensajes se pinta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ABSOLUTO CON TESTIGO, NO DELTA
 * ─────────────────────────────────────────────────────────────────────────
 * El navegador manda el valor FINAL de cada variante junto al `updated_at` que
 * tenía cuando se pintó. Si otra persona —u otra pestaña— guardó mientras
 * tanto, `admin_set_variant_stock` lanza `STOCK_CHANGED` y **no aplica nada**:
 * ni esa variante ni las demás del lote. Es la petición explícita del
 * incremento: un guardado a medias parece correcto y no lo es.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ─────────────────────────────────────────────────────────────────────────
 * `requireAdmin()` aquí, `is_admin()` dentro de la función SQL y RLS debajo
 * (que además exige mercado ACTIVO desde la 0020). El `market_id` sale de
 * `getActiveMarket()` —del servidor—, nunca del formulario, y la función lo
 * revalida contra cada variante con la fila bloqueada.
 */

export interface StockState {
  error: string | null;
  success: string | null;
  /** Para que la UI pueda pedir una recarga sin adivinar el motivo. */
  conflict: boolean;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const GENERIC = "No se pudo guardar el stock. Inténtalo de nuevo.";

interface RpcResult {
  applied?: number;
  unchanged?: number;
  slugs?: string[];
}

/** Invalidación por RUTA LITERAL de las fichas tocadas (DEC-037/DEC-041). */
function revalidateAfterStock(slugs: string[]): void {
  revalidateProducts(slugs);
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin");
}

export async function saveStockAction(
  _prev: StockState,
  formData: FormData,
): Promise<StockState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null, conflict: false };

  const intent = formData.get("intent");
  const exhaustId = typeof intent === "string" ? parseExhaustIntent(intent) : null;

  const market = await getActiveMarket();
  const supabase = await createClient();

  // ── Agotar: una variante, valor cero, idempotente.
  if (exhaustId) {
    const { data, error } = await supabase.rpc("admin_set_variant_stock", {
      p_market_id: market.id,
      p_items: [{ variant_id: exhaustId, mode: "exhaust" }],
    });

    if (error) {
      console.error("[admin] agotar variante falló", {
        marketId: market.id,
        code: error.code,
        message: error.message,
      });
      return {
        error: stockErrorMessage(error.message, GENERIC),
        success: null,
        conflict: error.message?.includes("STOCK_CHANGED") === true,
      };
    }

    const result = (data ?? {}) as RpcResult;
    revalidateAfterStock(result.slugs ?? []);

    return {
      error: null,
      // Volver a pulsar Agotar sobre algo que ya está a 0 no es un error: se
      // dice lo que pasó y punto.
      success: (result.applied ?? 0) > 0 ? "Variante agotada." : "Esa variante ya estaba agotada.",
      conflict: false,
    };
  }

  // ── Guardar: los valores escritos, en lote y todo o nada.
  const entries: StockFormEntry[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("stock:")) continue;
    if (typeof value !== "string") continue;
    const variantId = key.slice("stock:".length);
    const witness = formData.get(`ts:${variantId}`);
    entries.push({
      variantId,
      raw: value,
      expectedUpdatedAt: typeof witness === "string" ? witness : "",
    });
  }

  const parsed = parseStockBatch(entries);
  if (!parsed.ok) return { error: parsed.error, success: null, conflict: false };

  const { data, error } = await supabase.rpc("admin_set_variant_stock", {
    p_market_id: market.id,
    p_items: parsed.items.map((item) => ({
      variant_id: item.variantId,
      mode: "set",
      stock: item.stock,
      expected_updated_at: item.expectedUpdatedAt,
    })),
  });

  if (error) {
    console.error("[admin] admin_set_variant_stock falló", {
      marketId: market.id,
      items: parsed.items.length,
      code: error.code,
      message: error.message,
    });
    return {
      error: stockErrorMessage(error.message, GENERIC),
      success: null,
      conflict: error.message?.includes("STOCK_CHANGED") === true,
    };
  }

  const result = (data ?? {}) as RpcResult;
  const applied = result.applied ?? 0;
  revalidateAfterStock(result.slugs ?? []);

  if (applied === 0) {
    return { error: null, success: "No había nada que cambiar.", conflict: false };
  }
  return {
    error: null,
    success: `Stock guardado en ${applied} ${applied === 1 ? "variante" : "variantes"}.`,
    conflict: false,
  };
}
