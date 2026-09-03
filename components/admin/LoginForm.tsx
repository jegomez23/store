"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { loginAction, type LoginState } from "@/app/admin/(auth)/login/actions";

/**
 * Formulario de acceso al panel. Client Component porque necesita el estado
 * pendiente/error de la action; toda la lógica de autenticación vive en el
 * servidor. Aquí NO se importa ningún cliente de Supabase.
 */

const INITIAL_STATE: LoginState = { error: null };

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
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-6"
      noValidate
    >
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        {/* TODO(i18n) */}
        <label htmlFor="email" className="text-sm font-medium text-black">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-describedby={state.error ? "login-error" : undefined}
          className="h-12 rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {/* TODO(i18n) */}
        <label htmlFor="password" className="text-sm font-medium text-black">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={state.error ? "login-error" : undefined}
          className="h-12 rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11"
        />
      </div>

      {state.error ? (
        // Inline junto al formulario, nunca solo un toast (docs/rules/ui.md #15).
        <p id="login-error" role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
