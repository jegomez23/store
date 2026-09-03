import { revalidatePath } from "next/cache";

/**
 * Invalidación de la tienda tras una mutación del panel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MATRIZ: MUTACIÓN → QUÉ QUEDA OBSOLETO → QUÉ SE INVALIDA
 * ─────────────────────────────────────────────────────────────────────────
 * Producto crear (nace draft)  nada público            sitemap no cambia → nada
 * Producto editar              su ficha, home, sitemap revalidateProductAndHome(slug)
 *   (si cambia el slug: también la ficha ANTIGUA → dos llamadas)
 * Producto publicar/retirar    ficha, home, sitemap    revalidateProductAndHome(slug)
 * Producto archivar/eliminar   ficha, home, sitemap    revalidateProductAndHome(slug)
 * Variante precio/stock/activa ficha, home             revalidateProductAndHome(slug)
 * Imagen añadir/quitar/orden   ficha, home             revalidateProductAndHome(slug)
 * Imagen principal             ficha, home             revalidateProductAndHome(slug)
 * Categoría crear/editar/borrar  MENÚ de TODAS las     revalidateStorefront()
 *   activar/desactivar/parent    páginas + home
 * Home bloque editar/orden     home                    revalidateHome()
 * Ajustes WhatsApp             /checkout               revalidatePath("/checkout")
 * Ajustes nombre/email/redes   nada público hoy(*)     revalidateStorefront()
 * Pedido cancelado             fichas de los productos revalidateProducts(slugs)
 *   (devuelve stock, DEC-033)    del pedido + home
 *
 * (*) `settings.store_name`, `contact_email` y las redes NO se pintan hoy en
 * ninguna página pública: el Footer y el logo del Header son texto fijo. Se
 * invalida igualmente porque en cuanto el Footer los lea dejaría de hacerlo, y
 * un fallo de caché silencioso es peor que una invalidación de más.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTAS PRIMITIVAS Y NO OTRAS
 * ─────────────────────────────────────────────────────────────────────────
 * - **Ruta LITERAL, nunca patrón** (DEC-037). Medido sobre el build servido en
 *   Fase 8: `revalidatePath("/producto/[slug]", "page")` no invalidaba las
 *   fichas que `generateStaticParams` había prerenderizado —seguían en
 *   `x-nextjs-cache: HIT` tras despublicar—, de modo que un producto retirado
 *   se seguía pudiendo comprar. Fase 9 elimina del código todas las llamadas
 *   por patrón que quedaban.
 * - **`revalidatePath("/", "layout")` para lo global.** Los docs de Next 16
 *   (`revalidatePath.md`, "Revalidating all data") dicen que invalida el layout
 *   indicado, todos los anidados y todas las páginas por debajo. Medido tres
 *   veces seguidas sobre el build servido: tras borrar una categoría, `/` y
 *   `/producto/<slug>` responden `MISS` y ya no muestran esa categoría en el
 *   menú. Es un martillo —invalida toda la tienda—, y es justo lo que hace
 *   falta cuando cambia el chrome, porque el menú de categorías vive en el
 *   layout de `(store)` y lo pintan TODAS las páginas.
 * - **Tags: siguen sin existir.** `revalidateTag`/`updateTag` solo tienen algo
 *   que invalidar si los datos se leen con `fetch` etiquetado o `unstable_cache`.
 *   El data layer usa el cliente de Supabase (`lib/supabase/static.ts`), así que
 *   hoy no hay ninguna etiqueta. Migrarlo exigiría reescribir `lib/data/*`
 *   entero para ganar granularidad que un catálogo de este tamaño no necesita:
 *   las rutas afectadas se conocen exactamente en cada mutación.
 * - **NO `force-dynamic`.** La tienda es SSG + ISR de 5 min por diseño (DEC-004,
 *   DEC-021, `02-ARCHITECTURE.md` §3). Convertirla en dinámica para "resolver"
 *   la invalidación destruiría esa estrategia — exactamente lo que DEC-021
 *   prohíbe hacer para tapar una limitación.
 */

/** Ficha de UN producto concreto, por ruta literal. */
export function revalidateProduct(slug: string): void {
  revalidatePath(`/producto/${slug}`);
}

/** Home: destacados, menú de categorías y bloques editoriales. */
export function revalidateHome(): void {
  revalidatePath("/");
}

/**
 * `sitemap.xml` es un Route Handler cacheado por Next: si no se invalida, un
 * producto recién publicado tarda en aparecer y uno retirado sigue anunciado a
 * Google. Se invalida en toda mutación que cambie el conjunto de productos
 * publicados o su `updated_at`.
 */
export function revalidateSitemap(): void {
  revalidatePath("/sitemap.xml");
}

/** Cambio en un producto concreto: su ficha, la home y el sitemap. */
export function revalidateProductAndHome(slug: string): void {
  revalidateProduct(slug);
  revalidateHome();
  revalidateSitemap();
}

/** Varias fichas a la vez (pedido cancelado: N líneas, N productos). */
export function revalidateProducts(slugs: readonly string[]): void {
  for (const slug of new Set(slugs)) revalidateProduct(slug);
  revalidateHome();
}

/**
 * Cambios de alcance global: menú de categorías y ajustes de tienda. Afectan al
 * layout de `(store)`, que envuelve la home y todas las fichas.
 */
export function revalidateStorefront(): void {
  revalidatePath("/", "layout");
  revalidateSitemap();
}
