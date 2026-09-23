/**
 * Filtros del inventario (Fase 9.5, Incremento 4; revisado en el 12).
 *
 * La VALIDACIÓN de la edición de stock vive en `lib/admin/stock.ts`: desde el
 * incremento 12 el panel escribe valores absolutos con testigo y ya no envía
 * deltas. `admin_restock_variants` (migración 0026) sigue existiendo en la base
 * de datos, con sus tests, pero queda FUERA del flujo de edición rápida
 * (DEC-068): es la operación de una recepción de mercancía, no la de copiar el
 * stock que dicta una fuente externa.
 *
 * Sin I/O ni imports de runtime: ejecutable con `node --test` (DEC-025).
 */

/**
 * PRODUCTOS por página, no variantes: desde el incremento 12 el inventario se
 * agrupa por producto y un grupo no puede partirse entre dos páginas.
 */
export const INVENTORY_PAGE_SIZE = 20;

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
