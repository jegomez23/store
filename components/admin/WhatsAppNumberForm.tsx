"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import {
  updateWhatsAppNumberAction,
  type SettingsActionState,
} from "@/app/admin/(panel)/ajustes/actions";

const INITIAL: SettingsActionState = { error: null, success: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {/* TODO(i18n) */}
      {pending ? "Guardando…" : "Guardar número"}
    </Button>
  );
}

export function WhatsAppNumberForm({ current }: { current: string }) {
  const [state, formAction] = useActionState(
    updateWhatsAppNumberAction,
    INITIAL,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-line bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        {/* TODO(i18n) */}
        <label htmlFor="whatsappNumber" className="text-sm font-medium text-black">
          Número de WhatsApp
        </label>
        <input
          id="whatsappNumber"
          name="whatsappNumber"
          type="tel"
          inputMode="tel"
          defaultValue={current}
          required
          aria-describedby="whatsapp-help"
          className="h-12 max-w-xs rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11 md:text-sm"
        />
        <p id="whatsapp-help" className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Con prefijo de país y sin «+». Es el número al que llegan los pedidos
          del checkout: cambiarlo tiene efecto sin necesidad de desplegar.
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

      <Submit />
    </form>
  );
}
