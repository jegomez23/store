"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/admin/orders";
import {
  updateOrderStatusAction,
  type UpdateOrderStatusState,
} from "@/app/admin/(panel)/pedidos/actions";

/**
 * Avance del pedido al siguiente estado seguro, desde la fila del listado o la
 * cola (Fase 9.5, Incremento 3).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO DUPLICA NADA
 * ─────────────────────────────────────────────────────────────────────────
 * Llama a la MISMA Server Action que el formulario del detalle
 * (`updateOrderStatusAction`), que a su vez llama a la MISMA función SQL
 * (`admin_update_order_status`). Aquí no hay ni una comprobación de permisos ni
 * una regla de transición: el destino que se pinta lo decide `quickNextStatus`
 * —pura presentación— y la autoridad sigue siendo PostgreSQL, que revalida todo
 * con la fila del pedido bloqueada.
 *
 * Qué destinos se ofrecen y por qué esos: ver `quickNextStatus` en
 * `lib/admin/orders.ts`. En resumen: nunca `paid` (exige confirmar el pago) ni
 * un estado terminal (irreversible, y `cancelled` devuelve stock).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONCURRENCIA Y DOBLE ENVÍO
 * ─────────────────────────────────────────────────────────────────────────
 * `disabled` mientras se envía es una comodidad, NO una protección: un doble
 * clic rápido, un refresco con reenvío o un POST directo se saltan la UI. Lo
 * que realmente protege es que la función SQL bloquea la fila y valida la
 * transición contra el estado REAL: el segundo intento encuentra el pedido ya
 * movido y lo rechaza con `TRANSITION_NOT_ALLOWED`. El pedido no puede avanzar
 * dos pasos por un doble clic.
 *
 * Por eso el error se muestra tal cual: si aparece "recarga la página", es que
 * el pedido ya cambió —quizá desde otra pestaña— y el admin necesita saberlo.
 */

const INITIAL: UpdateOrderStatusState = { error: null, success: null };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 whitespace-nowrap rounded-full border border-line bg-white px-3 text-xs font-medium text-black transition-colors duration-200 ease-out hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* TODO(i18n) */}
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function QuickAdvanceButton({
  orderId,
  orderNumber,
  next,
}: {
  orderId: string;
  orderNumber: string;
  next: OrderStatus;
}) {
  const [state, formAction] = useActionState(updateOrderStatusAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <input type="hidden" name="toStatus" value={next} />
      <Submit label={`→ ${ORDER_STATUS_LABELS[next]}`} />
      {state.error ? (
        <p role="alert" className="max-w-[16rem] text-right text-xs text-red">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
