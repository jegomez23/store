/**
 * Validación de los métodos de entrega — LÓGICA PURA (incremento 9).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE ARCHIVO IMPORTA MÁS QUE UN CRUD NORMAL
 * ─────────────────────────────────────────────────────────────────────────
 * Lo que se escribe aquí **decide lo que cobra la tienda**. Desde DEC-063 el
 * precio y el umbral de un método entran directamente en el total del pedido,
 * así que una errata en este formulario no rompe una pantalla: cambia el
 * importe de todas las compras siguientes.
 *
 * Por eso las tres comprobaciones que de verdad importan viven ADEMÁS en
 * PostgreSQL (migración 0036): umbral no negativo, nombre no vacío y nombre
 * único por mercado. Esto es la primera barrera y da mensajes entendibles; la
 * definitiva es la base de datos, que cubre también el PATCH directo.
 *
 * `market_id` NO aparece por ningún lado: lo pone el servidor desde
 * `getActiveMarket()`, nunca el formulario (DEC-035).
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export const SHIPPING_LIMITS = {
  name: 80,
  description: 200,
  /** `numeric(12,2)`: doce dígitos en total. Tope de cordura muy por debajo. */
  amount: 1_000_000,
  sortOrder: 32767,
} as const;

export interface ShippingMethodInput {
  name: string;
  description: string | null;
  price: number;
  freeShippingThreshold: number | null;
  sortOrder: number;
  isActive: boolean;
}

export type ShippingValidation =
  | { ok: true; input: ShippingMethodInput }
  | { ok: false; error: string };

/**
 * Importe con dos decimales como mucho, igual que `numeric(12,2)`.
 *
 * Se valida el TEXTO antes de convertirlo, no el número después: `parseFloat`
 * se traga "4,90abc" y devuelve 4.9, y "1e3" y devuelve 1000. Comprobar el
 * texto primero es lo que hace `create_order` con el precio de las líneas, y
 * aquí se sigue el mismo criterio.
 *
 * Se admite la coma como separador decimal porque es lo que teclea alguien que
 * escribe en español: "4,90" y "4.90" son el mismo importe.
 */
function parseAmount(
  raw: string,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: `${label} debe ser un importe con dos decimales como máximo (por ejemplo 4,90). No se admiten negativos.`,
    };
  }
  const value = Number.parseFloat(trimmed);
  if (value > SHIPPING_LIMITS.amount) {
    return { ok: false, error: `${label} está fuera de rango.` };
  }
  return { ok: true, value };
}

function parseSortOrder(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: "El orden debe ser un número entero." };
  }
  const value = Number.parseInt(trimmed, 10);
  if (Math.abs(value) > SHIPPING_LIMITS.sortOrder) {
    return { ok: false, error: "El orden está fuera de rango." };
  }
  return { ok: true, value };
}

export function validateShippingMethodInput(raw: {
  name: string;
  description: string;
  price: string;
  freeShippingThreshold: string;
  sortOrder: string;
  isActive: boolean;
}): ShippingValidation {
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name === "") {
    return { ok: false, error: "El nombre es obligatorio: es lo que ve el cliente al elegir." };
  }
  if (name.length > SHIPPING_LIMITS.name) {
    return { ok: false, error: `El nombre no puede superar ${SHIPPING_LIMITS.name} caracteres.` };
  }

  const description = raw.description.trim().replace(/\s+/g, " ");
  if (description.length > SHIPPING_LIMITS.description) {
    return {
      ok: false,
      error: `La descripción no puede superar ${SHIPPING_LIMITS.description} caracteres.`,
    };
  }

  const price = parseAmount(raw.price, "El precio");
  if (!price.ok) return { ok: false, error: price.error };

  /*
    UMBRAL VACÍO ≠ UMBRAL CERO, y la diferencia se paga en dinero:
      · vacío → NULL → el método NUNCA sale gratis por importe.
      · 0     → gratis SIEMPRE, porque cualquier subtotal es >= 0.
    Por eso la cadena vacía se convierte en `null` explícitamente en vez de
    dejar que `Number("")` la convierta en 0.
  */
  const rawThreshold = raw.freeShippingThreshold.trim();
  let freeShippingThreshold: number | null = null;
  if (rawThreshold !== "") {
    const parsed = parseAmount(rawThreshold, "El umbral de envío gratis");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    freeShippingThreshold = parsed.value;
  }

  const sortOrder = parseSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };

  return {
    ok: true,
    input: {
      name,
      description: description === "" ? null : description,
      price: price.value,
      freeShippingThreshold,
      sortOrder: sortOrder.value,
      isActive: raw.isActive,
    },
  };
}

/**
 * Traduce a algo legible lo que responde PostgreSQL sobre ESTA tabla.
 *
 * Los códigos son los mismos de siempre, pero aquí significan otra cosa: un
 * 23505 no es "slug repetido" sino "ya tienes un método que se llama así".
 */
export function shippingErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "23505": // unique_violation → shipping_methods_market_name_key
      return "Ya existe un método de entrega con ese nombre en este mercado.";
    case "23514": // check_violation
      return "Los importes no pueden ser negativos y el nombre no puede estar vacío.";
    case "42501": // insufficient_privilege
      return "No tienes permisos para editar los métodos de este mercado.";
    default:
      return fallback;
  }
}
