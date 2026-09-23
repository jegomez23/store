"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { MAX_FILES_PER_BATCH, buildAutoAltText } from "@/lib/admin/images";
import { isUuid, catalogErrorMessage } from "@/lib/admin/products";
import { parseSortOrder } from "@/lib/admin/content";
import { revalidateProductAndHome } from "@/lib/admin/revalidate";
import { getProductRefForAdmin, getProductSlugForAdmin } from "@/lib/data/admin/cms";
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
  /**
   * Resultado ARCHIVO POR ARCHIVO del último lote (incremento 7).
   *
   * Existe para que un éxito parcial no se cuente como fracaso ni como éxito:
   * si de tres fotos entran dos y falla una, el administrador tiene que poder
   * ver exactamente cuál falló y por qué, sin adivinar si debe reintentar las
   * tres. Las otras acciones no lo usan y por eso es opcional.
   */
  results?: { name: string; ok: boolean; message: string }[];
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

/**
 * Sube UNA o VARIAS imágenes en un solo envío (incremento 7).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EN SERIE Y NO EN PARALELO
 * ─────────────────────────────────────────────────────────────────────────
 * Cada archivo necesita leer la galería para calcular su `sort_order` y si le
 * toca ser la principal: es un leer-y-escribir. En paralelo, dos archivos de
 * un producto vacío verían los dos "no hay ninguna" y los dos intentarían
 * `is_primary = true`; el índice UNIQUE parcial de la 0020 rechazaría el
 * segundo —comprobado: el segundo INSERT devuelve 409— y esa foto se perdería.
 * En serie el problema no existe. Además, `sharp` procesa una imagen cada vez
 * en lugar de sostener cinco decodificadas a la vez.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ÉXITO PARCIAL: SE INFORMA, NO SE DESHACE
 * ─────────────────────────────────────────────────────────────────────────
 * Si de tres fotos entran dos y falla una, las dos buenas SE QUEDAN y se dice
 * cuál falló. Deshacerlas sería tirar trabajo que ya salió bien y obligar a
 * repetir el envío entero; y no hay ninguna invariante que exija que un lote
 * sea todo-o-nada — cada imagen es independiente de las demás.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STORAGE Y BD NO COMPARTEN TRANSACCIÓN
 * ─────────────────────────────────────────────────────────────────────────
 * Se conserva la compensación que ya existía: si el INSERT falla después de
 * subir el objeto, se borra el objeto (`discardOrphanObject`). Lo que NO se
 * puede evitar es que el proceso muera entre ambos pasos; ese caso deja bytes
 * sin dueño, y está documentado como riesgo residual en vez de tapado.
 */
/**
 * Inserta la fila de una imagen resolviendo la CARRERA POR LA PRINCIPAL.
 *
 * EL FALLO, REPRODUCIDO sobre el build servido antes de escribir esto: dos
 * administradores subiendo a la vez a un producto SIN fotos veían los dos "no
 * hay ninguna", los dos pedían `is_primary = true`, y el índice UNIQUE parcial
 * de la 0020 rechazaba al segundo. Resultado medido: **de dos imágenes se
 * guardaba UNA**. La foto del segundo se perdía, con su objeto ya descartado.
 *
 * El orden en serie dentro de un lote no lo arregla: la carrera es entre
 * PETICIONES, y ahí la interfaz no puede hacer nada.
 *
 * La solución es la que ya impone la base de datos: si el INSERT choca contra
 * ese índice, es que otra petición se llevó la principal mientras tanto, así
 * que se reintenta UNA vez como no-principal. No hace falta bloquear nada ni
 * añadir una migración: el índice es la autoridad y aquí solo se le hace caso.
 */
async function insertImageRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    product_id: string;
    url: string;
    alt_text: string;
    sort_order: number;
    blur_data_url: string | null;
  },
  wantsPrimary: boolean,
): Promise<{ code?: string; message: string } | null> {
  const { error } = await supabase
    .from("product_images")
    .insert({ ...row, is_primary: wantsPrimary });

  if (!error) return null;

  // 23505 = unique_violation. Con `wantsPrimary`, la única restricción única
  // que se puede tocar es la de "una sola principal por producto".
  if (error.code === "23505" && wantsPrimary) {
    const { error: retryError } = await supabase
      .from("product_images")
      .insert({ ...row, is_primary: false });
    if (!retryError) return null;
    return { code: retryError.code, message: retryError.message };
  }

  return { code: error.code, message: error.message };
}

export async function uploadProductImagesAction(
  _prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const productId = readString(formData, "productId");
  if (!isUuid(productId)) return { error: INVALID, success: null };

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return { error: "Selecciona al menos una imagen.", success: null };
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return {
      error: `Máximo ${MAX_FILES_PER_BATCH} imágenes por envío. Has seleccionado ${files.length}: hazlo en dos tandas.`,
      success: null,
    };
  }

  const market = await getActiveMarket();
  // Comprueba la pertenencia al mercado Y devuelve slug (ruta del objeto) y
  // nombre (texto alternativo automático) en una sola consulta.
  const product = await getProductRefForAdmin(market, productId);
  if (!product) return { error: NOT_FOUND, success: null };

  const supabase = await createClient();
  const results: NonNullable<ImageActionState["results"]> = [];
  let uploadedCount = 0;

  for (const file of files) {
    // Valida por magic bytes, reescala y convierte a WebP antes de subir.
    const uploaded = await uploadProductImage(file, product.slug);
    if (!uploaded.ok) {
      results.push({ name: file.name, ok: false, message: uploaded.error });
      continue;
    }

    // Se relee en CADA vuelta: la imagen anterior del lote ya cuenta.
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

    const error = await insertImageRow(
      supabase,
      {
        product_id: productId,
        url: uploaded.path,
        alt_text: buildAutoAltText(product.name, nextOrder + 1),
        sort_order: nextOrder,
        // Generado por sharp en el servidor (Fase 9). `null` si no se pudo
        // generar: la imagen se guarda igual, solo se queda sin placeholder.
        blur_data_url: uploaded.blurDataUrl,
      },
      isFirst,
    );

    if (error) {
      // Compensación: el objeto ya está subido y nadie lo referencia.
      await discardOrphanObject(uploaded.path);
      console.error("[admin] insert de product_images falló", {
        productId,
        code: error.code,
        message: error.message,
      });
      results.push({
        name: file.name,
        ok: false,
        message: catalogErrorMessage(error.code, GENERIC),
      });
      continue;
    }

    uploadedCount += 1;
    const kb = Math.round(uploaded.bytes / 1024);
    results.push({
      name: file.name,
      ok: true,
      message: `${uploaded.width}×${uploaded.height}, ${kb} KB en WebP`,
    });
  }

  // Una sola invalidación por lote: N imágenes no son N cambios distintos para
  // la tienda, son un cambio en la misma ficha.
  if (uploadedCount > 0) {
    revalidateProductAndHome(product.slug);
    revalidatePath(`/admin/catalogo/${productId}`);
  }

  const failed = results.length - uploadedCount;
  if (uploadedCount === 0) {
    return { error: "No se pudo subir ninguna imagen.", success: null, results };
  }
  if (failed > 0) {
    return {
      // Ni "todo bien" ni "ha fallado": lo que pasó de verdad.
      error: `${failed} ${failed === 1 ? "imagen no se pudo subir" : "imágenes no se pudieron subir"}.`,
      success: `${uploadedCount} ${uploadedCount === 1 ? "imagen guardada" : "imágenes guardadas"}.`,
      results,
    };
  }
  return {
    error: null,
    success: `${uploadedCount} ${uploadedCount === 1 ? "imagen guardada" : "imágenes guardadas"}.`,
    results,
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
