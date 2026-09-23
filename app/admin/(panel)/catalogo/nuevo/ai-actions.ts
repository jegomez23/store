"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { checkImageUpload } from "@/lib/admin/images";
import { createAnthropicProductAssistant } from "@/lib/ai/anthropic-assistant";
import type { AssistState } from "@/lib/ai/assist-state";
import { isUsefulSuggestion, type AssistantFailure } from "@/lib/ai/product-assistant";
import { listCategoriesForAdmin, listColors } from "@/lib/data/admin/cms";

import { getActiveMarket } from "@/lib/markets";

/**
 * «Analizar foto» (incremento 20).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTA ACTION NO ESCRIBE NADA. NO PUEDE.
 * ═══════════════════════════════════════════════════════════════════════════
 * No importa ningún cliente de Supabase de escritura, no recibe ningún id de
 * producto y su único retorno es una sugerencia para rellenar un formulario.
 * La IA no publica, no toca precios, no toca stock, no toca pedidos y no toca
 * la configuración: para todo eso siguen haciendo falta las Server Actions de
 * siempre, con su `requireAdmin()` y su RLS.
 *
 * Lo único que lee es el catálogo público —categorías y colores— para dárselo
 * como contexto al modelo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLO UN ADMIN, Y SOLO CUANDO LO PIDE
 * ═══════════════════════════════════════════════════════════════════════════
 * Una Server Action es un endpoint POST público: lo primero es `requireAdmin()`.
 * Sin eso, cualquiera podría gastar la cuota del proveedor mandando imágenes.
 *
 * La imagen se valida por MAGIC BYTES antes de salir del servidor, con la misma
 * función que el catálogo: ni `File.type` ni la extensión deciden qué se manda.
 *
 * ⚠️ Este archivo **solo puede exportar funciones async**. El estado inicial
 * (`ASSIST_IDLE`) vive en `lib/ai/assist-state.ts` por eso mismo: tenerlo aquí
 * rompía el módulo en el servidor y dejaba el formulario sin enviar.
 */

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";

/** Cada fallo dice qué hacer, sin nombres técnicos ni códigos. */
function failureMessage(reason: AssistantFailure): string {
  switch (reason) {
    case "NOT_CONFIGURED":
      return "El asistente no está configurado. Rellena la ficha a mano.";
    case "TIMEOUT":
      return "El asistente ha tardado demasiado. Prueba otra vez o rellena a mano.";
    case "IMAGE_REJECTED":
      return "No se ha podido analizar esta imagen. Prueba con otra foto.";
    case "UNUSABLE_RESPONSE":
    case "PROVIDER_ERROR":
    default:
      return "El asistente no ha podido ayudar esta vez. Rellena la ficha a mano.";
  }
}

export async function analyzeProductPhotoAction(
  _prev: AssistState,
  formData: FormData,
): Promise<AssistState> {
  if (!(await requireAdmin())) {
    return { status: "failed", result: null, message: FORBIDDEN };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "failed",
      result: null,
      // TODO(i18n)
      message: "Elige una foto antes de analizarla.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Mismo criterio que el catálogo: manda el CONTENIDO, no lo que diga el
  // navegador. Un SVG disfrazado de PNG no llega al proveedor.
  const check = checkImageUpload(bytes, file.type);
  if (!check.ok) {
    return { status: "failed", result: null, message: check.error };
  }

  const assistant = createAnthropicProductAssistant();
  if (!assistant.isConfigured()) {
    return {
      status: "failed",
      result: null,
      message: failureMessage("NOT_CONFIGURED"),
    };
  }

  const market = await getActiveMarket();
  const [categories, colors] = await Promise.all([
    listCategoriesForAdmin(market),
    listColors(),
  ]);

  const outcome = await assistant.suggestFromImage(
    { bytes, mediaType: `image/${check.format}` },
    {
      categories: categories.map((category) => ({
        slug: category.slug,
        name: category.name,
      })),
      colors: colors.map((color) => color.name),
      marketId: market.id,
      locale: market.locale,
    },
  );

  if (!outcome.ok) {
    return { status: "failed", result: null, message: failureMessage(outcome.reason) };
  }

  if (!isUsefulSuggestion(outcome.result)) {
    return {
      status: "failed",
      result: null,
      // No es un error: el modelo ha mirado y no ha sabido decir nada. Se dice
      // tal cual en vez de fingir un fallo técnico.
      // TODO(i18n)
      message: "El asistente no ha reconocido el artículo. Rellena la ficha a mano.",
    };
  }

  return { status: "ready", result: outcome.result, message: null };
}
