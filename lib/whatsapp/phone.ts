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
