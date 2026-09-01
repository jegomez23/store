"use server";

import { getCheckoutChannel } from "@/lib/checkout/channel";
import { checkoutErrorMessage } from "@/lib/checkout/errors";
import { validateCheckoutInput } from "@/lib/checkout/validation";
import type { CheckoutResult } from "@/lib/checkout/types";

/**
 * Server Action del checkout (Fase 6).
 *
 * POR QUÉ SERVER ACTION Y NO ROUTE HANDLER: `docs/rules/backend.md` #1 es
 * explícito — "toda mutación es una Server Action". Además no hace falta un
 * endpoint HTTP estable (no hay clientes externos ni webhooks) y el resultado
 * se consume desde React. Un Route Handler solo se justificaría para webhooks
 * de pasarela, que llegarán en Fase 11.
 *
 * SEGURIDAD — una Server Action es un endpoint público: cualquiera puede
 * hacerle POST sin pasar por la UI (docs de Next 16, "Security"). Por eso:
 *
 * 1. El argumento llega como `unknown` y se valida aquí; los tipos de
 *    TypeScript NO son validación.
 * 2. Esta validación es solo la primera barrera: `create_order` repite todas
 *    las comprobaciones dentro de PostgreSQL, que es la autoridad real.
 * 3. El cliente solo puede decir QUÉ variante y CUÁNTAS unidades. Precio,
 *    stock, nombre, color, talla y totales se resuelven en el servidor.
 * 4. El retorno se limita a lo que la UI necesita pintar; nunca filas crudas.
 */
export async function submitCheckoutAction(
  payload: unknown,
): Promise<CheckoutResult> {
  const validation = validateCheckoutInput(payload);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      message: checkoutErrorMessage(validation.error),
    };
  }

  try {
    // La UI nunca conoce el canal concreto (DEC-007).
    const { channel } = await getCheckoutChannel();
    return await channel.submitOrder(validation.input);
  } catch (error) {
    // Fallo inesperado (Supabase caído, configuración rota): mensaje genérico
    // al usuario y detalle solo en el log del servidor.
    console.error("[checkout] submitCheckoutAction falló", error);
    return {
      ok: false,
      error: "SERVER_ERROR",
      message: checkoutErrorMessage("SERVER_ERROR"),
    };
  }
}
