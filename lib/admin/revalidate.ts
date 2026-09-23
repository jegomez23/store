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
 * Ajustes nombre/frase/email   TÍTULO, Header, Footer  revalidateStorefront()
 *   /redes (inc. 15 y 16)        Open Graph y portada
 * Ajustes LOGO subir/quitar    Header de toda la       revalidateStorefront()
 *   (incremento 17)              tienda + portada OG
 * Entrega crear/editar/borrar  FICHA y CARRITO dicen   revalidateStorefront()
 *   (inc. 9, ampliado en el 19)   el coste del envío
 * Pedido cancelado             fichas de los productos revalidateProducts(slugs)
 *   (devuelve stock, DEC-033)    del pedido + home
 *
 * Desde el incremento 15 esa invalidación **ya no es preventiva**: el Footer
 * pinta `store_name`, `contact_email` y las redes en TODAS las páginas de la
 * tienda, así que sin `revalidateStorefront()` el administrador vería su email
 * guardado y el cliente seguiría viendo el anterior hasta 5 minutos. Antes de
 * ese incremento el comentario avisaba de que esto pasaría; ahora pasa.
 *
 * El incremento 16 amplía ese alcance y conviene tenerlo presente antes de
 * "optimizar" esta llamada a algo más fino: `store_name` y `tagline` salen en
 * el `<title>` y el `<meta description>` de TODAS las páginas de la tienda, en
 * el logo del Header, en el Footer, en el Open Graph de la home y de cada
 * ficha, y en `app/opengraph-image.tsx` —que desde ese incremento es ISR de 5
 * min y cuelga del layout raíz, así que `revalidatePath("/", "layout")` la
 * alcanza—. No hay una ruta literal que baste: lo que cambia es el chrome.
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
