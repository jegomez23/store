"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { isLowStock } from "@/lib/admin/catalog";
import {
  updateVariantAction,
  type CatalogActionState,
} from "@/app/admin/(panel)/catalogo/actions";
import type { AdminVariant } from "@/lib/data/admin/catalog";

/**
 * Edición inline de una variante: stock, precio y activa/inactiva.
 *
 * Un formulario por fila (no uno global): así el error de una variante no
 * bloquea las demás y el resultado se muestra junto a lo que se editó
 * (docs/rules/ui.md #15). La validación real está en la Server Action y en los
 * CHECK de la base de datos.
 */

const INITIAL: CatalogActionState = { error: null, success: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 shrink-0 rounded-md border border-black px-3 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* TODO(i18n) */}
      {pending ? "…" : "Guardar"}
    </button>
  );
}

export function VariantRow({
  variant,
  currencyCode,
}: {
  variant: AdminVariant;
  currencyCode: string;
}) {
  const [state, formAction] = useActionState(updateVariantAction, INITIAL);
  const low = isLowStock(variant.stock, variant.lowStockThreshold);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 border-t border-line px-4 py-3 md:flex-row md:items-end"
    >
      <input type="hidden" name="variantId" value={variant.id} />
      {/*
        Testigo del bloqueo optimista (Fase 9.5): viaja el `updated_at` que se
        leyo al pintar la fila. Si otro admin guardo mientras tanto, el UPDATE
        no encuentra la fila y la accion avisa en vez de pisar su cambio.
        Este formulario escribe valores ABSOLUTOS; la reposicion acumulativa
        vive en /admin/inventario y usa deltas.
      */}
      <input type="hidden" name="expectedUpdatedAt" value={variant.updatedAt} />

      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-gray-700">{variant.sku}</p>
        <p className="text-sm text-black">
          {[variant.colorName, variant.sizeLabel].filter(Boolean).join(" · ") ||
            /* TODO(i18n) */ "Única"}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`stock-${variant.id}`}
          className="text-xs font-medium text-gray-700"
        >
          {/* TODO(i18n) */}
          Stock
        </label>
        <input
          id={`stock-${variant.id}`}
          name="stock"
          type="text"
          inputMode="numeric"
          defaultValue={String(variant.stock)}
          className={`h-11 w-24 rounded-md border bg-white px-3 text-base text-black outline-none focus-visible:border-black md:text-sm ${
            low ? "border-red" : "border-line"
          }`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`threshold-${variant.id}`}
          className="text-xs font-medium text-gray-700"
        >
          {/* TODO(i18n) */}
          Aviso bajo
        </label>
        <input
          id={`threshold-${variant.id}`}
          name="lowStockThreshold"
          type="text"
          inputMode="numeric"
          defaultValue={String(variant.lowStockThreshold)}
          className="h-11 w-20 rounded-md border border-line bg-white px-3 text-base text-black outline-none focus-visible:border-black md:text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`price-${variant.id}`}
          className="text-xs font-medium text-gray-700"
        >
          {/* TODO(i18n) */}
          Precio ({currencyCode})
        </label>
        <input
          id={`price-${variant.id}`}
          name="price"
          type="text"
          inputMode="decimal"
          defaultValue={variant.price.toFixed(2)}
          className="h-11 w-28 rounded-md border border-line bg-white px-3 text-base text-black outline-none focus-visible:border-black md:text-sm"
        />
      </div>

      <label className="flex h-11 items-center gap-2 text-sm text-black">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={variant.isActive}
          className="h-5 w-5 accent-[var(--color-red)]"
        />
        {/* TODO(i18n) */}
        Activa
      </label>

      <SaveButton />

      {state.error ? (
        <p role="alert" className="text-sm text-red md:w-full">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-gray-700 md:w-full">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
