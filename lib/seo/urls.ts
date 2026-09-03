/**
 * URLs canónicas de la tienda (Fase 9, `docs/09-SEO-PERFORMANCE.md` §1).
 *
 * Módulo PURO: sin imports de runtime, para poder testearlo con `node:test`
 * (DEC-025). La URL base la inyecta quien llama; en la app viene de
 * `NEXT_PUBLIC_SITE_URL`, la misma variable que ya alimenta `metadataBase`.
 *
 * POR QUÉ NO SE CONSTRUYEN URLs DE CATEGORÍA: la ruta `/categoria/[slug]` que
 * describe `09-SEO-PERFORMANCE.md` §1 **no existe** en `app/`. Meterla en el
 * sitemap sería publicar 404 a Google. Se documenta como pendiente en vez de
 * inventarla.
 */

/** Rutas públicas indexables que existen hoy en `app/(store)`. */
export const PUBLIC_ROUTES = ["/"] as const;

/**
 * Rutas públicas pero NO indexables: no aportan nada a un buscador y algunas
 * dependen de estado local (carrito) o de un identificador de pedido.
 */
export const NOINDEX_ROUTES = ["/carrito", "/checkout", "/pedido"] as const;

/** Prefijos que ningún crawler debe recorrer. */
export const DISALLOWED_PREFIXES = ["/admin", "/api"] as const;

const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Normaliza la URL base: sin barra final, con protocolo. Si la variable falta
 * o es inválida se cae a localhost — igual que `metadataBase` en el layout
 * raíz, para no romper el build en desarrollo (DEC-021).
 */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const candidate = (raw ?? "").trim();
  if (!candidate) return DEFAULT_SITE_URL;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return DEFAULT_SITE_URL;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return DEFAULT_SITE_URL;
  }
  return `${parsed.origin}`;
}

/** Une base + ruta absoluta de la app en una URL absoluta sin dobles barras. */
export function absoluteUrl(siteUrl: string, path: string): string {
  const base = normalizeSiteUrl(siteUrl);
  if (!path.startsWith("/")) return `${base}/${path}`;
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/** Ruta (no URL) de la ficha de un producto. */
export function productPath(slug: string): string {
  return `/producto/${slug}`;
}

/** URL canónica absoluta de la ficha de un producto. */
export function productUrl(siteUrl: string, slug: string): string {
  return absoluteUrl(siteUrl, productPath(slug));
}

/** URL del sitemap, que es lo que `robots.txt` anuncia. */
export function sitemapUrl(siteUrl: string): string {
  return absoluteUrl(siteUrl, "/sitemap.xml");
}
