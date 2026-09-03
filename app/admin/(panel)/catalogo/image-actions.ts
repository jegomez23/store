"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { parseAltText } from "@/lib/admin/images";
import { isUuid, catalogErrorMessage } from "@/lib/admin/products";
import { parseSortOrder } from "@/lib/admin/content";
import { revalidateProductAndHome } from "@/lib/admin/revalidate";
import { getProductSlugForAdmin } from "@/lib/data/admin/cms";
import {
  deleteProductImage,
  discardOrphanObject,
  uploadProductImage,
} from "@/lib/storage/product-images";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Imágenes de producto (Fase 8, DEC-036).
 *
 * DOS SISTEMAS QUE DEBEN QUEDAR CONSISTENTES: el objeto en Storage y la fila en
 * `product_images`. No hay transacción que abarque ambos, así que el orden y la
 * compensación importan:
 *
 *   subir  → objeto primero, fila después. Si la fila falla, se borra el objeto
 *            (`discardOrphanObject`) para no dejar bytes pagados sin dueño.
 *   borrar → fila primero, objeto después. Si el objeto falla, queda un
 *            huérfano — molesto pero inofensivo — en vez de una fila que apunta
 *            a un objeto inexistente, que sí rompería la ficha.
 *
 * El slug que compone la ruta se lee de la BD, NUNCA del formulario: si viniera
 * del cliente se podrían escribir objetos bajo la carpeta de otro producto.
 */

export interface ImageActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const INVALID = "Los datos enviados no son válidos.";
const NOT_FOUND = "El producto no existe en este mercado.";
const GENERIC = "No se pudo completar la operación. Inténtalo de nuevo.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function uploadProductImageAction(
  _prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  if (!isUuid(productId)) return { error: INVALID, success: null };

  const alt = parseAltText(readString(formData, "altText"));
  if (!alt.ok) return { error: alt.error, success: null };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona una imagen.", success: null };
  }

  const market = await getActiveMarket();
  // Verifica pertenencia al mercado Y devuelve el slug real para la ruta.
  const slug = await getProductSlugForAdmin(market, productId);
  if (!slug) return { error: NOT_FOUND, success: null };

  // Valida por magic bytes, reescala y convierte a WebP antes de subir.
  const uploaded = await uploadProductImage(file, slug);
  if (!uploaded.ok) return { error: uploaded.error, success: null };

  const supabase = await createClient();

  // El orden dentro de la galería lo decide el servidor: la nueva va al final.
  const { data: siblings } = await supabase
    .from("product_images")
    .select("id, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (siblings?.[0]?.sort_order ?? -1) + 1;
  // La primera imagen del producto es la principal automáticamente. El índice
  // UNIQUE parcial de la migración 0020 impide que haya dos.
  const isFirst = (siblings?.length ?? 0) === 0;

  const { error } = await supabase.from("product_images").insert({
    product_id: productId,
    url: uploaded.path,
    alt_text: alt.value,
    sort_order: nextOrder,
    is_primary: isFirst,
    // Generado por sharp en el servidor (Fase 9). `null` si no se pudo
    // generar: la imagen se guarda igual, solo se queda sin placeholder.
    blur_data_url: uploaded.blurDataUrl,
  });

  if (error) {
    // Compensación: el objeto ya está subido y nadie lo referencia.
    await discardOrphanObject(uploaded.path);
    console.error("[admin] insert de product_images falló", {
      productId,
      code: error.code,
      message: error.message,
    });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }

  revalidateProductAndHome(slug);
  revalidatePath(`/admin/catalogo/${productId}`);

  const kb = Math.round(uploaded.bytes / 1024);
  return {
    error: null,
    success: `Imagen subida (${uploaded.width}×${uploaded.height}, ${kb} KB en WebP).`,
  };
}

export async function deleteProductImageAction(
  _prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  const imageId = readString(formData, "imageId");
  if (!isUuid(productId) || !isUuid(imageId)) return { error: INVALID, success: null };

  const market = await getActiveMarket();
  const slug = await getProductSlugForAdmin(market, productId);
  if (!slug) return { error: NOT_FOUND, success: null };

  const supabase = await createClient();

  // Se borra la fila filtrando también por `product_id`: un `imageId` de otro
  // producto no encaja y afecta a 0 filas.
  const { data, error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("url, is_primary");

  if (error) {
    console.error("[admin] delete de product_images falló", { imageId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) return { error: "La imagen no existe en este producto.", success: null };

  // El objeto se borra después: si esto falla queda un huérfano, no una ficha rota.
  const removed = await deleteProductImage(data[0].url, slug);
  if (!removed.ok) {
    console.error("[admin] objeto huérfano tras borrar la fila", { path: data[0].url });
  }

  // Si se borró la principal, se promueve la primera que quede: un producto sin
  // imagen principal no tendría foto en el listado ni en la OG.
  if (data[0].is_primary) {
    const { data: rest } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .order("sort_order")
      .limit(1);
    if (rest && rest.length > 0) {
      await supabase.from("product_images").update({ is_primary: true }).eq("id", rest[0].id);
    }
  }

  revalidateProductAndHome(slug);
  revalidatePath(`/admin/catalogo/${productId}`);

  return { error: null, success: "Imagen eliminada." };
}

/**
 * Marca la imagen principal. Son dos UPDATE y el índice UNIQUE parcial de la
 * 0020 impide que haya dos principales a la vez, así que primero se desmarca la
 * anterior y luego se marca la nueva — en el orden inverso la BD rechazaría el
 * segundo UPDATE.
 */
export async function setPrimaryImageAction(
  _prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  const imageId = readString(formData, "imageId");
  if (!isUuid(productId) || !isUuid(imageId)) return { error: INVALID, success: null };

  const market = await getActiveMarket();
  const slug = await getProductSlugForAdmin(market, productId);
  if (!slug) return { error: NOT_FOUND, success: null };

  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId)
    .eq("is_primary", true);

  if (clearError) {
    console.error("[admin] no se pudo desmarcar la principal", { productId, code: clearError.code });
    return { error: GENERIC, success: null };
  }

  const { data, error } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("id");

  if (error || data.length === 0) {
    console.error("[admin] no se pudo marcar la principal", { imageId, code: error?.code });
    return { error: error ? catalogErrorMessage(error.code, GENERIC) : "La imagen no existe en este producto.", success: null };
  }

  revalidateProductAndHome(slug);
  revalidatePath(`/admin/catalogo/${productId}`);

  return { error: null, success: "Imagen principal actualizada." };
}

/** Reordena una imagen dentro de la galería. */
export async function setImageOrderAction(
  _prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  const imageId = readString(formData, "imageId");
  if (!isUuid(productId) || !isUuid(imageId)) return { error: INVALID, success: null };

  const order = parseSortOrder(readString(formData, "sortOrder"));
  if (!order.ok) return { error: order.error, success: null };

  const market = await getActiveMarket();
  const slug = await getProductSlugForAdmin(market, productId);
  if (!slug) return { error: NOT_FOUND, success: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_images")
    .update({ sort_order: order.value })
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("id");

  if (error) {
    console.error("[admin] setImageOrder falló", { imageId, code: error.code });
    return { error: catalogErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) return { error: "La imagen no existe en este producto.", success: null };

  revalidateProductAndHome(slug);
  revalidatePath(`/admin/catalogo/${productId}`);

  return { error: null, success: "Orden actualizado." };
}
