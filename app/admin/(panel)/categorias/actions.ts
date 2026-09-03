"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { validateCategoryInput } from "@/lib/admin/content";
import { catalogErrorMessage, isUuid } from "@/lib/admin/products";
import { parseSlug, slugify } from "@/lib/admin/slug";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Categorías (Fase 8).
 *
 * JERARQUÍA: máximo 2 niveles, impuesto por el trigger `enforce_category_depth`
 * de la migración 0005. La UI no ofrece como padre una categoría que ya tiene
 * padre, pero **la autoridad es el trigger**: si el formulario se manipula, el
 * INSERT falla en PostgreSQL y aquí solo se traduce el error.
 *
 * BORRADO: `products.category_id` es `NOT NULL` y su FK **no** lleva
 * `ON DELETE CASCADE` ni `SET NULL` (migración 0006), así que PostgreSQL
 * rechaza borrar una categoría con productos. No se inventa ninguna política de
 * borrado en cascada: se hace borrado LÓGICO (`deleted_at`) y se bloquea si
 * quedan productos vivos o subcategorías, con un mensaje que lo explica.
 */

export interface CategoryActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const INVALID = "Los datos enviados no son válidos.";
const NOT_FOUND = "La categoría no existe en este mercado.";
const GENERIC = "No se pudo guardar el cambio. Inténtalo de nuevo.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readForm(formData: FormData) {
  return validateCategoryInput(
    {
      name: readString(formData, "name"),
      slug: readString(formData, "slug").trim() || slugify(readString(formData, "name")),
      description: readString(formData, "description"),
      parentId: readString(formData, "parentId"),
      sortOrder: readString(formData, "sortOrder"),
      isActive: formData.get("isActive") === "on",
    },
    parseSlug,
  );
}

/** Traduce el error del trigger de profundidad a algo que el admin entienda. */
function hierarchyMessage(message: string | undefined, fallback: string): string {
  if (message && message.includes("profundidad")) {
    return "No se puede anidar más: la jerarquía admite como máximo 2 niveles.";
  }
  return fallback;
}

export async function createCategoryAction(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // Si se indica padre, debe ser del mismo mercado. RLS ya impide ver los de
  // otro, pero se comprueba explícitamente para dar un error claro.
  if (parsed.input.parentId) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id, parent_id")
      .eq("id", parsed.input.parentId)
      .eq("market_id", market.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parent) return { error: "La categoría padre no existe en este mercado.", success: null };
    if (parent.parent_id !== null) {
      return { error: "No se puede anidar más: la jerarquía admite como máximo 2 niveles.", success: null };
    }
  }

  const { error } = await supabase.from("categories").insert({
    market_id: market.id, // del servidor, nunca del formulario
    parent_id: parsed.input.parentId,
    name: parsed.input.name,
    slug: parsed.input.slug,
    description: parsed.input.description,
    sort_order: parsed.input.sortOrder,
    is_active: parsed.input.isActive,
  });

  if (error) {
    console.error("[admin] createCategory falló", { code: error.code, message: error.message });
    return {
      error: hierarchyMessage(error.message, catalogErrorMessage(error.code, GENERIC)),
      success: null,
    };
  }

  revalidateStorefront();
  revalidatePath("/admin/categorias");
  return { error: null, success: "Categoría creada." };
}

export async function updateCategoryAction(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const categoryId = readString(formData, "categoryId");
  if (!isUuid(categoryId)) return { error: INVALID, success: null };

  const parsed = readForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  if (parsed.input.parentId === categoryId) {
    return { error: "Una categoría no puede ser su propia madre.", success: null };
  }

  const market = await getActiveMarket();
  const supabase = await createClient();

  // Si esta categoría tiene hijas, no puede pasar a ser hija de otra: serían
  // 3 niveles. El trigger solo mira hacia arriba, así que esto se comprueba aquí.
  if (parsed.input.parentId) {
    const { data: children } = await supabase
      .from("categories")
      .select("id")
      .eq("parent_id", categoryId)
      .is("deleted_at", null)
      .limit(1);
    if (children && children.length > 0) {
      return {
        error: "Esta categoría tiene subcategorías, así que no puede depender de otra.",
        success: null,
      };
    }

    const { data: parent } = await supabase
      .from("categories")
      .select("id, parent_id")
      .eq("id", parsed.input.parentId)
      .eq("market_id", market.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parent) return { error: "La categoría padre no existe en este mercado.", success: null };
    if (parent.parent_id !== null) {
      return { error: "No se puede anidar más: la jerarquía admite como máximo 2 niveles.", success: null };
    }
  }

  // `market_id` no viaja en el payload.
  const { data, error } = await supabase
    .from("categories")
    .update({
      parent_id: parsed.input.parentId,
      name: parsed.input.name,
      slug: parsed.input.slug,
      description: parsed.input.description,
      sort_order: parsed.input.sortOrder,
      is_active: parsed.input.isActive,
    })
    .eq("id", categoryId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[admin] updateCategory falló", { categoryId, code: error.code, message: error.message });
    return {
      error: hierarchyMessage(error.message, catalogErrorMessage(error.code, GENERIC)),
      success: null,
    };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateStorefront();
  revalidatePath("/admin/categorias");
  return { error: null, success: "Categoría guardada." };
}

/**
 * Borrado LÓGICO. Se bloquea si quedan productos vivos o subcategorías: la FK
 * `products.category_id` es NOT NULL sin cascada, así que un borrado real sería
 * rechazado por PostgreSQL de todas formas y dejaría un error críptico.
 */
export async function deleteCategoryAction(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const categoryId = readString(formData, "categoryId");
  if (!isUuid(categoryId)) return { error: INVALID, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id")
    .eq("category_id", categoryId)
    .is("deleted_at", null)
    .limit(1);
  if (products && products.length > 0) {
    return {
      error: "No se puede eliminar: todavía hay productos en esta categoría. Muévelos o elimínalos antes.",
      success: null,
    };
  }

  const { data: children } = await supabase
    .from("categories")
    .select("id")
    .eq("parent_id", categoryId)
    .is("deleted_at", null)
    .limit(1);
  if (children && children.length > 0) {
    return { error: "No se puede eliminar: esta categoría tiene subcategorías.", success: null };
  }

  const { data, error } = await supabase
    .from("categories")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", categoryId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[admin] deleteCategory falló", { categoryId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateStorefront();
  revalidatePath("/admin/categorias");
  return { error: null, success: "Categoría eliminada." };
}
