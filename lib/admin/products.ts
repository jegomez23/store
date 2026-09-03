/**
 * Validación pura del formulario de producto (Fase 8).
 *
 * Solo campos que EXISTEN en `public.products` (migración 0006). No se inventa
 * ningún campo SEO nuevo: `meta_title` y `meta_description` ya están en el
 * esquema; nada más se añade.
 *
 * Esta validación es la primera barrera, no la autoridad: los CHECK de la
 * tabla, el `unique (market_id, slug)` y las policies de RLS —que desde la
 * migración 0020 exigen mercado activo— vuelven a decidir en PostgreSQL.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export const PRODUCT_TEXT_LIMITS = {
  name: 120,
  shortDescription: 300,
  description: 5000,
  materials: 1000,
  careInstructions: 1000,
  shippingInfoOverride: 1000,
  metaTitle: 70,
  metaDescription: 160,
} as const;

/** Campos editables del producto. `market_id`, `id` y las fechas NO lo son. */
export interface ProductInput {
  name: string;
  slug: string;
  categoryId: string;
  shortDescription: string | null;
  description: string | null;
  materials: string | null;
  careInstructions: string | null;
  shippingInfoOverride: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  isFeatured: boolean;
  isNew: boolean;
}

export type ProductValidation =
  | { ok: true; input: ProductInput }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Texto opcional: se recorta y `""` se convierte en `null`, no en cadena vacía. */
function optionalText(
  raw: unknown,
  max: number,
  label: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${label} no es válido.` };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `${label} no puede superar ${max} caracteres.` };
  }
  return { ok: true, value: trimmed };
}

/**
 * `slugValidator` se inyecta para que este módulo no importe nada en runtime
 * (requisito del runner nativo, AI-DEVELOPMENT §8.2).
 */
export function validateProductInput(
  raw: Record<string, unknown>,
  slugValidator: (value: string) => { ok: true; value: string } | { ok: false; error: string },
): ProductValidation {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2) {
    return { ok: false, error: "El nombre debe tener al menos 2 caracteres." };
  }
  if (name.length > PRODUCT_TEXT_LIMITS.name) {
    return { ok: false, error: `El nombre no puede superar ${PRODUCT_TEXT_LIMITS.name} caracteres.` };
  }

  const slug = slugValidator(typeof raw.slug === "string" ? raw.slug : "");
  if (!slug.ok) return { ok: false, error: slug.error };

  if (!isUuid(raw.categoryId)) {
    return { ok: false, error: "Selecciona una categoría válida." };
  }

  const fields: [keyof ProductInput, unknown, number, string][] = [
    ["shortDescription", raw.shortDescription, PRODUCT_TEXT_LIMITS.shortDescription, "La descripción corta"],
    ["description", raw.description, PRODUCT_TEXT_LIMITS.description, "La descripción"],
    ["materials", raw.materials, PRODUCT_TEXT_LIMITS.materials, "Los materiales"],
    ["careInstructions", raw.careInstructions, PRODUCT_TEXT_LIMITS.careInstructions, "Las instrucciones de cuidado"],
    ["shippingInfoOverride", raw.shippingInfoOverride, PRODUCT_TEXT_LIMITS.shippingInfoOverride, "La información de envío"],
    ["metaTitle", raw.metaTitle, PRODUCT_TEXT_LIMITS.metaTitle, "El meta título"],
    ["metaDescription", raw.metaDescription, PRODUCT_TEXT_LIMITS.metaDescription, "La meta descripción"],
  ];

  const optional: Record<string, string | null> = {};
  for (const [key, value, max, label] of fields) {
    const parsed = optionalText(value, max, label);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    optional[key] = parsed.value;
  }

  return {
    ok: true,
    input: {
      name,
      slug: slug.value,
      categoryId: raw.categoryId,
      shortDescription: optional.shortDescription,
      description: optional.description,
      materials: optional.materials,
      careInstructions: optional.careInstructions,
      shippingInfoOverride: optional.shippingInfoOverride,
      metaTitle: optional.metaTitle,
      metaDescription: optional.metaDescription,
      isFeatured: raw.isFeatured === true,
      isNew: raw.isNew === true,
    },
  };
}

/**
 * Traduce los errores de PostgreSQL que el admin puede provocar escribiendo,
 * para no enseñarle un mensaje crudo de Postgres (rules/security.md #10).
 */
/**
 * Mensaje del trigger `enforce_publishable_product` (migración 0029). Publicar
 * un producto sin ninguna variante activa haría que su ficha respondiera 404,
 * así que PostgreSQL lo impide — y no la Server Action, que se puede saltar.
 */
export const NO_ACTIVE_VARIANT_MESSAGE =
  "Este producto no tiene ninguna variante activa, así que su ficha daría un error 404. Crea o activa al menos una variante antes de publicarlo.";

export function catalogErrorMessage(
  code: string | undefined,
  fallback: string,
  message?: string,
): string {
  // El trigger lanza P0001 con `NO_ACTIVE_VARIANT` como mensaje: se comprueba
  // antes que el código, porque P0001 es genérico de `raise exception`.
  if (message?.includes("NO_ACTIVE_VARIANT")) return NO_ACTIVE_VARIANT_MESSAGE;

  switch (code) {
    case "23505": // unique_violation
      return "Ya existe otro registro con ese slug o SKU en este mercado.";
    case "23503": // foreign_key_violation
      return "Alguna referencia no existe (categoría, color o talla).";
    case "23514": // check_violation
      return "Algún valor no cumple las restricciones de la base de datos.";
    case "42501": // insufficient_privilege
      return "No tienes permisos para hacer esto en este mercado.";
    default:
      return fallback;
  }
}
