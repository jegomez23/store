/**
 * Validación pura de colores y tallas (Fase 9.5, incremento 6).
 *
 * QUÉ SON ESTAS DOS TABLAS, comprobado contra el esquema real y no supuesto:
 *
 *   `colors`  id · name · slug (UNIQUE) · hex_code char(7) · sort_order · is_active
 *   `sizes`   id · label · size_group · sort_order · is_active   UNIQUE(label, size_group)
 *
 * Dos cosas que conviene no olvidar al leer este archivo:
 *
 *   1. **Son GLOBALES.** No tienen `market_id` (verificado en el OpenAPI de
 *      PostgREST contra el proyecto real). Por eso aquí no aparece el mercado
 *      por ningún lado, y por eso las policies de la 0004 no llevan
 *      `is_active_market`: no hay nada que aislar.
 *   2. **La talla no tiene slug.** Su identidad es `(label, size_group)`, que
 *      ya es UNIQUE en PostgreSQL. No se inventa una columna que nadie usa.
 *
 * Esta validación es la PRIMERA barrera, no la autoridad: la unicidad la
 * impone PostgreSQL (`colors_slug_key`, `sizes_label_size_group_key`), el
 * grupo lo impone `sizes_size_group_check` y el formato del color lo impone
 * `colors_hex_code_format` (migración 0034). Comprobarlo aquí sirve para dar
 * un mensaje entendible, no para decidir.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export const ATTRIBUTE_LIMITS = {
  colorName: 60,
  sizeLabel: 20,
  sortOrder: 32767,
} as const;

/**
 * Los TRES grupos que admite `sizes_size_group_check`. Ni uno más: inventar un
 * grupo aquí solo produciría un 23514 en PostgreSQL, que es quien manda.
 */
export const SIZE_GROUPS = ["apparel", "footwear", "accessory"] as const;
export type SizeGroup = (typeof SIZE_GROUPS)[number];

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
export const SIZE_GROUP_LABELS: Record<SizeGroup, string> = {
  apparel: "Ropa",
  footwear: "Calzado",
  accessory: "Accesorio",
};

export function isSizeGroup(value: unknown): value is SizeGroup {
  return typeof value === "string" && (SIZE_GROUPS as readonly string[]).includes(value);
}

export interface ColorInput {
  name: string;
  slug: string;
  hexCode: string;
  sortOrder: number;
  isActive: boolean;
}

export interface SizeInput {
  label: string;
  sizeGroup: SizeGroup;
  sortOrder: number;
  isActive: boolean;
}

export type AttributeValidation<T> =
  | { ok: true; input: T }
  | { ok: false; error: string };

/**
 * `#RRGGBB`, el mismo patrón que el CHECK de la 0034.
 *
 * POR QUÉ ESTO NO ES PARANOIA: `hex_code` es `character(7)`, y `char(n)`
 * **rellena con espacios** en lugar de rechazar. Comprobado contra el proyecto
 * real antes de la 0034: `{"hex_code":"rojo"}` devolvía 201 y se guardaba como
 * `'rojo   '`, que luego no pinta nada en la muestra de color. La longitud
 * nunca fue una validación de formato.
 */
const HEX = /^#[0-9A-Fa-f]{6}$/;

function parseSortOrder(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: "El orden debe ser un número entero." };
  }
  const value = Number.parseInt(trimmed, 10);
  if (Math.abs(value) > ATTRIBUTE_LIMITS.sortOrder) {
    return { ok: false, error: "El orden está fuera de rango." };
  }
  return { ok: true, value };
}

export function validateColorInput(
  raw: {
    name: string;
    slug: string;
    hexCode: string;
    sortOrder: string;
    isActive: boolean;
  },
  parseSlug: (value: string) => { ok: true; value: string } | { ok: false; error: string },
): AttributeValidation<ColorInput> {
  const name = raw.name.trim();
  if (name === "") return { ok: false, error: "El nombre es obligatorio." };
  if (name.length > ATTRIBUTE_LIMITS.colorName) {
    return {
      ok: false,
      error: `El nombre no puede superar ${ATTRIBUTE_LIMITS.colorName} caracteres.`,
    };
  }

  const slug = parseSlug(raw.slug);
  if (!slug.ok) return { ok: false, error: slug.error };

  // Se normaliza a mayúsculas para que "#aabbcc" y "#AABBCC" no puedan
  // convivir como dos colores que se ven idénticos. El CHECK acepta ambas.
  const hexCode = raw.hexCode.trim().toUpperCase();
  if (!HEX.test(hexCode)) {
    return {
      ok: false,
      error: "El color debe ser un hexadecimal de 6 dígitos, por ejemplo #3A4A3E.",
    };
  }

  const sortOrder = parseSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };

  return {
    ok: true,
    input: { name, slug: slug.value, hexCode, sortOrder: sortOrder.value, isActive: raw.isActive },
  };
}

export function validateSizeInput(raw: {
  label: string;
  sizeGroup: string;
  sortOrder: string;
  isActive: boolean;
}): AttributeValidation<SizeInput> {
  const label = raw.label.trim();
  if (label === "") return { ok: false, error: "La etiqueta es obligatoria." };
  if (label.length > ATTRIBUTE_LIMITS.sizeLabel) {
    return {
      ok: false,
      error: `La etiqueta no puede superar ${ATTRIBUTE_LIMITS.sizeLabel} caracteres.`,
    };
  }

  if (!isSizeGroup(raw.sizeGroup)) {
    return { ok: false, error: "El grupo de talla no es válido." };
  }

  const sortOrder = parseSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };

  return {
    ok: true,
    input: {
      label,
      sizeGroup: raw.sizeGroup,
      sortOrder: sortOrder.value,
      isActive: raw.isActive,
    },
  };
}

/**
 * Traduce los errores de PostgreSQL de ESTAS dos tablas.
 *
 * Se separa de `catalogErrorMessage` porque los mismos códigos significan
 * cosas distintas aquí: un 23503 en el catálogo es "la categoría no existe",
 * y aquí es justo lo contrario —el valor SÍ existe y está en uso—, que es un
 * mensaje que el administrador necesita entender para saber qué hacer.
 */
export function attributeErrorMessage(
  code: string | undefined,
  kind: "color" | "size",
  fallback: string,
): string {
  const noun = kind === "color" ? "color" : "talla";
  switch (code) {
    case "23505": // unique_violation
      return kind === "color"
        ? "Ya existe un color con ese slug. Cambia el nombre o escribe otro slug."
        : "Ya existe una talla con esa etiqueta en ese grupo.";
    case "23503": // foreign_key_violation
      return `No se puede eliminar: hay variantes que usan este ${noun}. Desactívalo para que deje de ofrecerse en variantes nuevas.`;
    case "23514": // check_violation
      return kind === "color"
        ? "El color debe ser un hexadecimal de 6 dígitos, por ejemplo #3A4A3E."
        : "El grupo de talla no es válido.";
    case "42501": // insufficient_privilege
      return "No tienes permisos para hacer esto.";
    default:
      return fallback;
  }
}
