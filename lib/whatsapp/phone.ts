/**
 * Normalización de teléfonos y construcción del enlace wa.me (Fase 6).
 *
 * ÚNICO lugar del proyecto donde se arma una URL de WhatsApp. Prohibido
 * escribir `https://wa.me/...` en componentes (docs/rules/backend.md #15).
 *
 * Módulo puro: sin I/O, testeable sin red.
 */

/** Longitudes de E.164: mínimo razonable y máximo del estándar (15) con holgura. */
const MIN_DIGITS = 6;
const MAX_DIGITS = 20;

/**
 * Normaliza a E.164 SIN el '+', que es el formato que guarda
 * `settings.whatsapp_number` (docs/03-DATABASE.md §2.16: `573001234567`) y el
 * que espera wa.me.
 *
 * Acepta lo que escriba una persona (`+34 600 11 22 33`, `0034-600-112233`) y
 * devuelve `null` si no queda un número usable — nunca lanza.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  let digits = value.replace(/[^0-9]/g, "");

  // Prefijo internacional escrito como '00': se convierte al formato E.164.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}

/**
 * Construye la URL de wa.me.
 *
 * Devuelve `null` si el número no es utilizable, para que el llamante lo
 * traduzca a `CHECKOUT_NOT_CONFIGURED` en vez de generar un enlace roto.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  // encodeURIComponent preserva saltos de línea y emojis del mensaje
  // (docs/06-WHATSAPP.md §2 "Reglas de generación").
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * "CONFIGURADO" NO ES LO MISMO QUE "VÁLIDO" (incremento 10)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `normalizePhone('34600000000')` devuelve `'34600000000'`: son 11 dígitos y
 * pasa todas las comprobaciones de forma. Y sin embargo ese número es el
 * PLACEHOLDER que siembra `supabase/seed/05_settings_and_shipping_es.sql`, un
 * archivo que dice de sí mismo: «whatsapp_number es un número de prueba, NO
 * real».
 *
 * Consecuencia medida antes de escribir esto: el checkout creaba el pedido y
 * mandaba al cliente a `wa.me/34600000000`. El cliente creía haber escrito a
 * la tienda, el pedido quedaba `pending` y **nadie se enteraba**.
 *
 * ⚠️ AQUÍ NO SE INVENTA NINGUNA REGLA DE NEGOCIO. No se intenta adivinar qué
 * números "parecen falsos": la lista contiene EXACTAMENTE los valores que el
 * propio repositorio siembra como marcador de posición, ni uno más. Un número
 * real que empiece por 600 es perfectamente válido y debe seguir siéndolo.
 *
 * El test `phone.test.ts` lee el archivo de seed y falla si el valor sembrado
 * deja de estar en esta lista: una sola fuente de verdad, como
 * `ACTION_BODY_LIMIT_BYTES` en `next.config.ts`.
 */
export const PLACEHOLDER_WHATSAPP_NUMBERS: readonly string[] = ["34600000000"];

/** ¿Es el número que el seed pone para que la tienda arranque? */
export function isPlaceholderWhatsAppNumber(
  value: string | null | undefined,
): boolean {
  const normalized = normalizePhone(value);
  return normalized !== null && PLACEHOLDER_WHATSAPP_NUMBERS.includes(normalized);
}

/**
 * ÚNICO predicado de «la tienda puede vender por WhatsApp».
 *
 * Lo usan el checkout (para no crear un pedido que nadie va a recibir) y el
 * panel (para avisar). Que sea uno solo es lo que impide que la tienda diga
 * en el panel que está lista mientras el checkout piensa lo contrario.
 */
export function isWhatsAppConfigured(value: string | null | undefined): boolean {
  return normalizePhone(value) !== null && !isPlaceholderWhatsAppNumber(value);
}
