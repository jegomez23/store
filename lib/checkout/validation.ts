import type { CheckoutErrorCode } from "./errors.ts";
import type { CheckoutInput, CheckoutLineRef } from "./types.ts";

/**
 * Validación del payload del checkout (Fase 6) — LÓGICA PURA.
 *
 * Es la PRIMERA barrera, no la única ni la definitiva: `create_order` repite
 * todas estas comprobaciones dentro de PostgreSQL. Esta capa existe para dar
 * errores rápidos y claros al usuario, no para proteger la BD — una Server
 * Action es un endpoint público y el cliente puede saltársela.
 *
 * Sin Zod (DEC-029): el input no confiable es diminuto (uuid + entero + dos
 * strings) y lo que de verdad importa —que la variante exista, esté activa y
 * tenga stock— no se puede validar con un esquema, solo contra la BD.
 *
 * Solo imports `import type`: ejecutable bajo `node --test` sin bundler.
 */

/** Debe coincidir con el tope por línea del carrito (`MAX_QUANTITY_PER_LINE`). */
export const MAX_QUANTITY_PER_LINE = 99;
/** Tope de líneas por pedido; el mismo que aplica `create_order`. */
export const MAX_LINES_PER_ORDER = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_QUANTITY_PER_LINE
  );
}

/**
 * Un teléfono es aceptable si, quitando todo lo que no sea dígito, quedan
 * entre 6 y 20 cifras. No se valida el país: el usuario puede escribirlo con
 * prefijo, espacios o guiones y se normaliza después.
 */
export function isValidPhone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 6 && digits.length <= 20;
}

export function isValidName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 120;
}

export type ValidationResult =
  | { ok: true; input: CheckoutInput }
  | { ok: false; error: CheckoutErrorCode };

/**
 * Valida y normaliza un payload desconocido.
 *
 * Devuelve un `CheckoutInput` normalizado (nombre recortado, ítems ordenados
 * por `variantId`) para que el fingerprint de idempotencia no dependa del
 * orden en que la UI mande las líneas.
 */
export function validateCheckoutInput(value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "INVALID_INPUT" };
  }
  const raw = value as Record<string, unknown>;

  if (!isUuid(raw.clientRequestId)) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  if (!Array.isArray(raw.items)) {
    return { ok: false, error: "INVALID_INPUT" };
  }
  if (raw.items.length === 0) {
    return { ok: false, error: "EMPTY_CART" };
  }
  if (raw.items.length > MAX_LINES_PER_ORDER) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  const items: CheckoutLineRef[] = [];
  const seen = new Set<string>();

  for (const candidate of raw.items) {
    if (typeof candidate !== "object" || candidate === null) {
      return { ok: false, error: "INVALID_INPUT" };
    }
    const line = candidate as Record<string, unknown>;

    if (!isUuid(line.variantId)) return { ok: false, error: "INVALID_INPUT" };
    if (!isValidQuantity(line.quantity)) return { ok: false, error: "INVALID_INPUT" };

    const variantId = line.variantId.toLowerCase();
    // Dos líneas de la misma variante serían ambiguas: la UI nunca las genera
    // (el carrito fusiona por variantId), así que es un payload manipulado.
    if (seen.has(variantId)) return { ok: false, error: "INVALID_INPUT" };
    seen.add(variantId);

    items.push({ variantId, quantity: line.quantity });
  }

  const customerRaw = raw.customer;
  if (typeof customerRaw !== "object" || customerRaw === null) {
    return { ok: false, error: "INVALID_INPUT" };
  }
  const customer = customerRaw as Record<string, unknown>;

  if (!isValidPhone(customer.phone)) {
    return { ok: false, error: "INVALID_CUSTOMER_PHONE" };
  }
  if (!isValidName(customer.name)) {
    return { ok: false, error: "INVALID_CUSTOMER_NAME" };
  }

  const sourceUrl =
    typeof raw.sourceUrl === "string" && raw.sourceUrl.length > 0
      ? raw.sourceUrl.slice(0, 500)
      : undefined;

  return {
    ok: true,
    input: {
      items: items.sort((a, b) => a.variantId.localeCompare(b.variantId)),
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
      },
      clientRequestId: raw.clientRequestId.toLowerCase(),
      sourceUrl,
    },
  };
}
