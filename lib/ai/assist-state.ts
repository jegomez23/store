import type { AssistantResult } from "@/lib/ai/product-assistant";

/**
 * El estado que la pantalla de crear producto lee del asistente.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO NO VIVE EN `ai-actions.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 * Un archivo con `"use server"` **solo puede exportar funciones async**: cada
 * export se convierte en un endpoint. Exportar `ASSIST_IDLE` desde allí
 * reventaba el módulo en el servidor —«A "use server" file can only export
 * async functions, found object»— y, con el grafo roto, el formulario de crear
 * producto **no llegaba a enviarse**: ni error en pantalla, ni navegación, ni
 * producto. Medido sobre el build servido, no deducido.
 *
 * El valor inicial es un dato, no una acción. Vive aquí.
 */

export interface AssistState {
  status: "idle" | "ready" | "failed";
  result: AssistantResult | null;
  /** Mensaje ya traducido. El motivo técnico se queda en el log. */
  message: string | null;
}

export const ASSIST_IDLE: AssistState = { status: "idle", result: null, message: null };
