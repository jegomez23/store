"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ProductStatus } from "@/lib/admin/catalog";
import {
  setProductStatusAction,
  type CatalogActionState,
} from "@/app/admin/(panel)/catalogo/actions";

/**
 * Publicar / retirar un producto. Confirmación inline de un clic, sin modal
 * (docs/rules/ui.md #Interacción): la acción es reversible con otro clic.
 */

const INITIAL: CatalogActionState = { error: null, success: null };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-full border border-black px-4 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* TODO(i18n) */}
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function ProductStatusToggle({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const [state, formAction] = useActionState(setProductStatusAction, INITIAL);

  // Fase 9.5: archivar dejaba de ser reversible desde el panel y la unica
  // salida era entrar en Supabase. `setProductStatusAction` YA aceptaba los
  // tres estados —solo faltaba el boton—, asi que desarchivar no necesito ni
  // una linea de servidor. Vuelve a BORRADOR, no a publicado: sacar algo del
  // archivo no deberia devolverlo a la tienda sin que alguien lo mire.
  const next: ProductStatus =
    status === "active" ? "draft" : status === "archived" ? "draft" : "active";

  const label =
    status === "active"
      ? "Retirar de la tienda"
      : status === "archived"
        ? "Desarchivar"
        : "Publicar";

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="status" value={next} />
      {/* TODO(i18n) */}
      <Submit label={label} />
      {state.error ? (
        <p role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-xs text-gray-700">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
