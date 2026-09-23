import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { buildLogoPath, checkImageUpload, isLogoPath } from "@/lib/admin/images";

/**
 * Logo de la tienda en Supabase Storage (incremento 17).
 *
 * SOLO SERVIDOR. Importa `sharp`, un módulo nativo: nunca debe aparecer en un
 * componente cliente. Se consume exclusivamente desde Server Actions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO SE INVENTA NADA: SE REUTILIZA LO QUE YA EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * · Bucket `content` con lectura pública y escritura solo `is_admin()`
 *   (migración 0015). **Sin migración de Storage en este incremento.**
 * · `checkImageUpload` — magic bytes, no `File.type` ni `allowed_mime_types`,
 *   que confían en el cliente (DEC-036).
 * · `sharp` re-decodifica y re-codifica a WebP: lo que llega al bucket es un
 *   archivo generado por nosotros, no el original.
 * · **No se usa la service role key.** Escribe la sesión del admin, y quien
 *   autoriza es la policy `admin_write_content_bucket`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ 512 PX Y NO 2000 COMO EL CATÁLOGO
 * ─────────────────────────────────────────────────────────────────────────
 * El catálogo necesita 2000 px porque una foto de producto se mira a pantalla
 * completa. Un logo se pinta a 32 px en la cabecera y a ~180 px en la tarjeta
 * de Open Graph: 512 px cubre el peor caso con holgura en pantallas 2x, y por
 * encima de eso solo se paga transferencia. La calidad sube a 90 (el catálogo
 * usa 80) porque un logo suele tener bordes duros y texto, donde los artefactos
 * de compresión se ven mucho antes que en una fotografía.
 *
 * Se conserva la transparencia: un logo sobre fondo crema con el alfa aplastado
 * saldría con un rectángulo blanco alrededor.
 */

export const LOGO_BUCKET = "content";

/** Lado mayor máximo del logo, en píxeles. */
const MAX_EDGE = 512;
const WEBP_QUALITY = 90;

export type LogoUploadResult =
  | { ok: true; path: string; bytes: number; width: number; height: number }
  | { ok: false; error: string };

/**
 * Procesa y sube un logo NUEVO. No toca `settings`: eso lo hace quien llama,
 * porque es quien puede decidir qué hacer si la escritura falla.
 */
export async function uploadLogo(file: File, marketId: string): Promise<LogoUploadResult> {
  const original = new Uint8Array(await file.arrayBuffer());

  const check = checkImageUpload(original, file.type);
  if (!check.ok) return { ok: false, error: check.error };

  let webp: Buffer;
  let width = 0;
  let height = 0;
  try {
    const output = await sharp(original, { failOn: "error" })
      // Orientación EXIF aplicada y descartada, igual que en el catálogo: un
      // logo fotografiado o exportado desde un móvil también puede traerla.
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    webp = output.data;
    width = output.info.width;
    height = output.info.height;
  } catch (error) {
    // Magic bytes correctos pero contenido corrupto llega aquí.
    console.error("[admin] sharp no pudo procesar el logo", {
      marketId,
      message: error instanceof Error ? error.message : "desconocido",
    });
    return { ok: false, error: "No se pudo procesar la imagen. Prueba con otro archivo." };
  }

  const path = buildLogoPath(marketId, crypto.randomUUID());
  const supabase = await createClient();

  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, webp, {
    contentType: "image/webp",
    // Nunca sobrescribir: el nombre lleva un uuid nuevo, así que `true` solo
    // podría servir para pisar un objeto ajeno.
    upsert: false,
  });

  if (error) {
    console.error("[admin] subida del logo fallida", { marketId, message: error.message });
    return { ok: false, error: "No se pudo subir el logo. Inténtalo de nuevo." };
  }

  return { ok: true, path, bytes: webp.byteLength, width, height };
}

/**
 * Borra un objeto de logo. **Best-effort y comprobando la ruta**: la RLS de
 * Storage solo mira que seas admin, no de qué es el objeto, así que sin
 * `isLogoPath` un `logo_url` manipulado en la base de datos podría hacer que
 * sustituir el logo borrase una foto del catálogo.
 *
 * No propaga el error: se usa como compensación, y el fallo que le importa al
 * administrador ya se está reportando por otro lado. Un objeto sin dueño ocupa
 * unos kilobytes; una excepción aquí tiraría una operación que ya salió bien.
 */
export async function discardLogoObject(
  path: string | null | undefined,
  marketId: string,
): Promise<void> {
  if (!isLogoPath(path, marketId)) return;
  try {
    const supabase = await createClient();
    await supabase.storage.from(LOGO_BUCKET).remove([path as string]);
  } catch (error) {
    console.error("[admin] no se pudo limpiar un objeto de logo", {
      path,
      message: error instanceof Error ? error.message : "desconocido",
    });
  }
}
