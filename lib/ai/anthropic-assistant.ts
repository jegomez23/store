import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildAssistantInstructions,
  normalizeSuggestion,
  suggestionJsonSchema,
  type AssistantContext,
  type AssistantOutcome,
  type ProductAssistant,
} from "@/lib/ai/product-assistant";

/**
 * Adaptador del asistente de catálogo sobre la API de Claude (incremento 20).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLO SERVIDOR, Y SOLO CUANDO EL ADMINISTRADOR LO PIDE
 * ═══════════════════════════════════════════════════════════════════════════
 * `server-only` impide que este archivo entre en un bundle de cliente: la clave
 * vive en `ANTHROPIC_API_KEY`, sin prefijo `NEXT_PUBLIC_`, y nunca sale del
 * servidor. La foto viaja al proveedor **únicamente** cuando el administrador
 * pulsa «Analizar foto»; no hay ningún proceso que mande imágenes por su
 * cuenta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SALE DEL PROYECTO, Y QUÉ NO
 * ═══════════════════════════════════════════════════════════════════════════
 * SALE: los bytes de UNA fotografía de producto que el administrador acaba de
 * elegir, más la lista de categorías y colores del catálogo —que son públicos,
 * se pintan en la tienda—.
 *
 * NO SALE, y no hay código que pueda mandarlo: ningún dato de cliente, pedido,
 * teléfono, email, dirección, proveedor ni referencia interna. El contexto que
 * se construye (`AssistantContext`) no tiene forma de contenerlos.
 *
 * No se guarda el prompt ni la respuesta en ninguna tabla: la sugerencia vive
 * en la pantalla hasta que el administrador la acepta, y entonces lo que se
 * guarda es el campo real del producto, no una copia de lo que dijo la IA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SI ESTO FALLA, NO PASA NADA
 * ═══════════════════════════════════════════════════════════════════════════
 * Sin clave, con timeout, con un 500 del proveedor o con una respuesta
 * ilegible, `suggestFromImage` devuelve un fallo TIPADO. Nunca lanza. La
 * pantalla de crear producto sigue funcionando exactamente igual que sin IA:
 * el asistente es un acelerador, no una dependencia.
 */

/**
 * Modelo por defecto.
 *
 * `claude-opus-5` es el modelo actual de Anthropic para este tipo de trabajo.
 * Se deja configurable por entorno porque la elección —calidad frente a coste
 * por foto— es del negocio, no del código: un catálogo grande puede querer un
 * modelo más barato y esta pantalla no cambia por ello.
 */
const DEFAULT_MODEL = "claude-opus-5";

/**
 * Una foto de producto ya recortada a 512 px no necesita más: la respuesta son
 * unas pocas frases. Un tope bajo acota también el coste por operación.
 */
const MAX_TOKENS = 1024;

/** Nadie espera más de esto delante de un formulario. */
const TIMEOUT_MS = 25_000;

/** Formatos que acepta la API de Claude para imágenes. */
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function createAnthropicProductAssistant(): ProductAssistant {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_PRODUCT_MODEL ?? DEFAULT_MODEL;

  return {
    isConfigured() {
      return typeof apiKey === "string" && apiKey.length > 0;
    },

    async suggestFromImage(image, context: AssistantContext): Promise<AssistantOutcome> {
      if (!apiKey) return { ok: false, reason: "NOT_CONFIGURED" };

      if (!SUPPORTED_MEDIA_TYPES.has(image.mediaType)) {
        return { ok: false, reason: "IMAGE_REJECTED" };
      }

      const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

      try {
        /*
          Salida estructurada: el modelo responde contra el esquema de la lista
          blanca, así que no hay que parsear prosa ni adivinar. Aun así la
          respuesta pasa por `normalizeSuggestion`, que es quien decide qué vale
          — una categoría inexistente se descarta aquí, no allí.
        */
        const response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: buildAssistantInstructions(context),
          output_config: {
            // El SDK acepta `type` y `schema`: no hay campo `name`.
            format: {
              type: "json_schema",
              schema: suggestionJsonSchema(),
            },
          },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                    data: Buffer.from(image.bytes).toString("base64"),
                  },
                },
                {
                  type: "text",
                  text: "Propón los datos de ficha de este artículo. Lo que no se vea, null.",
                },
              ],
            },
          ],
        });

        // Una negativa del modelo no es un error de red: se trata aparte.
        if (response.stop_reason === "refusal") {
          console.error("[ai] el modelo declinó analizar la imagen");
          return { ok: false, reason: "IMAGE_REJECTED" };
        }

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

        if (text.trim().length === 0) return { ok: false, reason: "UNUSABLE_RESPONSE" };

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Respuesta malformada: se descarta entera. Nunca se intenta
          // rescatar texto suelto para meterlo en un campo.
          console.error("[ai] respuesta no era JSON");
          return { ok: false, reason: "UNUSABLE_RESPONSE" };
        }

        return { ok: true, result: normalizeSuggestion(parsed, context) };
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          console.error("[ai] timeout del proveedor");
          return { ok: false, reason: "TIMEOUT" };
        }
        // Sin el mensaje crudo del proveedor: puede contener el prompt.
        console.error("[ai] fallo del proveedor", {
          name: error instanceof Error ? error.name : "desconocido",
          status: error instanceof Anthropic.APIError ? error.status : undefined,
        });
        return { ok: false, reason: "PROVIDER_ERROR" };
      }
    },
  };
}
