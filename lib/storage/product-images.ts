import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import {
  BLUR_WIDTH,
  buildImagePath,
  checkImageUpload,
  isValidBlurDataUrl,
  pathBelongsToProduct,
  toBlurDataUrl,
} from "@/lib/admin/images";

/**
 * Subida y borrado de imágenes de producto en Supabase Storage (Fase 8, DEC-036).
 *
 * SOLO SERVIDOR. Importa `sharp`, un módulo nativo: nunca debe aparecer en un
 * componente cliente. Se consume exclusivamente desde Server Actions.
 *
 * ESTRATEGIA DE ESPACIO (DEC-036): se guarda **un único objeto por imagen**, ya
 * recomprimido a WebP y con el lado mayor acotado. No se generan derivados en
 * Storage: las variantes responsive las produce `next/image` en tiempo de
 * servicio, tal como fija `09-SEO-PERFORMANCE.md` §55. Un JPEG de móvil de ~4 MB
 * pasa a ~350 KB, así que en 1 GB caben ~570 productos de 5 fotos en vez de ~50.
 *
 * CONFIANZA: el archivo llega del navegador, así que:
 *   1. Se leen sus bytes y se comprueba el formato REAL (magic bytes), no el
 *      `File.type` que declara el cliente ni el `allowed_mime_types` del bucket
 *      —que confía en la cabecera de la subida—.
 *   2. `sharp` re-decodifica y re-codifica la imagen: lo que se sube al bucket
 *      es un WebP generado por nosotros, no el archivo original. Cualquier
 *      payload escondido en el original no sobrevive a ese paso.
 *   3. El nombre del objeto lo genera el servidor (`rules/security.md` #9).
 *
 * No se usa la service role key: la escritura en Storage la autoriza la policy
 * `admin_write_products_bucket`, que exige `is_admin()` sobre la sesión.
 */

export const BUCKET = "products";

/** Lado mayor máximo. Suficiente para la ficha en pantallas 2x sin desperdiciar. */
const MAX_EDGE = 2000;
const WEBP_QUALITY = 80;

export type UploadResult =
  | {
      ok: true;
      path: string;
      bytes: number;
      width: number;
      height: number;
      /** Data URI del placeholder, o `null` si no se pudo generar. */
      blurDataUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * Placeholder blur (Fase 9, `09-SEO-PERFORMANCE.md` §57).
 *
 * Se genera aquí, en el servidor, a partir del MISMO buffer que ya se validó
 * por magic bytes y que `sharp` ya re-decodificó. Nunca se acepta un blur
 * enviado por el navegador.
 *
 * No es crítico: si falla, se devuelve `null` y la imagen se sube igual. Un
 * placeholder es una mejora de percepción, no un requisito de la ficha, y
 * abortar la subida por eso sería peor que no tenerlo.
 */
async function buildBlurDataUrl(
  source: Uint8Array,
  productSlug: string,
): Promise<string | null> {
  try {
    const tiny = await sharp(source, { failOn: "error" })
      .rotate()
      .resize({ width: BLUR_WIDTH, withoutEnlargement: true })
      .webp({ quality: 40 })
      .toBuffer();

    const dataUrl = toBlurDataUrl(tiny.toString("base64"));
    // Se valida lo que se acaba de generar: si `sharp` devolviera algo raro o
    // el placeholder se pasara de tamaño, se guarda NULL en vez de que lo
    // rechace el CHECK de la migración 0022 y se pierda la subida entera.
    return isValidBlurDataUrl(dataUrl) ? dataUrl : null;
  } catch (error) {
    console.error("[admin] no se pudo generar el placeholder blur", {
      productSlug,
      message: error instanceof Error ? error.message : "desconocido",
    });
    return null;
  }
}

export async function uploadProductImage(
  file: File,
  productSlug: string,
): Promise<UploadResult> {
  const original = new Uint8Array(await file.arrayBuffer());

  const check = checkImageUpload(original, file.type);
  if (!check.ok) return { ok: false, error: check.error };

  let webp: Buffer;
  let width = 0;
  let height = 0;
  try {
    const pipeline = sharp(original, { failOn: "error" })
      // `rotate()` sin argumentos aplica la orientación EXIF y luego la
      // descarta: sin esto, las fotos de móvil salen giradas.
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY });

    const output = await pipeline.toBuffer({ resolveWithObject: true });
    webp = output.data;
    width = output.info.width;
    height = output.info.height;
  } catch (error) {
    // Un archivo con magic bytes correctos pero contenido corrupto llega aquí.
    console.error("[admin] sharp no pudo procesar la imagen", {
      productSlug,
      message: error instanceof Error ? error.message : "desconocido",
    });
    return { ok: false, error: "No se pudo procesar la imagen. Prueba con otro archivo." };
  }

  const blurDataUrl = await buildBlurDataUrl(original, productSlug);

  const path = buildImagePath(productSlug, crypto.randomUUID());
  const supabase = await createClient();

  const { error } = await supabase.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    // Nunca sobrescribir: el nombre es un uuid nuevo, así que un `true` aquí
    // solo podría servir para pisar el objeto de otro.
    upsert: false,
  });

  if (error) {
    console.error("[admin] subida a Storage fallida", { productSlug, message: error.message });
    return { ok: false, error: "No se pudo subir la imagen. Inténtalo de nuevo." };
  }

  return { ok: true, path, bytes: webp.byteLength, width, height, blurDataUrl };
}

/**
 * Borra un objeto del bucket. Verifica que la ruta pertenece al producto ANTES
 * de borrar: sin esa comprobación, un `path` manipulado en el formulario podría
 * borrar la foto de otro producto (RLS de Storage solo comprueba que seas admin,
 * no de qué producto es el objeto).
 */
export async function deleteProductImage(
  path: string,
  productSlug: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!pathBelongsToProduct(path, productSlug)) {
    return { ok: false, error: "La imagen no pertenece a este producto." };
  }

  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error("[admin] borrado en Storage fallido", { path, message: error.message });
    return { ok: false, error: "No se pudo borrar la imagen." };
  }
  return { ok: true };
}

/**
 * Borrado best-effort usado como compensación: si el INSERT en `product_images`
 * falla después de haber subido el objeto, este se elimina para no dejar
 * huérfanos ocupando espacio. No propaga errores porque el fallo que importa
 * ya se está reportando.
 */
export async function discardOrphanObject(path: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (error) {
    console.error("[admin] no se pudo limpiar un objeto huérfano", {
      path,
      message: error instanceof Error ? error.message : "desconocido",
    });
  }
}
