import type { Metadata } from "next";
import Link from "next/link";
import { NewProductFlow } from "@/components/admin/NewProductFlow";
import { resolveAssistantAvailability } from "@/lib/ai/availability";
import { createGeminiProductAssistant } from "@/lib/ai/gemini-assistant";
import { getFullSettingsForAdmin, listCategoriesForAdmin } from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";

/**
 * Crear producto (incremento 20).
 *
 * La pantalla ya no monta `ProductForm`: ese formulario tiene sentido para
 * EDITAR una ficha que ya existe —trece campos, todos con su dato dentro—, pero
 * como puerta de entrada pedía trece decisiones antes de la primera. Aquí solo
 * se decide lo que hace falta para que el producto exista; el resto se edita
 * después en la ficha, con `ProductForm` intacto.
 *
 * La pantalla funciona igual con la IA apagada, sin proveedor configurado o
 * con el proveedor caído: el botón de analizar queda desactivado y dice cuál
 * de las tres cosas pasa. El estado se resuelve en el SERVIDOR —donde viven la
 * clave y el ajuste— y al cliente solo viaja cuál de los tres es (DEC-087).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Añadir producto",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  const market = await getActiveMarket();
  const [categories, settings] = await Promise.all([
    listCategoriesForAdmin(market),
    getFullSettingsForAdmin(market),
  ]);

  const availability = resolveAssistantAvailability({
    enabled: settings?.aiAssistEnabled ?? false,
    configured: createGeminiProductAssistant().isConfigured(),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/catalogo"
          className="inline-flex min-h-11 items-center text-sm text-gray-700 underline-offset-2 hover:text-black hover:underline"
        >
          {/* TODO(i18n) */}
          ← Catálogo
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          {/* TODO(i18n) */}
          Añadir producto
        </h1>
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
        <NewProductFlow
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
          }))}
          availability={availability}
        />
      )}
    </div>
  );
}
