import { MAX_STOCK, parseStock } from "./catalog.ts";

/**
 * Edición de stock por VALOR ABSOLUTO (Incremento 12) — MÓDULO PURO.
 *
 * El administrador no lleva un almacén: recibe de una fuente externa frases
 * como "negra M 4, negra L 0, blanca M 7" y su trabajo es que la tienda diga
 * eso mismo. La operación real es "déjalo en N", no "suma N".
 *
 * Esta validación es la PRIMERA barrera, nunca la autoridad:
 * `admin_set_variant_stock` (migración 0038) repite TODAS las comprobaciones
 * dentro de la transacción, con la fila bloqueada, y el CHECK `stock >= 0` de
 * la 0008 está debajo. Lo de aquí existe para dar un error entendible antes de
 * tocar la red.
 *
 * Sin I/O ni imports de runtime: ejecutable con `node --test` (DEC-025). El
 * import es relativo y con extensión por el mismo motivo (DEC-066).
 */

/** Mismo tope que la función SQL y que `admin_restock_variants`. */
export const STOCK_BATCH_MAX = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un testigo es una marca de tiempo de PostgreSQL, no cualquier cadena. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)?$/;

export interface StockItem {
  variantId: string;
  /** Valor FINAL, no un incremento. */
  stock: number;
  /** `updated_at` que tenía la fila cuando se pintó el formulario. */
  expectedUpdatedAt: string;
}

export type StockBatchParse =
  | { ok: true; items: StockItem[] }
  | { ok: false; error: string };

export interface StockFormEntry {
  variantId: string;
  raw: string;
  expectedUpdatedAt: string;
}

/**
 * Construye el lote a partir de los campos del formulario de un producto.
 *
 * Las filas VACÍAS se ignoran: el formulario pinta todas las variantes y el
 * administrador solo escribe las que le han dicho. Las que no toca no viajan,
 * así que su testigo tampoco puede caducar por culpa de otra fila.
 *
 * Un valor IGUAL al actual sí viaja: quien lo compara es PostgreSQL con la
 * fila bloqueada, no el navegador, que puede estar mirando un número viejo.
 */
export function parseStockBatch(entries: readonly StockFormEntry[]): StockBatchParse {
  const items: StockItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.raw.trim() === "") continue;

    if (!UUID.test(entry.variantId)) {
      return { ok: false, error: "Los datos enviados no son válidos. Recarga la página." };
    }
    if (seen.has(entry.variantId)) {
      return { ok: false, error: "Hay una variante repetida en el envío. Recarga la página." };
    }
    seen.add(entry.variantId);

    // Sin testigo no hay forma de saber si el valor de partida sigue siendo el
    // que el administrador tenía delante, así que no se envía a ciegas.
    if (!TIMESTAMP.test(entry.expectedUpdatedAt)) {
      return {
        ok: false,
        error: "Los datos del formulario están incompletos. Recarga la página y vuelve a escribir las cantidades.",
      };
    }

    const stock = parseStock(entry.raw);
    if (!stock.ok) return { ok: false, error: stock.error };

    items.push({
      variantId: entry.variantId,
      stock: stock.value,
      expectedUpdatedAt: entry.expectedUpdatedAt,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: "No has cambiado ninguna cantidad." };
  }
  if (items.length > STOCK_BATCH_MAX) {
    return {
      ok: false,
      error: `No se pueden guardar más de ${STOCK_BATCH_MAX} variantes a la vez.`,
    };
  }

  return { ok: true, items };
}

/** `intent` del botón Agotar: `exhaust:<uuid>`. */
export function parseExhaustIntent(raw: string): string | null {
  if (!raw.startsWith("exhaust:")) return null;
  const id = raw.slice("exhaust:".length);
  return UUID.test(id) ? id : null;
}

/**
 * Errores de `admin_set_variant_stock`, traducidos.
 *
 * Cada mensaje dice QUÉ pasó y QUÉ hacer. `STOCK_CHANGED` es el único que el
 * administrador verá en operación normal, y es el que más importa: tiene que
 * quedar claro que no se ha guardado NADA y que hay un número más nuevo que el
 * suyo (docs/rules/ui.md #15).
 */
export function stockErrorMessage(raw: string | undefined, fallback: string): string {
  const messages: Record<string, string> = {
    STOCK_CHANGED:
      "Alguien ha cambiado el stock de este producto mientras lo editabas. No se ha guardado nada para no borrar el dato más nuevo. Recarga la página y vuelve a escribir las cantidades.",
    FORBIDDEN: "No tienes permisos para hacer esto.",
    INVALID_PAYLOAD: "Los datos enviados no son válidos. Recarga la página.",
    INVALID_BATCH_SIZE: `Se pueden guardar entre 1 y ${STOCK_BATCH_MAX} variantes a la vez.`,
    INVALID_VARIANT_ID: "Los datos enviados no son válidos. Recarga la página.",
    INVALID_MODE: "Los datos enviados no son válidos. Recarga la página.",
    EXPECTED_UPDATED_AT_REQUIRED:
      "Falta la información de control de cambios. Recarga la página antes de guardar.",
    INVALID_EXPECTED_UPDATED_AT:
      "Falta la información de control de cambios. Recarga la página antes de guardar.",
    STOCK_OUT_OF_RANGE: `El stock no puede superar ${MAX_STOCK} unidades.`,
    INVALID_STOCK: "El stock debe ser un número entero de 0 o más.",
    VARIANT_NOT_IN_MARKET:
      "Alguna variante ya no existe en esta tienda. No se ha guardado nada. Recarga la página.",
  };
  // STOCK_CHANGED primero: el mensaje de PostgreSQL puede contener más de un
  // código y este es el que hay que contar.
  for (const code of Object.keys(messages)) {
    if (raw?.includes(code)) return messages[code];
  }
  return fallback;
}
