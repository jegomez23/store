import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, isProductStatus, isLowStock } from "@/lib/admin/catalog";
import {
  CATALOG_PAGE_SIZE,
  countProductsWithoutImage,
  listBrokenProductImages,
  listProductsForAdmin,
  listProductsWithoutImage,
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
  /*
    `?ver=` es la convención que 5B ya estableció para "vistas" del catálogo que
    no son un filtro de estado. Se reutiliza tal cual en vez de inventar un
    segundo mecanismo: cada valor abre una lista con su propio predicado.
  */
  const view = first(searchParams.ver);
  const unsellableOnly = view === "no-vendibles";
  const withoutImageOnly = view === "sin-foto";
  // Incremento 10: tercera vista. La fila de imagen existe pero el objeto no,
  // así que "sin foto" da el producto por fotografiado y el cliente ve un hueco.
  const brokenImageOnly = view === "foto-rota";

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
          {/* TODO(i18n) — mismo texto que la acción del inicio: es el mismo sitio. */}
          + Añadir producto
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
                const active = status === chip.value && !unsellableOnly && !withoutImageOnly;
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
            {/*
              Segundo destino, y NEUTRO a propósito: un producto sin foto se
              compra perfectamente. No lleva rojo porque no es lo mismo que "no
              se puede comprar", y mezclarlos haría que el rojo dejara de
              significar algo concreto.
            */}
            <li>
              <Link
                href="/admin/catalogo?ver=sin-foto"
                aria-current={withoutImageOnly ? "true" : undefined}
                className={`flex h-9 items-center rounded-full px-3 text-xs font-medium transition-colors duration-200 ease-out ${
                  withoutImageOnly
                    ? "bg-black text-white"
                    : "border border-line bg-white text-gray-700 hover:border-black hover:text-black"
                }`}
              >
                {/* TODO(i18n) */}
                Sin foto
              </Link>
            </li>
            {/*
              Tercer destino. También neutro: el producto se compra igual. Se
              separa de "Sin foto" porque el arreglo es distinto —ahí falta
              subir una foto; aquí hay una fila que apunta a un objeto que no
              está— y porque juntarlos volvería a esconder el segundo caso.
            */}
            <li>
              <Link
                href="/admin/catalogo?ver=foto-rota"
                aria-current={brokenImageOnly ? "true" : undefined}
                className={`flex h-9 items-center rounded-full px-3 text-xs font-medium transition-colors duration-200 ease-out ${
                  brokenImageOnly
                    ? "bg-black text-white"
                    : "border border-line bg-white text-gray-700 hover:border-black hover:text-black"
                }`}
              >
                {/* TODO(i18n) */}
                Foto rota
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      {/* Skeleton por <Suspense>, no por loading.tsx (ver AdminSkeleton). */}
      <Suspense
        key={`${view}-${status}-${query}-${page}`}
        fallback={<AdminSkeleton rows={4} />}
      >
        {unsellableOnly ? (
          <UnsellableList />
        ) : withoutImageOnly ? (
          <WithoutImageList />
        ) : brokenImageOnly ? (
          <BrokenImageList />
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

/**
 * Publicados sin foto (incremento P2).
 *
 * Es el destino del aviso del resumen, y usa EXACTAMENTE el mismo constructor
 * de consulta que lo contó (`withoutImageQuery`), así que el número y la lista
 * no pueden discrepar — la lección de 5B, aplicada aquí sin función SQL porque
 * PostgREST sí sabe expresar este `NOT EXISTS`.
 *
 * NO es un problema de compra: estos productos se venden. Por eso el vacío se
 * redacta en positivo y la lista no lleva ni rojo ni lenguaje de urgencia.
 */
async function WithoutImageList() {
  const market = await getActiveMarket();
  const [products, total] = await Promise.all([
    listProductsWithoutImage(market),
    countProductsWithoutImage(market),
  ]);

  if (products.length === 0) {
    return (
      <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
        {/* TODO(i18n) */}
        Todos los productos publicados tienen al menos una foto.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-black">
        {/* TODO(i18n) */}
        Publicados sin ninguna foto ({total})
      </h2>
      <p className="text-xs text-gray-400">
        {/* TODO(i18n) */}
        Se venden y su ficha funciona, pero el cliente ve un recuadro gris en
        lugar del producto. Cada enlace lleva directo a subir la foto.
      </p>
      <ul className="flex flex-col gap-1.5">
        {products.map((product) => (
          <li key={product.id}>
            {/*
              PRODUCTO → SIN FOTO → SUBIR FOTO, en un toque (incremento 19).
              Antes el enlace dejaba al administrador arriba del formulario de
              edición, con las imágenes a varias pantallas de scroll en un
              móvil. El ancla "imagenes" ya existía en la ficha desde el CMS.
            */}
            <Link
              href={`/admin/catalogo/${product.id}#imagenes`}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3 text-sm transition-colors duration-200 ease-out hover:border-black"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-black">{product.name}</span>
                <span className="truncate font-mono text-xs text-gray-400">
                  {product.slug}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-black">
                {/* TODO(i18n) */}
                Subir foto →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* Un límite callado haría creer que están todos. */}
      {total > products.length ? (
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Se muestran los {products.length} primeros de {total}.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Fotos rotas (incremento 10).
 *
 * La lista es de FILAS, no de productos: lo que hay que arreglar es cada foto,
 * y un producto puede tener una buena y una rota. El encabezado, en cambio,
 * cuenta PRODUCTOS, que es lo que también cuenta el aviso del panel de inicio —
 * los dos números salen de la misma llamada, así que no pueden discrepar.
 *
 * Sin paginación y sin límite: si esta lista se hace larga, el problema no es
 * la lista.
 */
async function BrokenImageList() {
  const market = await getActiveMarket();
  const images = await listBrokenProductImages(market);
  const products = new Set(images.map((image) => image.productId)).size;

  if (images.length === 0) {
    return (
      <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
        {/* TODO(i18n) */}
        Todas las fotos del catálogo existen en el almacenamiento.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-black">
        {/* TODO(i18n) */}
        Fotos que ya no están ({images.length} en{" "}
        {products === 1 ? "1 producto" : `${products} productos`})
      </h2>
      <p className="text-xs text-gray-400">
        {/* TODO(i18n) */}
        La ficha dice que el producto tiene foto, pero el archivo no está en el
        almacenamiento: el cliente ve un hueco y al compartir el enlace no sale
        ninguna imagen. Se arreglan borrando la foto rota desde la ficha y
        subiendo otra.
      </p>
      <ul className="flex flex-col gap-1.5">
        {images.map((image) => (
          <li key={image.imageId}>
            <Link
              href={`/admin/catalogo/${image.productId}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-line bg-white px-4 py-3 text-sm transition-colors duration-200 ease-out hover:border-black"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-black">{image.productName}</span>
                {image.isPrimary ? (
                  <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {/* TODO(i18n) */}
                    principal
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 truncate font-mono text-xs text-gray-400">
                {image.imageUrl}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
