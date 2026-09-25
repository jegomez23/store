"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateAiAssistAction,
  type SettingsActionState,
} from "@/app/admin/(panel)/ajustes/actions";
import type { AssistantAvailability } from "@/lib/ai/availability";

const INITIAL: SettingsActionState = { error: null, success: null };

/**
 * El interruptor de la ayuda con IA (incremento 21).
 *
 * Es un FORMULARIO con un botón, no una casilla que se guarda sola: un
 * conmutador que aplica al soltarlo deja al administrador sin saber si el
 * cambio llegó a guardarse, y aquí el cambio decide si las fotos salen o no
 * hacia un tercero. Un botón con su confirmación escrita es más claro y
 * funciona sin JavaScript.
 *
 * El botón lleva el valor que quiere escribir (`intent`), así que no depende
 * de que un checkbox desmarcado viaje —que no viaja—.
 */
function Submit({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value={enabled ? "disable" : "enable"}
      disabled={pending}
      className={
        enabled
          ? "inline-flex min-h-11 items-center justify-center rounded-full border border-black px-5 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex min-h-11 items-center justify-center rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {/* TODO(i18n) */}
      {pending ? "Guardando…" : enabled ? "Desactivar" : "Activar"}
    </button>
  );
}

export function AiAssistForm({
  enabled,
  availability,
}: {
  enabled: boolean;
  /** Resuelto en el servidor: distingue «apagada» de «sin proveedor». */
  availability: AssistantAvailability;
}) {
  const [state, formAction] = useActionState(updateAiAssistAction, INITIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-line bg-white p-4"
    >
      <div className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <p className="text-sm font-medium text-black">
          Ayuda con IA al crear un producto
        </p>
        <p className="text-xs text-gray-700">
          Cuando está activada, el botón «Analizar foto» propone nombre,
          descripción, categoría y color mirando la imagen.{" "}
          <strong>Propone: no publica, no pone precio y no toca el stock.</strong>{" "}
          Tú decides qué se guarda.
        </p>
      </div>

      {/*
        LO QUE SALE DEL PROYECTO SE DICE AQUÍ, no en la documentación. Quien
        enciende esto tiene derecho a saber qué manda y a dónde antes de
        pulsar, no después.
      */}
      <p className="text-xs text-gray-400">
        Con la IA activada, la foto que subas se envía a Google (Gemini) para
        que la mire. No se envía ningún dato de clientes, pedidos ni
        proveedores. En el plan gratuito, Google puede usar ese contenido para
        mejorar sus productos.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Submit enabled={enabled} />
        <span className="text-sm text-gray-700">
          {/* TODO(i18n) */}
          {enabled ? "Activada" : "Desactivada"}
        </span>
      </div>

      {/*
        Encendida pero sin clave en el servidor: el interruptor está bien y el
        problema es otro. Se dice, porque si no el administrador ve «Activada»
        y un botón que no funciona.
      */}
      {availability === "NOT_CONFIGURED" ? (
        <p className="rounded-md border border-line bg-cream px-4 py-3 text-xs text-gray-700">
          {/* TODO(i18n) */}
          Está activada, pero el servidor no tiene configurado el proveedor
          (falta <code>GEMINI_API_KEY</code>). Hasta que se configure, el botón
          de analizar seguirá desactivado y el alta funcionará a mano.
        </p>
      ) : null}

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
    </form>
  );
}
