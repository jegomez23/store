"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import {
  ORDER_STATUS_LABELS,
  requiresPaymentConfirmation,
  restoresStock,
  type OrderStatus,
} from "@/lib/admin/orders";
import {
  updateOrderStatusAction,
  type UpdateOrderStatusState,
} from "@/app/admin/(panel)/pedidos/actions";

/**
 * Cambio de estado del pedido.
 *
 * Este componente decide qué BOTONES se pintan, no qué transiciones son
 * legales: la autoridad es `admin_update_order_status` en PostgreSQL, que
 * revalida todo con la fila del pedido bloqueada (DEC-032). Ocultar un botón
 * aquí no protege nada, y no pretende hacerlo.
 *
 * `paid` exige marcar explícitamente "He recibido el pago": el checkbox no es
 * decorativo, la función SQL rechaza la transición sin ese flag.
 */

const INITIAL: UpdateOrderStatusState = { error: null, success: null };

function SubmitButton({ label, danger }: { label: string; danger: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={danger ? "secondary" : "primary"}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function OrderStatusForm({
  orderId,
  orderNumber,
  currentStatus,
  nextStatuses,
}: {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  nextStatuses: readonly OrderStatus[];
}) {
  const [state, formAction] = useActionState(updateOrderStatusAction, INITIAL);
  const [selected, setSelected] = useState<OrderStatus | null>(null);

  if (nextStatuses.length === 0) {
    return (
      <p className="rounded-md border border-line bg-cream px-4 py-3 text-sm text-gray-700">
        {/* TODO(i18n) */}
        Este pedido está en un estado final (
        {ORDER_STATUS_LABELS[currentStatus]}). No admite más cambios.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => {
          const active = selected === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(active ? null : status)}
              className={`flex h-11 items-center rounded-full px-4 text-sm font-medium transition-colors duration-200 ease-out ${
                active
                  ? "bg-black text-white"
                  : "border border-line bg-white text-black hover:border-black"
              }`}
            >
              {/* TODO(i18n) */}
              {status === "cancelled" ? "Cancelar pedido" : `Marcar como ${ORDER_STATUS_LABELS[status].toLowerCase()}`}
            </button>
          );
        })}
      </div>

      {selected ? (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-md border border-line bg-white p-4"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <input type="hidden" name="toStatus" value={selected} />

          <p className="text-sm text-black">
            {/* TODO(i18n) */}
            {ORDER_STATUS_LABELS[currentStatus]} →{" "}
            <strong>{ORDER_STATUS_LABELS[selected]}</strong>
          </p>

          {restoresStock(selected) ? (
            <p className="rounded-md bg-cream px-3 py-2 text-sm text-gray-700">
              {/* TODO(i18n) */}
              Al cancelar se devolverán al stock las unidades de este pedido.
              Es irreversible: un pedido cancelado no se puede reabrir.
            </p>
          ) : null}

          {requiresPaymentConfirmation(selected) ? (
            <label className="flex items-start gap-2.5 text-sm text-black">
              <input
                type="checkbox"
                name="paymentConfirmed"
                required
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-red)]"
              />
              {/* TODO(i18n) */}
              <span>
                He recibido el pago de este pedido. Marcar como pagado nunca es
                automático.
              </span>
            </label>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="note" className="text-sm font-medium text-black">
              {/* TODO(i18n) */}
              Nota (opcional)
            </label>
            <textarea
              id="note"
              name="note"
              rows={2}
              maxLength={500}
              className="rounded-md border border-line bg-cream px-3 py-2 text-base text-black outline-none focus-visible:border-black md:text-sm"
            />
            <p className="text-xs text-gray-400">
              {/* TODO(i18n) */}
              Se guarda en el historial del pedido y no se puede editar ni
              borrar después.
            </p>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-red">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p role="status" className="text-sm text-gray-700">
              {state.success}
            </p>
          ) : null}

          <div className="flex gap-2">
            <SubmitButton
              label="Confirmar cambio"
              danger={restoresStock(selected)}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              {/* TODO(i18n) */}
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {!selected && state.error ? (
        <p role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}
      {!selected && state.success ? (
        <p role="status" className="text-sm text-gray-700">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
