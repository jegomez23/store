import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, isProductStatus, isLowStock } from "@/lib/admin/catalog";
import {
  CATALOG_PAGE_SIZE,
  listProductsForAdmin,
  listUnsellableProducts,
  normalizeCatalogQuery,
} from "@/lib/data/admin/catalog";
import { getActiveMarket } from "@/lib/markets";
import { formatPrice } from "@/lib/money/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catálogo",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function catalogHref(params: {
  status?: string | null;
  query?: string | null;
  page?: number;
}): string {
  const search = new URLSearchParams();
  if (params.status) search.set("estado", params.status);
  if (params.query) search.set("q", params.query);
  if (params.page && params.page > 1) search.set("pagina", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/catalogo?${qs}` : "/admin/catalogo";
}

/** 1-indexada y acotada: un `?pagina=999999` no debe pedir un rango absurdo. */
function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export default async function AdminCatalogPage(
  props: PageProps<"/admin/catalogo">,
) {
  const searchParams = await props.searchParams;
  const rawStatus = first(searchParams.estado);
  const status = isProductStatus(rawStatus) ? rawStatus : null;
  const query = normalizeCatalogQuery(first(searchParams.q));
  const page = parsePage(first(searchParams.pagina));
  const unsellableOnly = first(searchParams.ver) === "no-vendibles";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {/* TODO(i18n) */}
          <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
            Catálogo
          </h1>
          <p className="text-xs text-gray-400">
            Crea productos, gestiona sus variantes e imágenes y publícalos.
          </p>
        </div>
        <Link
          href="/admin/catalogo/nuevo"
          className="inline-flex h-12 items-center rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark md:h-11"
        >
          {/* TODO(i18n) */}
          Nuevo producto
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        <form method="get" action="/admin/catalogo" className="flex gap-2">
          {status ? <input type="hidden" name="estado" value={status} /> : null}
          <label htmlFor="q" className="sr-only">
            {/* TODO(i18n) */}
            Buscar por nombre o slug
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query ?? ""}
            placeholder="Camiseta, gorra…"
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
            {[{ value: null, label: "Todos" }, ...PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))].map(
              (chip) => {
                const active = status === chip.value && !unsellableOnly;
                return (
                  <li key={chip.label}>
                    <Link
                      href={catalogHref({ status: chip.value, query })}
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
              },
            )}
            {/*
              El destino de la alerta del resumen. Va aquí y no en una pantalla
              nueva porque es exactamente eso: un filtro del catálogo.
            */}
            <li>
              <Link
                href="/admin/catalogo?ver=no-vendibles"
                aria-current={unsellableOnly ? "true" : undefined}
                className={`flex h-9 items-center rounded-full px-3 text-xs font-medium transition-colors duration-200 ease-out ${
                  unsellableOnly
                    ? "bg-red text-white"
                    : "border border-line bg-white text-red hover:border-red"
                }`}
              >
                {/* TODO(i18n) */}
                No se pueden comprar
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      {/* Skeleton por <Suspense>, no por loading.tsx (ver AdminSkeleton). */}
      <Suspense
        key={`${unsellableOnly}-${status}-${query}-${page}`}
        fallback={<AdminSkeleton rows={4} />}
      >
        {unsellableOnly ? (
          <UnsellableList />
        ) : (
          <CatalogList status={status} query={query} page={page} />
        )}
      </Suspense>
    </div>
  );
}

async function CatalogList({
  status,
  query,
  page,
}: {
  status: string | null;
  query: string | null;
  page: number;
}) {
  const market = await getActiveMarket();
  const { products, count } = await listProductsForAdmin(market, {
    status: isProductStatus(status) ? status : null,
    query,
    page,
  });
  const pages = Math.max(1, Math.ceil(count / CATALOG_PAGE_SIZE));

  if (products.length === 0) {
    return (
      <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
        {/* TODO(i18n) */}
        {status || query
          ? "Ningún producto coincide con este filtro."
          : "Todavía no hay productos. Crea el primero."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-700">
        {/* TODO(i18n) */}
        {count} {count === 1 ? "producto" : "productos"} · mercado {market.id}
        {pages > 1 ? ` · página ${page} de ${pages}` : ""}
      </p>

      <ul className="flex flex-col gap-2">
        {products.map((product) => {
          const units = product.variants.reduce((sum, v) => sum + v.stock, 0);
          const low = product.variants.some((v) => v.isActive && isLowStock(v.stock, v.lowStockThreshold));
          const prices = product.variants.map((v) => v.price);
          return (
            <li key={product.id}>
              <Link
                href={`/admin/catalogo/${product.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3 transition-colors duration-200 ease-out hover:border-black"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-black">{product.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                        product.status === "active"
                          ? "bg-black text-white"
                          : "border border-line bg-white text-gray-700"
                      }`}
                    >
                      {PRODUCT_STATUS_LABELS[product.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-700">
                    {product.categoryName ?? "—"} · /producto/{product.slug}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-gray-700">
                    {/* TODO(i18n) */}
                    {product.variants.length}{" "}
                    {product.variants.length === 1 ? "variante" : "variantes"}
                  </span>
                  <span className={low ? "font-medium text-red" : "text-gray-700"}>
                    {/* TODO(i18n) */}
                    {units} uds
                  </span>
                  {prices.length > 0 ? (
                    <span className="font-medium text-black">
                      {formatPrice(Math.min(...prices), market.currencyCode, market.locale)}
                    </span>
                  ) : (
                    <span className="text-gray-400">{/* TODO(i18n) */}sin precio</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {pages > 1 ? (
        <nav
          aria-label="Paginación del catálogo"
          className="flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link
              href={catalogHref({ status, query, page: page - 1 })}
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
              href={catalogHref({ status, query, page: page + 1 })}
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

/**
 * Filtro "no se pueden comprar" (Fase 9.5, 5B).
 *
 * Es el destino de la alerta del resumen, y usa la MISMA función SQL que la
 * contó (`admin_unsellable_products`), así que el número y la lista no pueden
 * discrepar. Se separan los dos motivos porque se arreglan de forma distinta:
 * uno es un 404 y el otro es un "Agotado" perfectamente legítimo.
 */
async function UnsellableList() {
  const market = await getActiveMarket();
  const products = await listUnsellableProducts(market);

  if (products.length === 0) {
    return (
      <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
        {/* TODO(i18n) */}
        Todos los productos publicados se pueden comprar.
      </p>
    );
  }

  const roto = products.filter((p) => p.reason === "sin_variante_activa");
  const agotado = products.filter((p) => p.reason === "agotado");

  return (
    <div className="flex flex-col gap-6">
      {roto.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-red">
            {/* TODO(i18n) */}
            Su ficha da un error 404 ({roto.length})
          </h2>
          <p className="text-xs text-gray-400">
            Publicados pero sin ninguna variante activa: la página del producto
            no existe para el cliente. Activa o crea una variante.
          </p>
          <ul className="flex flex-col gap-1.5">
            {roto.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/admin/catalogo/${product.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line border-l-2 border-l-red bg-white px-4 py-3 text-sm transition-colors duration-200 ease-out hover:border-black"
                >
                  <span className="truncate text-black">{product.name}</span>
                  <span className="shrink-0 font-mono text-xs text-gray-400">
                    {product.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {agotado.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-black">
            {/* TODO(i18n) */}
            Agotados ({agotado.length})
          </h2>
          <p className="text-xs text-gray-400">
            Su ficha funciona y se muestra como &laquo;Agotado&raquo;, pero
            ahora mismo nadie puede comprarlos. Se arreglan reponiendo.
          </p>
          <ul className="flex flex-col gap-1.5">
            {agotado.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/admin/catalogo/${product.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3 text-sm transition-colors duration-200 ease-out hover:border-black"
                >
                  <span className="truncate text-black">{product.name}</span>
                  <span className="shrink-0 font-mono text-xs text-gray-400">
                    {product.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/inventario?ver=agotadas"
            className="text-xs text-gray-700 underline-offset-2 hover:text-black hover:underline"
          >
            {/* TODO(i18n) */}
            Reponer desde inventario →
          </Link>
        </section>
      ) : null}
    </div>
  );
}
