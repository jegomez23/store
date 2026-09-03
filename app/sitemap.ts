import type { MetadataRoute } from "next";
import { getSitemapProducts } from "@/lib/data/products";
import { getActiveMarket } from "@/lib/markets";
import { absoluteUrl, normalizeSiteUrl, productPath } from "@/lib/seo/urls";

/**
 * `sitemap.xml` (Fase 9, `docs/09-SEO-PERFORMANCE.md` §1).
 *
 * QUÉ ENTRA: la home y las fichas de producto PUBLICADAS del mercado activo.
 * `getSitemapProducts()` aplica los mismos filtros que la ficha pública
 * (`status='active'`, `deleted_at is null`, mercado), así que un borrador o un
 * producto eliminado nunca llega aquí. Nada de datos privados: el sitemap solo
 * repite URLs que ya son públicas.
 *
 * QUÉ NO ENTRA, y por qué:
 * - `/categoria/[slug]`: la ruta NO existe en `app/`. `09-SEO-PERFORMANCE.md`
 *   §1 la describe, pero listarla mandaría a Google a un 404.
 * - `/info/[slug]`: mismo caso, tampoco existe.
 * - `/carrito`, `/checkout`, `/pedido/[numero]`: no indexables a propósito
 *   (`robots.ts` las deniega y su metadata lleva `index: false`).
 * - `/admin/**`: privado.
 *
 * CACHÉ: `sitemap.ts` es un Route Handler cacheado por Next. Se invalida desde
 * el panel con `revalidateSitemap()` en cada mutación que cambia el conjunto de
 * productos publicados (ver `lib/admin/revalidate.ts`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const market = await getActiveMarket();
  const products = await getSitemapProducts(market);

  const home: MetadataRoute.Sitemap[number] = {
    url: absoluteUrl(siteUrl, "/"),
    lastModified: products[0]?.lastModified ?? new Date(),
    changeFrequency: "daily",
    priority: 1,
  };

  return [
    home,
    ...products.map((product) => ({
      url: absoluteUrl(siteUrl, productPath(product.slug)),
      lastModified: product.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
