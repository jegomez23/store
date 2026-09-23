"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PASSWORD_MIN_LENGTH } from "@/lib/admin/password";
import {
  setNewPasswordAction,
  type ResetPasswordState,
} from "@/app/admin/(auth)/reset-password/actions";
import { adoptRecoverySessionAction } from "@/app/admin/(auth)/reset-password/adopt";

const INITIAL: ResetPasswordState = { error: null };

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
      {pending ? "Guardando…" : "Guardar contraseña"}
    </Button>
  );
}

/** Enlace de vuelta, con 44 px de alto: se usa desde un móvil. */
function BackToLogin({ label = "← Volver al acceso" }: { label?: string }) {
  return (
    <Link
      href="/admin/login"
      className="inline-flex min-h-11 items-center justify-center text-sm text-gray-700 underline underline-offset-4"
    >
      {label}
    </Link>
  );
}

/**
 * Mensaje único para «este enlace no sirve» (incremento 18).
 *
 * Caducado, ya usado, manipulado o inexistente acaban aquí. No se distinguen:
 * para quien ha recibido el correo la acción es la misma —pedir otro—, y
 * separarlos solo ayudaría a quien esté probando enlaces.
 */
function InvalidLink() {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-white p-6">
      {/* TODO(i18n) */}
      <h2 className="text-sm font-medium text-black">Este enlace no sirve</h2>
      <p className="text-sm text-gray-700">
        Puede haber caducado, haberse usado ya o estar incompleto. Pide uno
        nuevo y ábrelo cuanto antes.
      </p>
      <Link href="/admin/recuperar" className="inline-flex">
        <Button variant="secondary" className="w-full">
          {/* TODO(i18n) */}
          Pedir un enlace nuevo
        </Button>
      </Link>
      <BackToLogin />
    </div>
  );
}

/**
 * Recoge el token del FRAGMENTO de la URL (incremento 18).
 *
 * Con la plantilla de email por defecto de Supabase, el enlace acaba en
 * `#access_token=…&refresh_token=…&type=recovery`. El fragmento **nunca llega
 * al servidor**, así que este es el único sitio del sistema que puede verlo.
 *
 * Se entrega al servidor una sola vez y se BORRA de la barra de direcciones
 * con `replaceState`, para que no quede en el historial ni se comparta por
 * error al copiar la URL.
 */
function RecoveryBootstrap() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "invalid">("checking");

  useEffect(() => {
    let cancelled = false;

    /*
      Todo ocurre DENTRO de la función asíncrona, incluido el caso «no hay
      fragmento». Llamar a `setState` de forma sincrónica en el cuerpo de un
      efecto provoca un render en cascada antes de pintar, y ESLint lo prohíbe
      (`react-hooks/set-state-in-effect`) con razón.
    */
    (async () => {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      // Sin fragmento no hay nada que canjear: se ha llegado aquí a pelo.
      if (!accessToken || !refreshToken || type !== "recovery") {
        if (!cancelled) setState("invalid");
        return;
      }

      const result = await adoptRecoverySessionAction(accessToken, refreshToken);
      if (cancelled) return;

      // Fuera de la barra de direcciones pase lo que pase.
      window.history.replaceState(null, "", window.location.pathname);

      if (result.ok) {
        // El servidor ya tiene la sesión en cookies: se vuelve a renderizar la
        // página, que ahora encontrará usuario y pintará el formulario.
        router.refresh();
      } else {
        setState("invalid");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state === "invalid") return <InvalidLink />;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-md border border-line bg-white p-6"
    >
      {/* TODO(i18n) */}
      <p className="text-sm text-black">Comprobando el enlace…</p>
      <div className="h-10 animate-pulse rounded-md bg-cream-dark" />
    </div>
  );
}

/**
 * Pantalla de contraseña nueva.
 *
 * `hasSession` lo decide el SERVIDOR (`getUser()` validando contra Supabase).
 * Este componente no comprueba permisos ni roles: solo elige qué pintar.
 */
export function ResetPasswordForm({
  hasSession,
  email,
  linkError,
}: {
  hasSession: boolean;
  email: string | null;
  /** `true` si se llegó desde `/admin/auth/confirm` con un token rechazado. */
  linkError: boolean;
}) {
  const [state, formAction] = useActionState(setNewPasswordAction, INITIAL);
  const [visible, setVisible] = useState(false);

  if (!hasSession) {
    // Un token ya rechazado en servidor no se vuelve a intentar en cliente.
    return linkError ? <InvalidLink /> : <RecoveryBootstrap />;
  }

  const inputClasses =
    "h-12 w-full rounded-md border border-line bg-cream px-3 pr-24 text-base text-black outline-none focus-visible:border-black";

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-6"
      noValidate
    >
      {email ? (
        <p className="text-sm text-gray-700">
          {/* TODO(i18n) */}
          Vas a cambiar la contraseña de <strong className="text-black">{email}</strong>.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {/* TODO(i18n) */}
        <label htmlFor="password" className="text-sm font-medium text-black">
          Contraseña nueva
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            required
            minLength={PASSWORD_MIN_LENGTH}
            aria-describedby="password-hint"
            className={inputClasses}
          />
          {/*
            Mostrar/ocultar dentro del campo: en un móvil, escribir una
            contraseña larga a ciegas es la causa más común de teclearla mal
            dos veces. 44 px de objetivo táctil.
          */}
          {/*
            44 px de alto dentro de un campo de 48: quedan 2 px arriba y abajo.
            Medido a 390 px — con `h-10` se quedaba en 40 y era el único
            objetivo por debajo del mínimo de esta pantalla.
          */}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            className="absolute right-0.5 top-0.5 inline-flex h-11 min-w-20 items-center justify-center rounded-md px-3 text-sm font-medium text-black"
          >
            {/* TODO(i18n) */}
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p id="password-hint" className="text-xs text-gray-700">
          {/* El mínimo REAL del proyecto, medido contra Supabase. */}
          Mínimo {PASSWORD_MIN_LENGTH} caracteres.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* TODO(i18n) */}
        <label htmlFor="confirmation" className="text-sm font-medium text-black">
          Repite la contraseña
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          aria-describedby={state.error ? "reset-error" : undefined}
          className="h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black"
        />
      </div>

      {state.error ? (
        <p id="reset-error" role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
      <BackToLogin label="Cancelar y volver al acceso" />
    </form>
  );
}
