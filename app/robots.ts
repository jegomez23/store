import type { MetadataRoute } from "next";
import {
  DISALLOWED_PREFIXES,
  NOINDEX_ROUTES,
  normalizeSiteUrl,
  sitemapUrl,
} from "@/lib/seo/urls";

/**
 * `robots.txt` (Fase 9, `docs/09-SEO-PERFORMANCE.md` §1: "permite todo
 * público; deniega /admin, /api").
 *
 * ESTO NO ES SEGURIDAD. `robots.txt` es una petición educada a los crawlers
 * que se portan bien: cualquiera puede leerlo e ir justo a lo que prohíbe.
 * Lo que impide realmente el acceso al panel es la cadena de Fase 7:
 * `proxy.ts` (sesión) → layout (`is_admin()`) → `requireAdmin()` en cada
 * Server Action y en cada función de `lib/data/admin/` → RLS en PostgreSQL.
 * Si algún día alguien "arregla" un fallo de acceso tocando este archivo,
 * está arreglando lo que no es.
 *
 * Se deniegan también las rutas públicas sin valor de indexación (carrito,
 * checkout, confirmación de pedido), que ya llevan `robots: { index: false }`
 * en su metadata. El `Disallow` evita además que se gaste presupuesto de
 * rastreo en ellas.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_PREFIXES, ...NOINDEX_ROUTES],
    },
    sitemap: sitemapUrl(siteUrl),
  };
}
