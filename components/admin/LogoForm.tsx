"use client";

import { useActionState } from "react";
import Image from "next/image";
import { Feedback, SubmitButton } from "@/components/admin/FormBits";
import {
  removeLogoAction,
  updateLogoAction,
} from "@/app/admin/(panel)/ajustes/logo-actions";
import type { SettingsActionState } from "@/app/admin/(panel)/ajustes/actions";

/**
 * Logo de la tienda (incremento 17).
 *
 * SUBIR → GUARDAR → USAR. No hay biblioteca de imágenes, ni selector, ni
 * recorte: un control de archivo, un botón y la vista de lo que hay puesto.
 * Un logo es UNO, y el que vale es el que está publicado.
 *
 * El `<input type="file">` va dentro de un `<label>` con altura propia porque
 * el control nativo mide lo que le da la gana según el navegador: envolverlo es
 * lo que garantiza el objetivo táctil de 44 px en un móvil.
 *
 * La vista previa sale de la URL PÚBLICA, la misma que ve el cliente: así lo
 * que el administrador comprueba es el resultado real y no una copia local del
 * archivo que acaba de elegir.
 */

const INITIAL: SettingsActionState = { error: null, success: null };

export function LogoForm({
  logoPublicUrl,
  storeName,
}: {
  /** URL pública ya resuelta, o `null` si la tienda no tiene logo. */
  logoPublicUrl: string | null;
  storeName: string;
}) {
  const [uploadState, uploadAction] = useActionState(updateLogoAction, INITIAL);
  const [removeState, removeAction] = useActionState(removeLogoAction, INITIAL);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
      {/* TODO(i18n) en todo el componente */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-black">Logo</h3>
        <p className="text-xs text-gray-400">
          Sale en la cabecera de la tienda y en la imagen que se ve al compartir
          el enlace. Sin logo se usa el nombre escrito.
        </p>
      </div>

      {/* ESTADO ACTUAL, sobre el mismo crema de la tienda: un logo con
          transparencia se ve como se va a ver de verdad, no sobre blanco. */}
      <div className="flex items-center gap-4">
        <span className="relative flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-cream">
          {logoPublicUrl ? (
            <Image
              src={logoPublicUrl}
              alt={`Logo de ${storeName}`}
              fill
              sizes="128px"
              className="object-contain p-1"
            />
          ) : (
            <span className="px-2 text-center text-xs text-gray-400">Sin logo</span>
          )}
        </span>
        <p className="text-xs text-gray-700">
          {logoPublicUrl
            ? "Este es el logo publicado."
            : `Ahora la cabecera muestra «${storeName}».`}
        </p>
      </div>

      <form action={uploadAction} className="flex flex-col gap-3">
        <label className="flex min-h-11 cursor-pointer flex-col justify-center gap-1">
          <span className="text-sm font-medium text-black">
            {logoPublicUrl ? "Sustituir el logo" : "Subir un logo"}
          </span>
          <input
            type="file"
            name="logo"
            accept="image/jpeg,image/png,image/webp"
            required
            className="block w-full text-sm text-gray-700 file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line file:bg-cream file:px-4 file:text-sm file:font-medium file:text-black"
          />
        </label>
        <p className="text-xs text-gray-400">
          JPEG, PNG o WebP, hasta 5 MB. Se convierte a WebP y se reduce a 512 px
          de lado.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={logoPublicUrl ? "Sustituir logo" : "Subir logo"} />
          <Feedback state={uploadState} />
        </div>
      </form>

      {logoPublicUrl ? (
        <form action={removeAction} className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-xs text-gray-400">
            Quitarlo no borra nada más: la cabecera vuelve a mostrar el nombre de
            la tienda.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium text-black transition-colors duration-200 ease-out hover:border-black"
            >
              Quitar logo
            </button>
            <Feedback state={removeState} />
          </div>
        </form>
      ) : null}
    </div>
  );
}
