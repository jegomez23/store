import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductImages } from "@/components/admin/ProductImages";
import { ProductStatusToggle } from "@/components/admin/ProductStatusToggle";
import { DeleteProductButton } from "@/components/admin/DeleteProductButton";
import { VariantMatrix } from "@/components/admin/VariantMatrix";
import { ProductChangeLog } from "@/components/admin/ProductChangeLog";
import { PRODUCT_STATUS_LABELS } from "@/lib/admin/catalog";
import { isUuid } from "@/lib/admin/products";
import { listProductChanges } from "@/lib/data/admin/catalog";
import {
  getProductForAdmin,
  listCategoriesForAdmin,
  listColors,
  listSizes,
} from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editar producto",
  robots: { index: false, follow: false },
};

/**
 * Edición de producto. Las cuatro áreas que pide `05-ADMIN.md` §4.1 están
 * separadas: General, SEO (ambas dentro de `ProductForm`), Variantes e
 * Imágenes.
 *
 * Sin `<Suspense>`: esta ruta llama a `notFound()` y un shell enviado antes de
 * tiempo comprometería el 200 (ver `components/admin/AdminSkeleton.tsx`).
 */
export default async function EditProductPage(
  props: PageProps<"/admin/catalogo/[id]">,
) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();

  const market = await getActiveMarket();
  const product = await getProductForAdmin(market, id);
  if (!product) notFound();

  // En paralelo: son cuatro consultas independientes sobre la misma pagina.
  const [categories, colors, sizes, changes] = await Promise.all([
    listCategoriesForAdmin(market),
    listColors(),
    listSizes(),
    listProductChanges(product.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/catalogo"
          className="text-sm text-gray-700 underline-offset-2 hover:text-black hover:underline"
        >
          {/* TODO(i18n) */}
          ← Catálogo
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
              {product.name}
            </h1>
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
          <ProductStatusToggle productId={product.id} status={product.status} />
        </div>
        <p className="text-sm text-gray-700">
          {product.status === "active" ? (
            <Link
              href={`/producto/${product.slug}`}
              className="underline-offset-2 hover:underline"
            >
              /producto/{product.slug}
            </Link>
          ) : (
            <span className="text-gray-400">/producto/{product.slug}</span>
          )}
        </p>
      </div>

      <ProductForm product={product} categories={categories} />

      <section aria-labelledby="variantes" className="flex flex-col gap-3">
        {/* TODO(i18n) */}
        <h2 id="variantes" className="text-base font-medium text-black">
          Variantes
        </h2>
        <VariantMatrix
          product={product}
          colors={colors}
          sizes={sizes}
          currencyCode={market.currencyCode}
        />
      </section>

      <section aria-labelledby="imagenes" className="flex flex-col gap-3">
        {/* TODO(i18n) */}
        <h2 id="imagenes" className="text-base font-medium text-black">
          Imágenes
        </h2>
        <ProductImages productId={product.id} images={product.images} />
      </section>

      {/*
        Historial (Fase 9.5, 5C). Va DESPUÉS de las cosas que se editan y ANTES
        de eliminar: es lo que se consulta cuando algo no cuadra, justo antes de
        decidir. No hay un "centro de auditoría" porque la pregunta —"¿quién
        cambió este precio?"— se hace mirando el producto.
      */}
      <section aria-labelledby="historial" className="flex flex-col gap-3">
        {/* TODO(i18n) */}
        <h2 id="historial" className="text-base font-medium text-black">
          Historial de cambios
        </h2>
        <ProductChangeLog entries={changes} market={market} />
      </section>

      <section aria-labelledby="peligro" className="flex flex-col gap-3">
        {/* TODO(i18n) */}
        <h2 id="peligro" className="text-base font-medium text-black">
          Eliminar
        </h2>
        <div className="flex flex-col gap-3 rounded-md border border-line bg-white p-4">
          <p className="text-sm text-gray-700">
            {/* TODO(i18n) */}
            El producto se retira de la tienda y deja de aparecer en el panel.
            No se borra de la base de datos: los pedidos que lo contengan
            conservan su historial.
          </p>
          <DeleteProductButton productId={product.id} productName={product.name} />
        </div>
      </section>
    </div>
  );
}
