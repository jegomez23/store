"use client";

import { useActionState } from "react";
import { Feedback, Field, SubmitButton } from "@/components/admin/FormBits";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { MAX_FILES_PER_BATCH } from "@/lib/admin/images";
import {
  deleteProductImageAction,
  setImageOrderAction,
  setPrimaryImageAction,
  uploadProductImagesAction,
  type ImageActionState,
} from "@/app/admin/(panel)/catalogo/image-actions";
import type { AdminProductImageRow } from "@/lib/data/admin/cms";

/**
 * Galería del producto: subir, ordenar, marcar principal y eliminar.
 *
 * Cada operación es su propio formulario, así que el error de una imagen no
 * bloquea las demás y el mensaje sale junto a lo que se tocó.
 *
 * La validación real (formato por magic bytes, tamaño, conversión a WebP) vive
 * en el servidor: aquí el `accept` del input es solo comodidad, no seguridad.
 */

const INITIAL: ImageActionState = { error: null, success: null };

/**
 * Subida de una o varias fotos (incremento 7).
 *
 * PENSADO PARA EL MÓVIL, que es donde llegan las fotos: un solo control grande
 * que abre el selector del teléfono con `multiple`, y un botón. No hay campo de
 * texto alternativo —se genera del nombre del producto— ni arrastrar-y-soltar,
 * que en un teléfono no existe.
 *
 * El resultado se enseña ARCHIVO POR ARCHIVO. Un lote puede salir a medias, y
 * decir solo "hecho" o solo "error" sería mentir sobre lo que quedó guardado.
 */
function UploadForm({ productId }: { productId: string }) {
  const [state, formAction] = useActionState(uploadProductImagesAction, INITIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-4"
    >
      <input type="hidden" name="productId" value={productId} />

      <div className="flex flex-col gap-0.5">
        {/* TODO(i18n) */}
        <h2 className="text-sm font-medium text-black">Añadir fotos</h2>
        <p className="text-xs text-gray-400">
          Puedes elegir varias a la vez (hasta {MAX_FILES_PER_BATCH}). JPEG, PNG
          o WebP, máximo 5 MB cada una. Se convierten a WebP y se reescalan a
          2000 px. El texto alternativo se genera del nombre del producto.
        </p>
      </div>

      <Field label="Fotos" name="files">
        <input
          id="files"
          name="files"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          required
          // `min-h-11` y el botón grande: objetivo táctil cómodo en móvil.
          className="w-full rounded-md border border-line bg-cream px-3 py-3 text-sm text-black file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-black file:px-4 file:text-sm file:text-white"
        />
      </Field>

      <Feedback state={state} />

      {/* Detalle por archivo: qué entró y qué no. */}
      {state.results && state.results.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {state.results.map((result, index) => (
            <li
              key={`${result.name}-${index}`}
              className={`flex flex-wrap items-baseline gap-x-2 rounded-md px-3 py-2 text-xs ${
                result.ok ? "bg-cream text-gray-700" : "bg-white text-red ring-1 ring-red"
              }`}
            >
              <span aria-hidden="true">{result.ok ? "✓" : "✗"}</span>
              <span className="min-w-0 break-all font-medium">{result.name}</span>
              <span className={result.ok ? "text-gray-400" : ""}>{result.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <SubmitButton label="Subir fotos" pendingLabel="Subiendo…" />
      </div>
    </form>
  );
}

function ImageCard({
  image,
  productId,
}: {
  image: AdminProductImageRow;
  productId: string;
}) {
  const [primaryState, primaryAction] = useActionState(setPrimaryImageAction, INITIAL);
  const [orderState, orderAction] = useActionState(setImageOrderAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteProductImageAction, INITIAL);

  return (
    <li className="flex flex-col gap-3 rounded-md border border-line bg-white p-3">
      <div className="relative">
        <RemoteImage src={image.publicUrl} alt={image.altText} ratio="square" />
        {image.isPrimary ? (
          <span className="absolute left-2 top-2 rounded-full bg-red px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-white">
            {/* TODO(i18n) */}
            Principal
          </span>
        ) : null}
      </div>

      <p className="line-clamp-2 text-xs text-gray-700">{image.altText}</p>

      <form action={orderAction} className="flex items-end gap-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="imageId" value={image.id} />
        <div className="flex flex-col gap-1">
          <label htmlFor={`order-${image.id}`} className="text-xs font-medium text-gray-700">
            {/* TODO(i18n) */}
            Orden
          </label>
          <input
            id={`order-${image.id}`}
            name="sortOrder"
            inputMode="numeric"
            defaultValue={String(image.sortOrder)}
            className="h-11 w-20 rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-md border border-black px-3 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white"
        >
          {/* TODO(i18n) */}
          Guardar
        </button>
      </form>

      {!image.isPrimary ? (
        <form action={primaryAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="imageId" value={image.id} />
          <button
            type="submit"
            className="h-11 w-full rounded-md border border-line px-3 text-sm font-medium text-black transition-colors duration-200 ease-out hover:border-black"
          >
            {/* TODO(i18n) */}
            Marcar como principal
          </button>
        </form>
      ) : null}

      <form action={deleteAction}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="imageId" value={image.id} />
        <button
          type="submit"
          className="h-11 w-full rounded-md px-3 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black"
        >
          {/* TODO(i18n) */}
          Eliminar
        </button>
      </form>

      <Feedback state={primaryState} />
      <Feedback state={orderState} />
      <Feedback state={deleteState} />
    </li>
  );
}

export function ProductImages({
  productId,
  images,
}: {
  productId: string;
  images: AdminProductImageRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <UploadForm productId={productId} />

      {images.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Este producto no tiene imágenes todavía.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {images.map((image) => (
            <ImageCard key={image.id} image={image} productId={productId} />
          ))}
        </ul>
      )}
    </div>
  );
}
