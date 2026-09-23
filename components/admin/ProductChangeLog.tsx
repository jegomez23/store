import {
  describeChange,
  isCriticalChange,
  type ChangeEntry,
} from "@/lib/admin/timeline";
import { formatPrice } from "@/lib/money/format";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Historial de decisiones sobre un producto (Fase 9.5, 5C).
 *
 * Va aquí, en la ficha donde el administrador ya está trabajando, y no en un
 * "centro de auditoría": la pregunta que responde —"¿quién cambió este
 * precio?"— se hace mirando el producto, no una pantalla de logs.
 *
 * Server Component: es solo lectura y no necesita interactividad.
 */
export function ProductChangeLog({
  entries,
  hasMore,
  market,
}: {
  entries: ChangeEntry[];
  /** Hay cambios más antiguos que los que se pintan. Se DICE, no se esconde. */
  hasMore: boolean;
  market: ActiveMarket;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-700">
        {/* TODO(i18n) */}
        Sin cambios registrados todavía.
      </p>
    );
  }

  const money = (amount: number) =>
    formatPrice(amount, market.currencyCode, market.locale);

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(market.locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">
        {/* TODO(i18n) */}
        Precio, stock, publicación y borrado. <strong>No es un historial de
        existencias</strong>: las ventas y las cancelaciones no aparecen aquí,
        porque quedan registradas en su propio pedido.
      </p>

      <ol className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-line bg-white px-4 py-2.5 ${
              isCriticalChange(entry) ? "border-l-2 border-l-red" : ""
            }`}
          >
            <span className="text-sm text-black">
              {describeChange(entry, money)}
              {/* El SKU solo aparece cuando el cambio es de una variante, que
                  es cuando hace falta saber de cuál de todas se habla. */}
              {entry.sku ? (
                <span className="ml-2 font-mono text-xs text-gray-400">
                  {entry.sku}
                </span>
              ) : null}
            </span>
            <span className="text-xs text-gray-400">
              {/* TODO(i18n) */}
              {entry.authorName ?? "Administrador"} · {dateTime(entry.createdAt)}
            </span>
          </li>
        ))}
      </ol>

      {/*
        Un "últimos 20" callado se lee como "esto es todo lo que pasó". Si hay
        más, se dice; no hay paginación porque nadie ha pedido todavía navegar
        el historial, y prometer una lista completa que no se sirve es peor.
      */}
      {hasMore ? (
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Se muestran los {entries.length} cambios más recientes. Hay más
          anteriores, que hoy solo pueden consultarse en la base de datos.
        </p>
      ) : null}
    </div>
  );
}
