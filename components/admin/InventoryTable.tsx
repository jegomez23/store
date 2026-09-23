"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveStockAction,
  type StockState,
} from "@/app/admin/(panel)/inventario/actions";
import type { InventoryProduct, InventoryVariant } from "@/lib/data/admin/inventory";

/**
 * Inventario editable, agrupado por producto (Incremento 12).
 *
 * LA OPERACIÓN QUE OPTIMIZA: al administrador le dicen "negra M 4, negra L 0,
 * blanca M 7". Escribe tres números en el bloque del producto y pulsa guardar
 * una vez. Nada de abrir la ficha, nada de sumar de cabeza.
 *
 * UN FORMULARIO POR PRODUCTO, y no uno global: el lote es atómico, así que el
 * grupo tiene que coincidir con lo que el administrador entiende por "una
 * operación". Si un guardado falla por conflicto, solo se rechaza ese producto.
 *
 * DOS BOTONES, UN FORMULARIO: "Guardar" y "Agotar" se distinguen por el
 * `intent` del botón pulsado, que es comportamiento nativo de HTML. Funciona
 * sin JavaScript; `disabled` mientras se envía es comodidad, no protección.
 *
 * EL `key` DE LOS CAMPOS LLEVA `updatedAt` A PROPÓSITO: tras guardar, el
 * servidor devuelve la fila con otro `updated_at`, el input se vuelve a montar
 * y muestra el valor nuevo. Sin eso, un input no controlado seguiría enseñando
 * lo que había antes de pulsar Agotar.
 */

const INITIAL: StockState = { error: null, success: null, conflict: false };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value="save"
      disabled={pending}
      /*
        NEGRO, no rojo: esta pantalla pinta un botón de guardar por producto, y
        cuatro CTA rojos a la vez romperían la regla de que el rojo señala UNA
        acción principal (CLAUDE.md #10). Aquí el rojo queda para lo que avisa:
        el borde de una variante agotada o bajo umbral.
      */
      className="inline-flex h-12 items-center rounded-full bg-black px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* TODO(i18n) */}
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}

function ExhaustButton({ variant }: { variant: InventoryVariant }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="intent"
      value={`exhaust:${variant.variantId}`}
      disabled={pending || variant.stock === 0}
      aria-label={`Agotar ${variant.sku}`}
      className="h-12 shrink-0 rounded-full border border-black px-4 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-line disabled:text-gray-400 disabled:hover:bg-transparent disabled:hover:text-gray-400"
    >
      {/* TODO(i18n) */}
      Agotar
    </button>
  );
}

function VariantLabel({ variant }: { variant: InventoryVariant }) {
  const label = [variant.colorName, variant.sizeLabel].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm text-black">
        {/* TODO(i18n) */}
        {label || "Única"}
        {!variant.isActive ? (
          <span className="ml-2 text-xs text-gray-400">{/* TODO(i18n) */}inactiva</span>
        ) : null}
      </span>
      {/*
        La referencia del proveedor va aquí, y solo si existe: es lo que el
        administrador tiene delante cuando le dictan la disponibilidad, así que
        le permite confirmar que está tocando la variante correcta sin abrir la
        ficha. Si no hay referencia, no se pinta un hueco.
      */}
      <span className="truncate font-mono text-[11px] text-gray-400">
        {variant.sku}
        {variant.supplierRef ? (
          <span className="text-black"> · {variant.supplierRef}</span>
        ) : null}
      </span>
    </span>
  );
}

function ProductGroup({ product }: { product: InventoryProduct }) {
  const [state, formAction] = useActionState(saveStockAction, INITIAL);
  const units = product.variants.reduce((sum, v) => sum + v.stock, 0);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-line bg-white p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <h2 className="min-w-0 text-sm font-medium text-black">{product.productName}</h2>
          {product.supplier ? (
            <span className="truncate text-xs text-gray-700">{product.supplier}</span>
          ) : null}
        </div>
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          {units} uds
          {product.productStatus !== "active" ? " · no publicado" : ""}
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {product.variants.map((variant) => (
          <li
            key={variant.variantId}
            className="flex items-center gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0"
          >
            <VariantLabel variant={variant} />

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <label htmlFor={`stock-${variant.variantId}`} className="sr-only">
                {/* TODO(i18n) */}
                Unidades de {variant.sku}
              </label>
              <input
                // Ver cabecera: el testigo en la key repinta el valor real
                // después de guardar o de agotar.
                key={`${variant.variantId}-${variant.updatedAt}`}
                id={`stock-${variant.variantId}`}
                name={`stock:${variant.variantId}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={String(variant.stock)}
                className={`h-12 w-20 rounded-md border bg-white px-3 text-center text-base text-black outline-none focus-visible:border-black ${
                  variant.stock === 0 ? "border-red" : variant.isLowStock ? "border-red" : "border-line"
                }`}
              />
              <input
                key={`ts-${variant.variantId}-${variant.updatedAt}`}
                type="hidden"
                name={`ts:${variant.variantId}`}
                value={variant.updatedAt}
              />
              <ExhaustButton variant={variant} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveButton />
        {state.error ? (
          <p role="alert" className="w-full text-sm text-red">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className="w-full text-sm text-black">
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function InventoryTable({ products }: { products: InventoryProduct[] }) {
  return (
    <div className="flex flex-col gap-3">
      {products.map((product) => (
        <ProductGroup key={product.productId} product={product} />
      ))}
      <p className="text-xs text-gray-400">
        {/* TODO(i18n) */}
        Escribe las unidades que hay ahora mismo y guarda. Si alguien cambia
        algo mientras editas, no se guarda nada y te avisamos.
      </p>
    </div>
  );
}
