"use client";

import { useActionState, useState } from "react";
import { Feedback, SubmitButton } from "@/components/admin/FormBits";
import {
  deleteProductAction,
  type CatalogActionState,
} from "@/app/admin/(panel)/catalogo/actions";

/**
 * Borrado (lógico) de producto con confirmación inline de un clic, sin modal
 * (docs/rules/ui.md §Interacción). La confirmación es UX: la autoridad sigue
 * siendo la Server Action, que revalida permisos y mercado.
 */

const INITIAL: CatalogActionState = { error: null, success: null };

export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [state, formAction] = useActionState(deleteProductAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-12 self-start rounded-full border border-black px-5 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white md:h-11"
        >
          {/* TODO(i18n) */}
          Eliminar producto
        </button>
        <Feedback state={state} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm text-black">
        {/* TODO(i18n) */}
        ¿Eliminar <strong>{productName}</strong>?
      </p>
      <div className="flex gap-2">
        <SubmitButton label="Sí, eliminar" pendingLabel="Eliminando…" />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-12 rounded-full px-5 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black md:h-11"
        >
          {/* TODO(i18n) */}
          Cancelar
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
