"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { isProductStatus, parsePrice, parseStock } from "@/lib/admin/catalog";
import { catalogErrorMessage, isUuid, validateProductInput } from "@/lib/admin/products";
import { parseSlug, slugify } from "@/lib/admin/slug";
import {
  buildMissingCombinations,
  MAX_MATRIX_SIZE,
  parseSku,
  type VariantCombination,
} from "@/lib/admin/variants";
import { revalidateProductAndHome } from "@/lib/admin/revalidate";
import { variantBelongsToMarket } from "@/lib/data/admin/catalog";
import { getProductForAdmin } from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Mutaciones del catálogo (Fases 7-8).
 *
 * CONTRATO DE SEGURIDAD, idéntico al de `pedidos/actions.ts`:
 * 1. `requireAdmin()` en TODA action, aunque el layout ya haya comprobado: una
 *    Server Function es un POST a su ruta y un cambio de `matcher` puede
 *    sacarla del proxy sin que nada falle a la vista.
 * 2. El payload llega sin tipar y se valida entero aquí.
 * 3. **Se comprueba pertenencia al mercado activo** antes de tocar nada. Desde
 *    la migración 0020 RLS también lo exige (solo mercados activos), así que
 *    son dos barreras.
 * 4. **`market_id` no se envía nunca en un UPDATE**, y en el INSERT lo pone el
 *    servidor desde `getActiveMarket()`, jamás el formulario.
 * 5. Los UPDATE tocan columnas concretas, nunca un objeto del cliente.
 */

export interface CatalogActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
const GENERIC = "No se pudo guardar el cambio. Inténtalo de nuevo.";
const FORBIDDEN = "No tienes permisos para hacer esto.";
const INVALID = "Los datos enviados no son válidos.";
const NOT_FOUND = "El producto no existe en este mercado.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readOptional(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

/** Campos comunes de creación y edición, ya validados. */
function readProductForm(formData: FormData) {
  return validateProductInput(
    {
      name: readString(formData, "name"),
      // Slug vacío → se deriva del nombre. Es lo que espera el admin al crear.
      slug: readString(formData, "slug").trim() || slugify(readString(formData, "name")),
      categoryId: readString(formData, "categoryId"),
      shortDescription: readOptional(formData, "shortDescription"),
      description: readOptional(formData, "description"),
      materials: readOptional(formData, "materials"),
      careInstructions: readOptional(formData, "careInstructions"),
      shippingInfoOverride: readOptional(formData, "shippingInfoOverride"),
      metaTitle: readOptional(formData, "metaTitle"),
      metaDescription: readOptional(formData, "metaDescription"),
      isFeatured: checked(formData, "isFeatured"),
      isNew: checked(formData, "isNew"),
    },
    parseSlug,
  );
}

// ──────────────────────────────────────────────────────────────── Productos

export async function createProductAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const parsed = readProductForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // El producto nace en `draft`: publicar es un acto explícito y separado.
  const { data, error } = await supabase
    .from("products")
    .insert({
      market_id: market.id, // del servidor, NUNCA del formulario
      category_id: parsed.input.categoryId,
      name: parsed.input.name,
      slug: parsed.input.slug,
      short_description: parsed.input.shortDescription,
      description: parsed.input.description,
      materials: parsed.input.materials,
      care_instructions: parsed.input.careInstructions,
      shipping_info_override: parsed.input.shippingInfoOverride,
      meta_title: parsed.input.metaTitle,
      meta_description: parsed.input.metaDescription,
      is_featured: parsed.input.isFeatured,
      is_new: parsed.input.isNew,
      status: "draft",
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] createProduct falló", { code: error?.code, message: error?.message });
    return { error: catalogErrorMessage(error?.code, GENERIC, error?.message), success: null };
  }

  revalidatePath("/admin/catalogo");
  // Fuera del try/catch: `redirect` funciona lanzando una excepción de control.
  redirect(`/admin/catalogo/${data.id}`);
}

export async function updateProductAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  if (!isUuid(productId)) return { error: INVALID, success: null };

  const parsed = readProductForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // El slug puede cambiar en este UPDATE, así que hay que invalidar también la
  // ruta ANTIGUA: si no, la ficha vieja seguiría sirviéndose desde caché.
  const { data: before } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .eq("market_id", market.id)
    .maybeSingle();

  // `market_id` NO está en el payload: no se puede mover un producto de mercado
  // desde el panel. El `.eq("market_id")` es filtro, no dato.
  const { data, error } = await supabase
    .from("products")
    .update({
      category_id: parsed.input.categoryId,
      name: parsed.input.name,
      slug: parsed.input.slug,
      short_description: parsed.input.shortDescription,
      description: parsed.input.description,
      materials: parsed.input.materials,
      care_instructions: parsed.input.careInstructions,
      shipping_info_override: parsed.input.shippingInfoOverride,
      meta_title: parsed.input.metaTitle,
      meta_description: parsed.input.metaDescription,
      is_featured: parsed.input.isFeatured,
      is_new: parsed.input.isNew,
    })
    .eq("id", productId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[admin] updateProduct falló", { productId, code: error.code, message: error.message });
    return { error: catalogErrorMessage(error.code, GENERIC, error.message), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  if (before?.slug && before.slug !== parsed.input.slug) {
    revalidateProductAndHome(before.slug);
  }
  revalidateProductAndHome(parsed.input.slug);
  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}`);

  return { error: null, success: "Producto guardado." };
}

/** Publicar / retirar / archivar. Los estados son los del CHECK de la 0006. */
export async function setProductStatusAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  const status = readString(formData, "status");
  if (!isUuid(productId) || !isProductStatus(status)) {
    return { error: INVALID, success: null };
  }

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .update({ status })
    .eq("id", productId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .select("id, slug");

  if (error) {
    console.error("[admin] setProductStatus falló", { productId, status, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC, error.message), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateProductAndHome(data[0].slug);
  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${productId}`);

  const messages: Record<string, string> = {
    active: "Producto publicado.",
    draft: "Producto retirado de la tienda.",
    archived: "Producto archivado.",
  };
  return { error: null, success: messages[status] };
}

/**
 * Borrado LÓGICO (`deleted_at`), que es lo que soporta el esquema. No se hace
 * `DELETE` real a propósito: `order_items.variant_id` es `ON DELETE SET NULL`,
 * así que borrar de verdad un producto vendido dejaría pedidos históricos sin
 * variante. Los snapshots del pedido sobreviven igualmente, pero se prefiere no
 * romper la trazabilidad.
 */
export async function deleteProductAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  if (!isUuid(productId)) return { error: INVALID, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // Se retira de la tienda en el mismo UPDATE: un producto borrado no puede
  // quedar `active` ni un instante.
  const { data, error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", productId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .select("id, slug");

  if (error) {
    console.error("[admin] deleteProduct falló", { productId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) return { error: NOT_FOUND, success: null };

  revalidateProductAndHome(data[0].slug);
  revalidatePath("/admin/catalogo");
  redirect("/admin/catalogo");
}

// ──────────────────────────────────────────────────────────────── Variantes

/** Edición inline de una variante existente (Fase 7, sin cambios de contrato). */
export async function updateVariantAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const variantId = readString(formData, "variantId");
  if (!isUuid(variantId)) return { error: INVALID, success: null };

  const stock = parseStock(readString(formData, "stock"));
  if (!stock.ok) return { error: stock.error, success: null };

  const price = parsePrice(readString(formData, "price"));
  if (!price.ok) return { error: price.error, success: null };

  const threshold = parseStock(readString(formData, "lowStockThreshold"));
  if (!threshold.ok) {
    return { error: "El aviso de stock bajo debe ser un número entero.", success: null };
  }

  const isActive = checked(formData, "isActive");
  const expectedUpdatedAt = readString(formData, "expectedUpdatedAt");

  const market = await getActiveMarket();
  if (!(await variantBelongsToMarket(market, variantId))) {
    return { error: "La variante no existe en este mercado.", success: null };
  }

  const supabase = await createClient();

  /*
   * BLOQUEO OPTIMISTA (Fase 9.5, Incremento 4).
   *
   * Este formulario escribe valores ABSOLUTOS: "el stock real es 7". Un valor
   * absoluto sí necesita saber sobre qué valor se decidió, así que se exige que
   * la fila siga teniendo el `updated_at` que se leyó al pintarla. Si otro
   * admin —u otra pestaña— guardó mientras tanto, el UPDATE no encuentra nada
   * y se avisa en vez de pisar su cambio en silencio.
   *
   * El testigo es `updated_at`, mantenido por el trigger `set_updated_at`.
   * Comprobado en la Fase 9.5: el trigger es BEFORE UPDATE, así que **nadie
   * puede falsificarlo**, ni siquiera con la service role key.
   *
   * La REPOSICIÓN acumulativa no pasa por aquí: vive en `/admin/inventario` y
   * usa deltas atómicos (`admin_restock_variants`), que no necesitan testigo
   * porque una suma no depende del valor de partida.
   *
   * Solo estas cuatro columnas: `product_id`, `sku`, `color_id` y `size_id` no
   * se tocan — cambiarlos reescribiría la identidad de la variante y rompería
   * los snapshots de los pedidos que la referencian.
   */
  let update = supabase
    .from("product_variants")
    .update({
      stock: stock.value,
      price: price.value,
      low_stock_threshold: threshold.value,
      is_active: isActive,
    })
    .eq("id", variantId);

  if (expectedUpdatedAt) {
    update = update.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await update.select("id, product_id, product:products(slug)");

  if (error) {
    console.error("[admin] updateVariant falló", { variantId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) {
    // Cero filas con testigo significa conflicto, no "no existe": la
    // pertenencia al mercado ya se comprobó arriba.
    if (expectedUpdatedAt) {
      return {
        error:
          "Otra persona ha cambiado esta variante mientras la editabas. Recarga la página para ver el valor actual antes de guardar.",
        success: null,
      };
    }
    return { error: GENERIC, success: null };
  }

  if (data[0].product?.slug) revalidateProductAndHome(data[0].product.slug);
  revalidatePath("/admin/catalogo");
  revalidatePath(`/admin/catalogo/${data[0].product_id}`);

  return { error: null, success: "Variante actualizada." };
}

/**
 * Genera de golpe las combinaciones color × talla que faltan.
 *
 * La escritura la hace `admin_create_variant_matrix` (migración 0021) en UNA
 * transacción: si una combinación falla, no queda ninguna a medias.
 */
export async function createVariantMatrixAction(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  if (!isUuid(productId)) return { error: INVALID, success: null };

  const price = parsePrice(readString(formData, "price"));
  if (!price.ok) return { error: price.error, success: null };
  const stock = parseStock(readString(formData, "stock"));
  if (!stock.ok) return { error: stock.error, success: null };

  const colorIds = formData.getAll("colorIds").filter((v): v is string => typeof v === "string");
  const sizeIds = formData.getAll("sizeIds").filter((v): v is string => typeof v === "string");
  if (colorIds.some((id) => !isUuid(id)) || sizeIds.some((id) => !isUuid(id))) {
    return { error: INVALID, success: null };
  }

  const market = await getActiveMarket();
  const product = await getProductForAdmin(market, productId);
  if (!product) return { error: NOT_FOUND, success: null };

  const existing: VariantCombination[] = product.variants.map((v) => ({
    colorId: v.colorId,
    sizeId: v.sizeId,
  }));

  const missing = buildMissingCombinations(colorIds, sizeIds, existing);
  if (missing.length === 0) {
    return { error: "Todas esas combinaciones ya existen.", success: null };
  }
  if (missing.length > MAX_MATRIX_SIZE) {
    return {
      error: `Son ${missing.length} combinaciones y el máximo por vez son ${MAX_MATRIX_SIZE}.`,
      success: null,
    };
  }

  // El SKU se compone en servidor a partir del slug real del producto y del
  // índice de la combinación. El admin puede afinarlo después variante a
  // variante; aquí solo tiene que ser único y legible.
  const prefix = product.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8) || "SKU";
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);

  const payload = missing.map((combo, index) => {
    const sku = parseSku(`${prefix}-${stamp}-${index + 1}`);
    return {
      color_id: combo.colorId,
      size_id: combo.sizeId,
      sku: sku.ok ? sku.value : `${prefix}-${stamp}-${index + 1}`,
      price: price.value.toFixed(2),
      stock: String(stock.value),
      is_active: true,
    };
  });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_variant_matrix", {
    p_product_id: productId,
    p_variants: payload,
  });

  if (error) {
    console.error("[admin] createVariantMatrix falló", {
      productId,
      code: error.code,
      message: error.message,
    });
    const byCode: Record<string, string> = {
      FORBIDDEN,
      PRODUCT_NOT_FOUND: NOT_FOUND,
      EMPTY_MATRIX: "Selecciona al menos un color o una talla.",
      INVALID_SKU: "El SKU generado no es válido.",
      INVALID_PRICE: "El precio no es válido.",
      INVALID_STOCK: "El stock no es válido.",
      INVALID_COLOR: "Alguno de los colores no existe.",
      INVALID_SIZE: "Alguna de las tallas no existe.",
    };
    return { error: byCode[error.message] ?? catalogErrorMessage(error.code, GENERIC), success: null };
  }

  const created =
    typeof data === "object" && data !== null && "created" in data
      ? Number((data as { created: unknown }).created)
      : missing.length;

  revalidateProductAndHome(product.slug);
  revalidatePath(`/admin/catalogo/${productId}`);

  return {
    error: null,
    success: `${created} ${created === 1 ? "variante creada" : "variantes creadas"}.`,
  };
}
