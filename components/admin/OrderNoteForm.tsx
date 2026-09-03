"use client";

import { useActionState, useRef, useEffect } from "react";
import { Feedback, SubmitButton, TextArea } from "@/components/admin/FormBits";
import { MAX_NOTE_LENGTH } from "@/lib/admin/timeline";
import {
  addOrderNoteAction,
  type AddOrderNoteState,
} from "@/app/admin/(panel)/pedidos/actions";

/**
 * Caja de nota interna del pedido (Fase 9.5, Incremento 5A).
 *
 * Aquí acaba lo que se acordó por WhatsApp y no cabe en ningún campo: la
 * dirección tal y como la mandó el cliente, el horario de entrega, el motivo
 * real de una cancelación.
 *
 * Solo viajan dos campos: el número de pedido —que la action vuelve a resolver
 * contra el mercado activo— y el texto. El autor y la fecha los pone
 * PostgreSQL, así que este componente no puede falsear ninguno de los dos.
 *
 * `useActionState` mantiene el formulario utilizable sin JavaScript: sin él es
 * un POST normal que recarga la página con la nota ya guardada.
 */

const INITIAL: AddOrderNoteState = { error: null, success: null };

export function OrderNoteForm({ orderNumber }: { orderNumber: string }) {
  const [state, formAction] = useActionState(addOrderNoteAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // Vaciar la caja SOLO cuando la nota se guardó de verdad. Si falla, el texto
  // se queda donde estaba: perder lo que alguien acaba de escribir por un error
  // de red es la peor forma de fallar que tiene un formulario.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <label htmlFor="body" className="sr-only">
        {/* TODO(i18n) */}
        Nota interna
      </label>
      <TextArea name="body" rows={3} maxLength={MAX_NOTE_LENGTH} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Solo la ve el equipo. No se envía al cliente ni cambia el estado del
          pedido.
        </p>
        <SubmitButton label="Guardar nota" variant="secondary" />
      </div>
      <Feedback state={state} />
    </form>
  );
}
