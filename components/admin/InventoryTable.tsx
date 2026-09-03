"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  restockVariantsAction,
  type RestockState,
} from "@/app/admin/(panel)/inventario/actions";
import type { InventoryRow } from "@/lib/data/admin/inventory";
import { formatPrice } from "@/lib/money/format";

/**
 * Tabla de inventario con reposición en lote (Fase 9.5, Incremento 4).
 *
 * UN SOLO FORMULARIO para toda la página: el admin recorre la lista con lo
 * recibido delante, escribe las unidades donde toca y envía una vez. Esa es la
 * operación real —una recepción de mercancía es UNA operación, no N—, y además
 * es lo que permite que el lote sea atómico en PostgreSQL.
 *
 * SE ENVÍAN DELTAS, no valores absolutos: el campo dice "+ unidades" y lo que
 * viaja es la suma. El servidor nunca recibe un stock calculado en el cliente.
 *
 * Funciona sin JavaScript: es un `<form>` con Server Action. `disabled` durante
 * el envío es comodidad, no protección — la garantía está en la función SQL.
 */

const INITIAL: RestockState = { error: null, success: null };

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="inline-flex h-12 items-center rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark disabled:cursor-not-allowed disabled:opacity-50 md:h-11"
    >
      {/* TODO(i18n) */}
      {pending ? "Aplicando…" : "Aplicar reposición"}
    </button>
  );
}

function StockCell({ row }: { row: InventoryRow }) {
  if (row.stock === 0) {
    return <span className="font-medium text-red">{/* TODO(i18n) */}Agotada</span>;
  }
  return (
    <span className={row.isLowStock ? "font-medium text-red" : "text-black"}>
      {row.stock}
      <span className="text-gray-400"> / {row.lowStockThreshold}</span>
    </span>
  );
}

export function InventoryTable({
  rows,
  currencyCode,
  locale,
}: {
  rows: InventoryRow[];
  currencyCode: string;
  locale: string;
}) {
  const [state, formAction] = useActionState(restockVariantsAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Móvil: tarjetas. Una tabla de 6 columnas es ilegible en 375px. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.variantId}
            className="flex flex-col gap-2 rounded-md border border-line bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-black">
                {row.productName}
              </span>
              <StockCell row={row} />
            </div>
            <p className="text-xs text-gray-700">
              {[row.colorName, row.sizeLabel].filter(Boolean).join(" · ") || "—"}
              <span className="text-gray-400"> · {row.sku}</span>
            </p>
            <label className="flex items-center gap-2 text-sm">
              {/* TODO(i18n) */}
              <span className="text-gray-700">Entran</span>
              <input
                type="text"
                inputMode="numeric"
                name={`delta:${row.variantId}`}
                placeholder="+0"
                aria-label={`Unidades que entran de ${row.sku}`}
                className="h-11 w-24 rounded-md border border-line bg-white px-3 text-base text-black outline-none focus-visible:border-black"
              />
            </label>
          </li>
        ))}
      </ul>

      {/* Desktop: tabla densa. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* TODO(i18n) */}
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-gray-700">
              <th scope="col" className="py-2 pr-4 font-medium">Producto</th>
              <th scope="col" className="py-2 pr-4 font-medium">Variante</th>
              <th scope="col" className="py-2 pr-4 font-medium">SKU</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Precio</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Stock / umbral</th>
              <th scope="col" className="py-2 text-right font-medium">Entran</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.variantId} className="border-b border-line">
                <td className="max-w-[18rem] py-2.5 pr-4">
                  <span className="block truncate text-black">{row.productName}</span>
                  {row.productStatus !== "active" || !row.isActive ? (
                    <span className="text-xs text-gray-400">
                      {/* TODO(i18n) */}
                      {row.productStatus !== "active" ? "producto no publicado" : "variante inactiva"}
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-gray-700">
                  {[row.colorName, row.sizeLabel].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-gray-400">
                  {row.sku}
                </td>
                <td className="py-2.5 pr-4 text-right whitespace-nowrap text-gray-700">
                  {formatPrice(row.price, currencyCode, locale)}
                </td>
                <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                  <StockCell row={row} />
                </td>
                <td className="py-2.5 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    name={`delta:${row.variantId}`}
                    placeholder="+0"
                    aria-label={`Unidades que entran de ${row.sku}`}
                    className="h-9 w-20 rounded-md border border-line bg-white px-2 text-right text-sm text-black outline-none focus-visible:border-black"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton count={rows.length} />
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Se suman a lo que ya hay. Escribe un negativo para retirar unidades.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-black">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
