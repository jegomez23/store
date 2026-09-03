import Link from "next/link";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ordersHref,
  type OrderListParams,
} from "@/lib/admin/orders";

/**
 * Filtros del listado de pedidos. Server Component a propósito: el estado vive
 * en la URL (`searchParams`), no en React, así que un filtro se puede compartir
 * o recargar y sigue siendo el mismo (docs/05-ADMIN.md §5).
 *
 * La búsqueda es un `<form method="get">` nativo: no necesita JavaScript.
 */
export function OrdersFilters({ params }: { params: OrderListParams }) {
  const chips = [
    { status: null as OrderListParams["status"], label: "Todos" },
    ...ORDER_STATUSES.map((status) => ({
      status,
      label: ORDER_STATUS_LABELS[status],
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <form method="get" action="/admin/pedidos" className="flex gap-2">
        {/* Buscar reinicia la paginación; conserva el estado filtrado. */}
        {params.status ? (
          <input type="hidden" name="estado" value={params.status} />
        ) : null}
        <label htmlFor="q" className="sr-only">
          {/* TODO(i18n) */}
          Buscar por número de pedido
        </label>
        <input
          id="q"
          name="q"
          type="search"
          inputMode="search"
          defaultValue={params.query ?? ""}
          placeholder="YI-ES-000001"
          className="h-11 w-full max-w-xs rounded-md border border-line bg-white px-3 text-base text-black outline-none focus-visible:border-black md:text-sm"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-md border border-black px-4 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white"
        >
          {/* TODO(i18n) */}
          Buscar
        </button>
      </form>

      <nav aria-label="Filtrar por estado">
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const active = params.status === chip.status;
            return (
              <li key={chip.label}>
                <Link
                  href={ordersHref({ status: chip.status, query: params.query })}
                  aria-current={active ? "true" : undefined}
                  className={`flex h-9 items-center rounded-full px-3 text-xs font-medium transition-colors duration-200 ease-out ${
                    active
                      ? "bg-black text-white"
                      : "border border-line bg-white text-gray-700 hover:border-black hover:text-black"
                  }`}
                >
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
