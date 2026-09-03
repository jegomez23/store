/**
 * Matriz color × talla (Fase 8).
 *
 * Modelo real (`product_variants`, migración 0008 + DEC-019):
 *   - `color_id` y `size_id` son NULLABLE: un accesorio puede no tener ninguno.
 *   - `unique (product_id, color_id, size_id)` impide duplicados.
 *   - PostgreSQL trata dos NULL como DISTINTOS en un índice UNIQUE, así que ese
 *     constraint **no** impide dos variantes "sin color y sin talla" en el mismo
 *     producto. DEC-019 lo dio por aceptable; aquí se cubre en la aplicación
 *     con `combinationKey`, que trata NULL como un valor concreto.
 *   - `sku` es UNIQUE **global**, no por producto.
 *
 * DEC-019 NO se modifica: este módulo solo evita generar combinaciones que la
 * BD rechazaría o que serían ambiguas.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export interface VariantCombination {
  colorId: string | null;
  sizeId: string | null;
}

export interface VariantDraft extends VariantCombination {
  sku: string;
  price: number;
  stock: number;
  isActive: boolean;
}

/**
 * Clave estable de una combinación. `-` representa "sin color"/"sin talla", así
 * que dos variantes sin color ni talla colisionan aquí aunque la BD las
 * aceptaría. Es deliberado: dos variantes idénticas de un accesorio no
 * significan nada y el admin no podría distinguirlas en la matriz.
 */
export function combinationKey(combo: VariantCombination): string {
  return `${combo.colorId ?? "-"}::${combo.sizeId ?? "-"}`;
}

/**
 * Producto cartesiano de los colores y tallas seleccionados, menos lo que ya
 * existe. Una lista vacía de colores (o de tallas) significa "sin color" (o
 * "sin talla"), que es el caso de los accesorios de DEC-019.
 */
export function buildMissingCombinations(
  colorIds: readonly string[],
  sizeIds: readonly string[],
  existing: readonly VariantCombination[],
): VariantCombination[] {
  const colors: (string | null)[] = colorIds.length > 0 ? [...colorIds] : [null];
  const sizes: (string | null)[] = sizeIds.length > 0 ? [...sizeIds] : [null];

  const taken = new Set(existing.map(combinationKey));
  const out: VariantCombination[] = [];

  for (const colorId of colors) {
    for (const sizeId of sizes) {
      const combo = { colorId, sizeId };
      const key = combinationKey(combo);
      if (taken.has(key)) continue;
      taken.add(key); // protege también de duplicados dentro de la propia petición
      out.push(combo);
    }
  }
  return out;
}

/** Tope de seguridad: una matriz enorme sería un DoS accidental sobre la RPC. */
export const MAX_MATRIX_SIZE = 100;

export const SKU_MAX_LENGTH = 40;

export type SkuResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * SKU: mayúsculas, dígitos y guiones. Es UNIQUE global en la tabla, así que la
 * colisión real la detecta PostgreSQL; aquí solo se normaliza la forma.
 */
export function parseSku(raw: string): SkuResult {
  const value = raw.trim().toUpperCase();
  if (value.length < 2) return { ok: false, error: "El SKU debe tener al menos 2 caracteres." };
  if (value.length > SKU_MAX_LENGTH) {
    return { ok: false, error: `El SKU no puede superar ${SKU_MAX_LENGTH} caracteres.` };
  }
  if (!/^[A-Z0-9-]+$/.test(value)) {
    return { ok: false, error: "El SKU solo admite mayúsculas, números y guiones." };
  }
  return { ok: true, value };
}

/**
 * SKU sugerido para una celda de la matriz. Solo es una propuesta editable: la
 * unicidad la impone la BD.
 */
export function suggestSku(
  productSlug: string,
  colorSlug: string | null,
  sizeLabel: string | null,
): string {
  const part = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 6);

  const chunks = [part(productSlug)];
  if (colorSlug) chunks.push(part(colorSlug));
  if (sizeLabel) chunks.push(part(sizeLabel));
  return chunks.filter(Boolean).join("-").slice(0, SKU_MAX_LENGTH);
}
