/**
 * Slugs de catálogo (Fase 8).
 *
 * Función pura, sin I/O: el slug se genera y se valida aquí, y la unicidad la
 * garantiza la BD con `unique (market_id, slug)` en `products` y `categories`.
 * No se comprueba unicidad en TypeScript: sería una condición de carrera.
 */

const MAX_SLUG_LENGTH = 80;

/**
 * "Camiseta Sendero Oversize" → "camiseta-sendero-oversize".
 *
 * `normalize("NFD")` separa la tilde de la letra y el rango unicode la borra,
 * así que "Pantalón" da "pantalon" y no "pantaln". La ñ se trata aparte: al
 * descomponerla quedaría "n" a secas, que es lo correcto para una URL.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

export type SlugResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Valida un slug escrito a mano por el admin. Se normaliza primero: si lo que
 * escribió no sobrevive a `slugify` intacto, se rechaza en vez de "arreglarlo"
 * en silencio — el admin debe ver la URL real que va a quedar.
 */
export function parseSlug(raw: string): SlugResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "El slug no puede estar vacío." };
  }
  if (trimmed.length > MAX_SLUG_LENGTH) {
    return { ok: false, error: `El slug no puede superar ${MAX_SLUG_LENGTH} caracteres.` };
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmed)) {
    return {
      ok: false,
      error: "El slug solo admite minúsculas, números y guiones simples (ej. camiseta-sendero).",
    };
  }
  return { ok: true, value: trimmed };
}
