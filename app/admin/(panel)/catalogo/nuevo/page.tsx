import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { listCategoriesForAdmin } from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo producto",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  const market = await getActiveMarket();
  const categories = await listCategoriesForAdmin(market);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/catalogo"
          className="text-sm text-gray-700 underline-offset-2 hover:text-black hover:underline"
        >
          {/* TODO(i18n) */}
          ← Catálogo
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          {/* TODO(i18n) */}
          Nuevo producto
        </h1>
        <p className="text-sm text-gray-700">
          {/* TODO(i18n) */}
          Se crea como borrador. Después añades variantes e imágenes y lo
          publicas.
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Necesitas al menos una categoría antes de crear un producto.{" "}
          <Link href="/admin/categorias" className="underline underline-offset-2">
            Crear categoría
          </Link>
          .
        </p>
      ) : (
        <ProductForm product={null} categories={categories} />
      )}
    </div>
  );
}
