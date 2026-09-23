"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  attributeErrorMessage,
  validateColorInput,
  validateSizeInput,
} from "@/lib/admin/attributes";
import { isUuid } from "@/lib/admin/products";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { parseSlug, slugify } from "@/lib/admin/slug";
import { createClient } from "@/lib/supabase/server";

/**
 * Colores y tallas (Fase 9.5, incremento 6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO HAY MERCADO EN ESTE ARCHIVO, Y ES CORRECTO
 * ─────────────────────────────────────────────────────────────────────────
 * `colors` y `sizes` NO tienen `market_id` — verificado contra el proyecto
 * real, no leído de la migración. Son catálogos globales compartidos por todos
 * los mercados (0004). Por eso aquí no se llama a `getActiveMarket()`: no
 * porque se confíe en el cliente, sino porque no hay ninguna columna de
 * mercado que decidir. Si algún día se añadiera, este archivo tendría que
 * revisarse entero, y hay un test que lo comprueba.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUIÉN DECIDE QUÉ
 * ─────────────────────────────────────────────────────────────────────────
 *   `requireAdmin()` aquí            → autorización de aplicación
 *   `admin_all_colors` / `_sizes`    → RLS, la barrera definitiva
 *   `colors_slug_key`                → unicidad del slug de color
 *   `sizes_label_size_group_key`     → unicidad de (etiqueta, grupo)
 *   `sizes_size_group_check`         → los tres grupos, ni uno más
 *   `colors_hex_code_format` (0034)  → #RRGGBB de verdad
 *   FK `product_variants_*_fkey`     → no se borra lo que está en uso
 *
 * La unicidad **no se comprueba leyendo antes de escribir**: sería una
 * condición de carrera. Se intenta escribir y se traduce el 23505, igual que
 * hacen las categorías.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BORRAR vs DESACTIVAR
 * ─────────────────────────────────────────────────────────────────────────
 * Se ofrecen las dos, y la que decide es PostgreSQL. Borrar un valor en uso
 * devuelve 23503 —comprobado contra el proyecto real— y se traduce a un
 * mensaje que dice qué hacer en su lugar. Así se puede limpiar un color
 * recién creado con una errata sin dejar basura permanente, y no se inventa
 * ninguna política de borrado en cascada.
 */

export interface AttributeActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const INVALID = "Los datos enviados no son válidos.";
const NOT_FOUND = "El valor ya no existe.";
const GENERIC = "No se pudo guardar el cambio. Inténtalo de nuevo.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Un color o una talla se pintan en TODA la tienda: en la ficha de cualquier
 * producto que los use y en el selector de variantes. No se pueden invalidar
 * "las fichas afectadas" por ruta literal sin resolver antes sus slugs, y
 * DEC-041 prohíbe hacerlo con un patrón `[segmento]`. Se usa el martillo
 * global, que es lo que ya hacen categorías y ajustes por el mismo motivo.
 */
function revalidateAfterAttributeChange(): void {
  revalidateStorefront();
  revalidatePath("/admin/atributos");
  revalidatePath("/admin/catalogo");
}

/* ───────────────────────────────────────────────────────────────── Colores */

function readColorForm(formData: FormData) {
  return validateColorInput(
    {
      name: readString(formData, "name"),
      // Igual que en categorías: si el admin no escribe slug, se deriva del
      // nombre. Efecto secundario deseado: dos colores con el mismo nombre
      // producen el mismo slug y PostgreSQL rechaza el segundo, que es la
      // única defensa real contra dos "Azul" indistinguibles en la matriz
      // (`colors.name` NO es único, verificado).
      slug: readString(formData, "slug").trim() || slugify(readString(formData, "name")),
      hexCode: readString(formData, "hexCode"),
      sortOrder: readString(formData, "sortOrder"),
      isActive: formData.get("isActive") === "on",
    },
    parseSlug,
  );
}

export async function createColorAction(
  _prev: AttributeActionState,
  formData: FormData,
): Promise<AttributeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const parsed = readColorForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const supabase = await createClient();
  const { error } = await supabase.from("colors").insert({
    name: parsed.input.name,
    slug: parsed.input.slug,
    hex_code: parsed.input.hexCode,
    sort_order: parsed.input.sortOrder,
    is_active: parsed.input.isActive,
  });

  if (error) {
    console.error("[admin] createColor falló", { code: error.code });
    return { error: attributeErrorMessage(error.code, "color", GENERIC), success: null };
  }

  revalidateAfterAttributeChange();
  return { error: null, success: `Color «${parsed.input.name}» creado.` };
}

export async function updateColorAction(
  _prev: AttributeActionState,
  formData: FormData,
): Promise<AttributeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const colorId = readString(formData, "colorId");
  if (!isUuid(colorId)) return { error: INVALID, success: null };

  const parsed = readColorForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("colors")
    .update({
      name: parsed.input.name,
      slug: parsed.input.slug,
      hex_code: parsed.input.hexCode,
      sort_order: parsed.input.sortOrder,
      is_active: parsed.input.isActive,
    })
    .eq("id", colorId)
    .select("id");

  if (error) {
    console.error("[admin] updateColor falló", { colorId, code: error.code });
    return { error: attributeErrorMessage(error.code, "color", GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateAfterAttributeChange();
  return { error: null, success: "Color actualizado." };
}

export async function deleteColorAction(
  _prev: AttributeActionState,
  formData: FormData,
): Promise<AttributeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const colorId = readString(formData, "colorId");
  if (!isUuid(colorId)) return { error: INVALID, success: null };

  const supabase = await createClient();
  // Sin comprobar antes si está en uso: la FK lo sabe mejor y sin carrera.
  const { data, error } = await supabase.from("colors").delete().eq("id", colorId).select("id");

  if (error) {
    console.error("[admin] deleteColor falló", { colorId, code: error.code });
    return { error: attributeErrorMessage(error.code, "color", GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateAfterAttributeChange();
  return { error: null, success: "Color eliminado." };
}

/* ────────────────────────────────────────────────────────────────── Tallas */

function readSizeForm(formData: FormData) {
  return validateSizeInput({
    label: readString(formData, "label"),
    sizeGroup: readString(formData, "sizeGroup"),
    sortOrder: readString(formData, "sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
}

export async function createSizeAction(
  _prev: AttributeActionState,
  formData: FormData,
): Promise<AttributeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const parsed = readSizeForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const supabase = await createClient();
  const { error } = await supabase.from("sizes").insert({
    label: parsed.input.label,
    size_group: parsed.input.sizeGroup,
    sort_order: parsed.input.sortOrder,
    is_active: parsed.input.isActive,
  });

  if (error) {
    console.error("[admin] createSize falló", { code: error.code });
    return { error: attributeErrorMessage(error.code, "size", GENERIC), success: null };
  }

  revalidateAfterAttributeChange();
  return { error: null, success: `Talla «${parsed.input.label}» creada.` };
}

export async function updateSizeAction(
  _prev: AttributeActionState,
  formData: FormData,
): Promise<AttributeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const sizeId = readString(formData, "sizeId");
  if (!isUuid(sizeId)) return { error: INVALID, success: null };

  const parsed = readSizeForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sizes")
    .update({
      label: parsed.input.label,
      size_group: parsed.input.sizeGroup,
      sort_order: parsed.input.sortOrder,
      is_active: parsed.input.isActive,
    })
    .eq("id", sizeId)
    .select("id");

  if (error) {
    console.error("[admin] updateSize falló", { sizeId, code: error.code });
    return { error: attributeErrorMessage(error.code, "size", GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateAfterAttributeChange();
  return { error: null, success: "Talla actualizada." };
}

export async function deleteSizeAction(
  _prev: AttributeActionState,
  formData: FormData,
): Promise<AttributeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const sizeId = readString(formData, "sizeId");
  if (!isUuid(sizeId)) return { error: INVALID, success: null };

  const supabase = await createClient();
  const { data, error } = await supabase.from("sizes").delete().eq("id", sizeId).select("id");

  if (error) {
    console.error("[admin] deleteSize falló", { sizeId, code: error.code });
    return { error: attributeErrorMessage(error.code, "size", GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateAfterAttributeChange();
  return { error: null, success: "Talla eliminada." };
}
