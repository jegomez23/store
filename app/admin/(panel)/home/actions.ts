"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { validateHomeBlockInput } from "@/lib/admin/content";
import { catalogErrorMessage, isUuid } from "@/lib/admin/products";
import { revalidateHome } from "@/lib/admin/revalidate";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Bloques editoriales de la home (Fase 8).
 *
 * ALCANCE DELIBERADAMENTE ESTRECHO: se editan los campos que EXISTEN en
 * `home_content` (migración 0014) y las tres secciones de su CHECK
 * (`hero`, `banner`, `strip_promo`). **No es un page builder**: no se pueden
 * inventar tipos de bloque nuevos, y la home pública sigue leyendo por
 * `lib/data/home.ts` como hasta ahora.
 *
 * `image_url` no se edita aquí: subir imágenes de home usaría el bucket
 * `content`, y eso no entra en el alcance acordado de esta fase (queda
 * declarado como pendiente, no como hecho).
 */

export interface HomeActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const INVALID = "Los datos enviados no son válidos.";
const NOT_FOUND = "El bloque no existe en este mercado.";
const GENERIC = "No se pudo guardar el cambio. Inténtalo de nuevo.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readForm(formData: FormData) {
  return validateHomeBlockInput({
    section: readString(formData, "section"),
    title: readString(formData, "title"),
    subtitle: readString(formData, "subtitle"),
    ctaLabel: readString(formData, "ctaLabel"),
    ctaHref: readString(formData, "ctaHref"),
    sortOrder: readString(formData, "sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
}

export async function createHomeBlockAction(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { error } = await supabase.from("home_content").insert({
    market_id: market.id, // del servidor
    section: parsed.input.section,
    title: parsed.input.title,
    subtitle: parsed.input.subtitle,
    cta_label: parsed.input.ctaLabel,
    cta_href: parsed.input.ctaHref,
    sort_order: parsed.input.sortOrder,
    is_active: parsed.input.isActive,
  });

  if (error) {
    console.error("[admin] createHomeBlock falló", { code: error.code, message: error.message });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }

  revalidateHome();
  revalidatePath("/admin/home");
  return { error: null, success: "Bloque creado." };
}

export async function updateHomeBlockAction(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const blockId = readString(formData, "blockId");
  if (!isUuid(blockId)) return { error: INVALID, success: null };

  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("home_content")
    .update({
      section: parsed.input.section,
      title: parsed.input.title,
      subtitle: parsed.input.subtitle,
      cta_label: parsed.input.ctaLabel,
      cta_href: parsed.input.ctaHref,
      sort_order: parsed.input.sortOrder,
      is_active: parsed.input.isActive,
    })
    .eq("id", blockId)
    .eq("market_id", market.id)
    .select("id");

  if (error) {
    console.error("[admin] updateHomeBlock falló", { blockId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateHome();
  revalidatePath("/admin/home");
  return { error: null, success: "Bloque guardado." };
}

export async function deleteHomeBlockAction(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const blockId = readString(formData, "blockId");
  if (!isUuid(blockId)) return { error: INVALID, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // `home_content` no tiene `deleted_at`: aquí el borrado sí es real, y es lo
  // que permite el esquema. No se inventa una columna nueva.
  const { data, error } = await supabase
    .from("home_content")
    .delete()
    .eq("id", blockId)
    .eq("market_id", market.id)
    .select("id");

  if (error) {
    console.error("[admin] deleteHomeBlock falló", { blockId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateHome();
  revalidatePath("/admin/home");
  return { error: null, success: "Bloque eliminado." };
}
