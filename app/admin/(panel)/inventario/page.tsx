import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { InventoryTable } from "@/components/admin/InventoryTable";
import {
  INVENTORY_FILTERS,
  INVENTORY_FILTER_LABELS,
  INVENTORY_PAGE_SIZE,
  isInventoryFilter,
  type InventoryFilter,
} from "@/lib/admin/inventory";
import { listInventory, normalizeCatalogQuery } from "@/lib/data/admin/inventory";
import { getActiveMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inventario",
  robots: { index: false, follow: false },
};

/**
 * INVENTARIO (Fase 9.5, Incremento 4).
 *
 * Antes, el stock solo existía troceado dentro de cada ficha: reponer lo que
 * llegaba obligaba a navegar catálogo → producto → variante, producto por
 * producto. Aquí está todo junto, ordenado por lo que menos stock tiene, y se
 * repone en una sola operación.
 */

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function inventoryHref(params: {
  filter?: InventoryFilter;
  query?: string | null;
  page?: number;
}): string {
  const search = new URLSearchParams();
  if (params.filter && params.filter !== "todas") search.set("ver", params.filter);
  if (params.query) search.set("q", params.query);
  if (params.page && params.page > 1) search.set("pagina", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/inventario?${qs}` : "/admin/inventario";
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export default async function AdminInventoryPage(
  props: PageProps<"/admin/inventario">,
) {
  const searchParams = await props.searchParams;
  const rawFilter = first(searchParams.ver);
  const filter: InventoryFilter = isInventoryFilter(rawFilter) ? rawFilter : "todas";
  const query = normalizeCatalogQuery(first(searchParams.q));
  const page = parsePage(first(searchParams.pagina));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Inventario
        </h1>
        <p className="text-xs text-gray-400">
          Todas las variantes del mercado. Escribe las unidades que entran y
          aplica una sola vez.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <form method="get" action="/admin/inventario" className="flex gap-2">
          {filter !== "todas" ? (
            <input type="hidden" name="ver" value={filter} />
          ) : null}
          <label htmlFor="q" className="sr-only">
            {/* TODO(i18n) */}
            Buscar por SKU o producto
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query ?? ""}
            placeholder="SKU, camiseta…"
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

        <nav aria-label="Filtrar inventario">
          <ul className="flex flex-wrap gap-1.5">
            {INVENTORY_FILTERS.map((option) => {
              const active = filter === option;
              return (
                <li key={option}>
                  <Link
                    href={inventoryHref({ filter: option, query })}
                    aria-current={active ? "true" : undefined}
                    className={`flex h-9 items-center rounded-full px-3 text-xs font-medium transition-colors duration-200 ease-out ${
                      active
                        ? "bg-black text-white"
                        : "border border-line bg-white text-gray-700 hover:border-black hover:text-black"
                    }`}
                  >
                    {INVENTORY_FILTER_LABELS[option]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <Suspense
        key={`${filter}-${query}-${page}`}
        fallback={<AdminSkeleton rows={6} />}
      >
        <InventoryList filter={filter} query={query} page={page} />
      </Suspense>
    </div>
  );
}

async function InventoryList({
  filter,
  query,
  page,
}: {
  filter: InventoryFilter;
  query: string | null;
  page: number;
}) {
  const market = await getActiveMarket();
  const { rows, count } = await listInventory(market, { filter, query, page });
  const pages = Math.max(1, Math.ceil(count / INVENTORY_PAGE_SIZE));

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
        {/* TODO(i18n) */}
        {filter === "agotadas"
          ? "Ninguna variante está agotada."
          : filter === "bajo"
            ? "Ninguna variante está por debajo de su umbral."
            : query
              ? "Ninguna variante coincide con la búsqueda."
              : "Todavía no hay variantes en este mercado."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-700">
        {/* TODO(i18n) */}
        {count} {count === 1 ? "variante" : "variantes"} · mercado {market.id}
        {pages > 1 ? ` · página ${page} de ${pages}` : ""}
      </p>

      <InventoryTable
        rows={rows}
        currencyCode={market.currencyCode}
        locale={market.locale}
      />

      {pages > 1 ? (
        <nav
          aria-label="Paginación del inventario"
          className="flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link
              href={inventoryHref({ filter, query, page: page - 1 })}
              className="flex h-11 items-center rounded-md border border-line px-4 text-sm font-medium text-black hover:border-black"
            >
              {/* TODO(i18n) */}
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-gray-700">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={inventoryHref({ filter, query, page: page + 1 })}
              className="flex h-11 items-center rounded-md border border-line px-4 text-sm font-medium text-black hover:border-black"
            >
              {/* TODO(i18n) */}
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
