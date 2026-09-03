import { MAX_STOCK } from "./catalog.ts";

/**
 * Inventario: validación del lote de reposición y de los filtros (Fase 9.5,
 * Incremento 4) — MÓDULO PURO.
 *
 * Esta validación es la PRIMERA barrera, no la única: `admin_restock_variants`
 * (migración 0026) repite todas las comprobaciones dentro de la transacción,
 * con la variante bloqueada, y los CHECK de la 0008 están debajo. Lo de aquí
 * sirve para dar un error entendible antes de tocar la red, no para proteger.
 *
 * Sin I/O ni imports de runtime: ejecutable con `node --test` (DEC-025).
 */

/** Mismo tope que la función SQL. Si cambia uno, cambia el otro. */
export const MAX_RESTOCK_ITEMS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RestockItem {
  variantId: string;
  /** Unidades a SUMAR. Negativo resta; cero no es una operación. */
  delta: number;
}

export type RestockParse =
  | { ok: true; items: RestockItem[] }
  | { ok: false; error: string };

/**
 * Interpreta un delta escrito por una persona.
 *
 * Acepta `12`, `+12` y `-3`. Rechaza decimales: "media unidad repuesta" no
 * significa nada, y `Number("5.5")` seguido de un `::int` en PostgreSQL
 * redondearía en silencio. Rechaza también notación exponencial y espacios
 * interiores, que `Number()` sí aceptaría.
 */
export function parseDelta(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Escribe cuántas unidades entran." };
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return { ok: false, error: "Las unidades deben ser un número entero, sin decimales." };
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: "Ese número no es válido." };
  }
  if (value === 0) {
    return { ok: false, error: "Un cambio de 0 unidades no hace nada." };
  }
  if (Math.abs(value) > MAX_STOCK) {
    return { ok: false, error: `El cambio no puede superar ${MAX_STOCK} unidades.` };
  }
  return { ok: true, value };
}

/**
 * Construye el lote a partir de los pares `variantId → delta` del formulario.
 *
 * Las filas vacías se IGNORAN: el formulario de inventario lista muchas
 * variantes y el admin solo rellena las que ha recibido. Solo se envía lo que
 * tiene un número escrito.
 */
export function parseRestockBatch(
  entries: readonly { variantId: string; raw: string }[],
): RestockParse {
  const items: RestockItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.raw.trim() === "") continue;

    if (!UUID.test(entry.variantId)) {
      return { ok: false, error: "Los datos enviados no son válidos." };
    }
    // Un id repetido en el mismo lote significaría dos deltas para la misma
    // fila: se rechaza en vez de aplicar uno de los dos arbitrariamente.
    if (seen.has(entry.variantId)) {
      return { ok: false, error: "Hay una variante repetida en el envío." };
    }
    seen.add(entry.variantId);

    const delta = parseDelta(entry.raw);
    if (!delta.ok) return { ok: false, error: delta.error };

    items.push({ variantId: entry.variantId, delta: delta.value });
  }

  if (items.length === 0) {
    return { ok: false, error: "No has indicado ninguna cantidad." };
  }
  if (items.length > MAX_RESTOCK_ITEMS) {
    return { ok: false, error: `No se pueden reponer más de ${MAX_RESTOCK_ITEMS} variantes a la vez.` };
  }

  return { ok: true, items };
}

/** Errores que devuelve `admin_restock_variants`, traducidos. */
export function restockErrorMessage(raw: string | undefined, fallback: string): string {
  const messages: Record<string, string> = {
    FORBIDDEN: "No tienes permisos para hacer esto.",
    INVALID_PAYLOAD: "Los datos enviados no son válidos.",
    INVALID_BATCH_SIZE: `Se pueden reponer entre 1 y ${MAX_RESTOCK_ITEMS} variantes a la vez.`,
    INVALID_VARIANT_ID: "Los datos enviados no son válidos.",
    INVALID_DELTA: "Las unidades deben ser un número entero distinto de cero.",
    DELTA_OUT_OF_RANGE: "El cambio de unidades es demasiado grande.",
    VARIANT_NOT_IN_MARKET: "Alguna variante no pertenece a este mercado. No se ha aplicado nada.",
    NEGATIVE_STOCK: "El stock no puede quedar en negativo. No se ha aplicado nada.",
  };
  for (const [code, message] of Object.entries(messages)) {
    if (raw?.includes(code)) return message;
  }
  return fallback;
}

// ────────────────────────────────────────────────────── Filtros del listado

export const INVENTORY_PAGE_SIZE = 30;

/** Qué subconjunto del inventario se está mirando. */
export const INVENTORY_FILTERS = ["todas", "bajo", "agotadas"] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

export function isInventoryFilter(value: unknown): value is InventoryFilter {
  return typeof value === "string" && (INVENTORY_FILTERS as readonly string[]).includes(value);
}

// TODO(i18n)
export const INVENTORY_FILTER_LABELS: Record<InventoryFilter, string> = {
  todas: "Todas",
  bajo: "Bajo umbral",
  agotadas: "Agotadas",
};
