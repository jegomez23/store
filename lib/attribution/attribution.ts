/**
 * Atribución de marketing (Incremento 14) — MÓDULO PURO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ ES Y QUÉ NO ES
 * ─────────────────────────────────────────────────────────────────────────
 * Es la respuesta a "¿de qué anuncio vino este pedido?", y nada más. NO es
 * analítica, NO es un perfil del cliente y NO contiene ni un dato personal:
 * las claves permitidas son siete y están escritas abajo. El teléfono y el
 * nombre viven en `customers`, que es su sitio.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FIRST TOUCH DENTRO DE LA SESIÓN DE PESTAÑA
 * ─────────────────────────────────────────────────────────────────────────
 * Se guarda la PRIMERA campaña que trajo a la persona y no se toca más
 * mientras dure la sesión. Si alguien entra por Instagram, se va a mirar y
 * vuelve desde una búsqueda, el pedido sigue siendo de Instagram — que es
 * quien lo pagó. Last-touch le daría el mérito al último clic, que en una
 * tienda con una sola campaña activa suele ser el propio remarketing.
 *
 * La "sesión" es la de `sessionStorage`: una pestaña. Se cierra la pestaña y
 * la atribución desaparece. Es deliberado: no hay cookies propias de
 * seguimiento, no hay identificador persistente y no hay nada que consentir
 * más allá del almacenamiento técnico de la propia compra (el carrito ya usa
 * `localStorage`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTA VALIDACIÓN NO ES LA AUTORIDAD
 * ─────────────────────────────────────────────────────────────────────────
 * `create_order` (migración 0040) vuelve a filtrar por la MISMA lista blanca
 * dentro de la transacción, porque `anon` puede llamarla por POST sin pasar
 * por la tienda. Lo de aquí sirve para no mandar basura por la red.
 *
 * Sin I/O ni imports de runtime: ejecutable con `node --test` (DEC-025).
 */

/** Las ÚNICAS claves que se guardan. Cualquier otra se descarta. */
export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  /** Identificador de clic de Meta. Permite reconstruir `fbc` el día que haya Pixel. */
  "fbclid",
  /** Ruta —sin query— por la que se entró. Dice a qué apuntaba el anuncio. */
  "landing_path",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

/** Mismo tope que el `left(..., 200)` de la migración 0040. */
export const ATTRIBUTION_VALUE_MAX = 200;

/** Clave de `sessionStorage`. Versionada por si el formato cambiara. */
export const ATTRIBUTION_STORAGE_KEY = "yi_attribution_v1";

/** Caracteres de control: el equivalente de `[[:cntrl:]]` de PostgreSQL. */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/**
 * Recorta un valor y le quita los caracteres de control.
 *
 * No se "corrige" nada más: una campaña se llama como la llamó quien la creó,
 * y normalizar mayúsculas o acentos rompería la agrupación posterior.
 */
function clean(raw: string): string | null {
  const trimmed = raw.replace(CONTROL_CHARS, "").trim().slice(0, ATTRIBUTION_VALUE_MAX);
  return trimmed === "" ? null : trimmed;
}

/**
 * Deja un objeto de atribución con SOLO las claves permitidas y valores
 * limpios. Devuelve `null` si no queda nada: un pedido sin campaña tiene
 * `attribution = null`, no un objeto vacío que habría que interpretar.
 *
 * Nunca lanza. Cualquier cosa que no sea un objeto plano se trata como
 * ausencia (ATRIBUCIÓN FALLIDA ≠ CHECKOUT FALLIDO).
 */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const result: Attribution = {};

  for (const key of ATTRIBUTION_KEYS) {
    const value = source[key];
    // Solo cadenas: un número o un objeto anidado no es una etiqueta de
    // campaña, es alguien probando qué pasa.
    if (typeof value !== "string") continue;
    const cleaned = clean(value);
    if (cleaned !== null) result[key] = cleaned;
  }

  return Object.keys(result).length === 0 ? null : result;
}

/**
 * Lee la atribución de una query string de entrada.
 *
 * `landing_path` NO viene de la URL: lo pone quien llama, con la ruta ya
 * separada de la query. Guardar la URL entera arrastraría parámetros que no
 * hemos pedido y que podrían contener cualquier cosa.
 */
export function parseAttributionFromSearch(
  search: string,
  landingPath?: string,
): Attribution | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const raw: Record<string, unknown> = {};
  for (const key of ATTRIBUTION_KEYS) {
    if (key === "landing_path") continue;
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }

  // Sin ningún parámetro de campaña no hay atribución que guardar: la ruta de
  // aterrizaje sola no dice de dónde vino nadie.
  if (Object.keys(raw).length === 0) return null;

  if (landingPath) raw.landing_path = landingPath;

  return sanitizeAttribution(raw);
}

/**
 * Texto corto para el panel: "instagram · paid · lanzamiento".
 *
 * El administrador no necesita el JSON: necesita saber de un vistazo si el
 * pedido lo trajo un anuncio. Devuelve `null` cuando no hay nada que decir.
 */
export function describeAttribution(raw: unknown): string | null {
  const attribution = sanitizeAttribution(raw);
  if (!attribution) return null;

  const parts = [
    attribution.utm_source,
    attribution.utm_medium,
    attribution.utm_campaign,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    // Un clic de Meta sin UTMs sigue siendo información: vino de un anuncio.
    return attribution.fbclid ? "Anuncio de Meta" : null;
  }
  return parts.join(" · ");
}
