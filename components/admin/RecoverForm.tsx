"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  requestPasswordResetAction,
  type RecoverState,
} from "@/app/admin/(auth)/recuperar/actions";

/**
 * Pedir el email de recuperación (incremento 18).
 *
 * El éxito NO dice si la cuenta existe: es el mismo mensaje siempre. Aquí no
 * hay nada que decidir — la action ya devuelve `sent: true` en todos los
 * caminos—, este componente solo lo pinta.
 */

const INITIAL: RecoverState = { sent: false, error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={pending}
      aria-disabled={pending}
    >
      {/* TODO(i18n) */}
      {pending ? "Enviando…" : "Enviar enlace de recuperación"}
    </Button>
  );
}

export function RecoverForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, INITIAL);

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-line bg-white p-6">
        {/* TODO(i18n) */}
        <h2 className="text-sm font-medium text-black">Revisa tu correo</h2>
        <p className="text-sm text-gray-700">
          Si ese email corresponde a una cuenta del panel, te hemos enviado un
          enlace para crear una contraseña nueva. Caduca pronto y solo se puede
          usar una vez.
        </p>
        <p className="text-sm text-gray-700">
          ¿No te llega? Revisa la carpeta de spam antes de volver a pedirlo.
        </p>
        <Link
          href="/admin/login"
          className="inline-flex min-h-11 items-center text-sm font-medium text-black underline underline-offset-4"
        >
          {/* TODO(i18n) */}
          ← Volver al acceso
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-6"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        {/* TODO(i18n) */}
        <label htmlFor="email" className="text-sm font-medium text-black">
          Email de la cuenta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          required
          aria-describedby={state.error ? "recover-error" : undefined}
          className="h-12 rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black"
        />
      </div>

      {state.error ? (
        <p id="recover-error" role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />

      <Link
        href="/admin/login"
        className="inline-flex min-h-11 items-center justify-center text-sm text-gray-700 underline underline-offset-4"
      >
        {/* TODO(i18n) */}
        ← Volver al acceso
      </Link>
    </form>
  );
}
