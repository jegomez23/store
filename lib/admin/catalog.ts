/**
 * Lógica pura del catálogo en el panel (Fase 7).
 *
 * Alcance deliberado de esta fase (ver reporte de Fase 7): activar/desactivar
 * productos y corregir stock y precio de variantes. NO hay creación de
 * productos, matriz de variantes ni subida de imágenes: eso sigue en
 * `05-ADMIN.md` §4.1 como pendiente, no como implementado.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export function isProductStatus(value: unknown): value is ProductStatus {
  return (
    typeof value === "string" &&
    (PRODUCT_STATUSES as readonly string[]).includes(value)
  );
}

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Borrador",
  active: "Publicado",
  archived: "Archivado",
};

/** Topes de cordura. No sustituyen a los CHECK de la BD: los anticipan. */
export const MAX_STOCK = 100_000;
export const MAX_PRICE = 1_000_000;

export type ParsedNumber =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Stock: entero, sin signo, dentro de rango.
 *
 * Se rechaza cualquier cosa que no sea solo dígitos ANTES de convertir:
 * `Number("1e3")` da 1000 y `Number(" 5 ")` da 5, así que fiarse de `Number`
 * dejaría pasar notación exponencial y espacios. El CHECK `stock >= 0` de la
 * migración 0008 es la última barrera, pero el error debe darse aquí para poder
 * explicarlo.
 */
export function parseStock(raw: string): ParsedNumber {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "El stock debe ser un número entero de 0 o más." };
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value > MAX_STOCK) {
    return { ok: false, error: `El stock no puede superar ${MAX_STOCK}.` };
  }
  return { ok: true, value };
}

/**
 * Precio: `numeric(12,2)`, así que como mucho 2 decimales y nunca negativo.
 * Se acepta coma o punto porque el admin escribe en español.
 */
export function parsePrice(raw: string): ParsedNumber {
  const trimmed = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: "El precio debe ser un número de 0 o más, con 2 decimales como máximo.",
    };
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value > MAX_PRICE) {
    return { ok: false, error: `El precio no puede superar ${MAX_PRICE}.` };
  }
  return { ok: true, value };
}

/**
 * Número de WhatsApp: E.164 sin `+`, exactamente el formato que ya usan
 * `settings.whatsapp_number` y `create_order` (03-DATABASE §2.16). Se normaliza
 * en un solo sitio para que el admin pueda escribirlo como quiera.
 */
export function parseWhatsAppNumber(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 20) {
    return {
      ok: false,
      error: "El número debe tener entre 6 y 20 dígitos, con prefijo de país.",
    };
  }
  return { ok: true, value: digits };
}

/** Una variante bajo su propio umbral necesita atención del admin. */
export function isLowStock(stock: number, threshold: number): boolean {
  return stock <= threshold;
}
