/**
 * Validación de imágenes de catálogo (Fase 8).
 *
 * REGLA CENTRAL: **no se confía en lo que el cliente dice que es el archivo.**
 * `File.type` lo controla el navegador y se puede falsificar; el
 * `allowed_mime_types` del bucket (migración 0020) confía en la cabecera de la
 * subida, así que tampoco basta. Aquí se leen los primeros bytes del contenido
 * real (magic bytes) y ese es el criterio.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

/** 5 MiB — el mismo valor que `storage.buckets.file_size_limit` (migración 0020). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_FORMATS = ["jpeg", "png", "webp"] as const;
export type ImageFormat = (typeof ACCEPTED_FORMATS)[number];

/**
 * Detecta el formato REAL leyendo la firma del archivo.
 *
 *   JPEG  FF D8 FF
 *   PNG   89 50 4E 47 0D 0A 1A 0A
 *   WebP  "RIFF" .... "WEBP"
 *
 * Devuelve `null` para cualquier otra cosa — incluido SVG, que es texto y
 * puede llevar scripts, y los buckets son de lectura pública.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export type ImageCheck =
  | { ok: true; format: ImageFormat }
  | { ok: false; error: string };

/**
 * `declaredType` (el MIME del navegador) se acepta como pista para dar un
 * mensaje mejor, pero NUNCA decide: manda `detectImageFormat`.
 */
export function checkImageUpload(
  bytes: Uint8Array,
  declaredType: string | undefined,
): ImageCheck {
  if (bytes.length === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    return { ok: false, error: `La imagen pesa ${mb} MB y el máximo son 5 MB.` };
  }

  const format = detectImageFormat(bytes);
  if (format === null) {
    const hint =
      declaredType && declaredType.startsWith("image/")
        ? ` El navegador la declaraba como ${declaredType}, pero su contenido no lo es.`
        : "";
    return {
      ok: false,
      error: `Solo se admiten imágenes JPEG, PNG o WebP.${hint}`,
    };
  }
  return { ok: true, format };
}

export const ALT_TEXT_MAX = 160;

export type AltTextResult = { ok: true; value: string } | { ok: false; error: string };

/** `product_images.alt_text` es NOT NULL: es obligatorio y es accesibilidad. */
export function parseAltText(raw: string): AltTextResult {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 3) {
    return { ok: false, error: "El texto alternativo es obligatorio (mínimo 3 caracteres)." };
  }
  if (value.length > ALT_TEXT_MAX) {
    return { ok: false, error: `El texto alternativo no puede superar ${ALT_TEXT_MAX} caracteres.` };
  }
  return { ok: true, value };
}

/**
 * Ruta del objeto DENTRO del bucket: `{slug}/{uuid}.webp`.
 *
 * NO lleva el nombre del bucket delante: `getPublicUrl()` ya lo antepone, y
 * repetirlo produjo URLs rotas en Fase 3 (bug real, `rules/database.md` #19).
 *
 * El nombre lo genera el servidor: nunca se reutiliza el del cliente
 * (`rules/security.md` #9), así que un `../../evil.svg` no puede escaparse.
 */
export function buildImagePath(productSlug: string, uuid: string): string {
  const safeSlug = productSlug.replace(/[^a-z0-9-]/g, "").slice(0, 80) || "producto";
  return `${safeSlug}/${uuid}.webp`;
}

/**
 * Comprueba que una ruta pertenece al producto indicado. Se usa antes de
 * borrar: sin esto, un `path` manipulado podría apuntar al objeto de otro
 * producto.
 */
export function pathBelongsToProduct(path: string, productSlug: string): boolean {
  const safeSlug = productSlug.replace(/[^a-z0-9-]/g, "").slice(0, 80) || "producto";
  return /^[a-z0-9-]+\/[0-9a-f-]+\.webp$/.test(path) && path.startsWith(`${safeSlug}/`);
}

/**
 * ── Placeholder blur (Fase 9) ─────────────────────────────────────────────
 *
 * `docs/09-SEO-PERFORMANCE.md` §57: "Placeholder blur generado en subida (admin
 * guarda blurDataURL)". Se guarda como data URI WebP en `product_images.blur_data_url`.
 *
 * POR QUÉ EN LA BD Y NO COMO OTRO OBJETO EN STORAGE: un placeholder pesa unos
 * cientos de bytes; servirlo como archivo costaría una petición HTTP extra
 * justo en el momento que se intenta optimizar, y duplicaría el número de
 * objetos del bucket, en contra de DEC-036 ("un objeto por imagen").
 *
 * POR QUÉ 16 PÍXELES: es lo que usa el propio Next para sus placeholders de
 * imágenes locales. Más resolución no se ve —el navegador lo escala y lo
 * difumina— y solo engorda la fila.
 */

/** Ancho del placeholder en píxeles. */
export const BLUR_WIDTH = 16;

/** Prefijo obligatorio del data URI. Igual que el CHECK de la migración 0022. */
export const BLUR_DATA_URL_PREFIX = "data:image/webp;base64,";

/** Límite duro, replicado del CHECK de la migración 0022. */
export const BLUR_DATA_URL_MAX = 4000;

/**
 * Valida un blur ANTES de escribirlo. Solo debería recibir valores generados
 * por `sharp` en el servidor: si algún día alguien intentara aceptar uno del
 * formulario, esta función lo rechazaría igual, y por debajo está el CHECK de
 * PostgreSQL. Nunca se confía en un data URI que venga del navegador.
 */
export function isValidBlurDataUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  if (!value.startsWith(BLUR_DATA_URL_PREFIX)) return false;
  if (value.length < 32 || value.length > BLUR_DATA_URL_MAX) return false;
  const base64 = value.slice(BLUR_DATA_URL_PREFIX.length);
  return base64.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64);
}

/** Compone el data URI a partir de los bytes ya codificados en WebP. */
export function toBlurDataUrl(base64: string): string {
  return `${BLUR_DATA_URL_PREFIX}${base64}`;
}
