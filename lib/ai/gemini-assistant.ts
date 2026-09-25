import "server-only";
import {
  normalizeSuggestion,
  type AssistantContext,
  type AssistantOutcome,
  type ProductAssistant,
} from "@/lib/ai/product-assistant";
import {
  buildGeminiRequest,
  extractJsonText,
  parseJson,
} from "@/lib/ai/gemini-shape";

/**
 * Adaptador del asistente de catálogo sobre la API de Gemini (incremento 21).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ GEMINI, Y POR QUÉ CON `fetch`
 * ═══════════════════════════════════════════════════════════════════════════
 * La API de Anthropic es de pago y la cuenta no tiene saldo: medido, devolvía
 * `400 invalid_request_error · "Your credit balance is too low"`, así que el
 * asistente nunca llegaba a proponer nada. Gemini tiene un tramo **gratuito
 * permanente** (Flash, sin tarjeta) suficiente de sobra para dar de alta
 * productos a mano: 10 peticiones por minuto y 1.500 al día.
 *
 * Y se habla con `fetch`: su API es JSON plano, así que el SDK no aporta nada
 * que no se escriba aquí en veinte líneas. **Cero dependencias nuevas** —y de
 * paso se retira `@anthropic-ai/sdk`, que eran 12 MB en `node_modules` para
 * una llamada— (regla 8 de CLAUDE.md).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ EL TRAMO GRATUITO ENTRENA CON LO QUE SE LE MANDA
 * ═══════════════════════════════════════════════════════════════════════════
 * La documentación de precios de Google lo dice explícitamente: en el tramo
 * gratuito el contenido **sí** se usa para mejorar sus productos; en el de
 * pago, no. Decisión tomada a sabiendas (DEC-087): lo único que sale de aquí
 * es la FOTO de un artículo que va a estar publicada en la tienda de todas
 * formas, más las categorías y colores, que también son públicos.
 *
 * Lo que NO sale, y no hay código que pueda mandarlo: ningún dato de cliente,
 * pedido, teléfono, email, dirección, proveedor ni referencia interna. El
 * contexto (`AssistantContext`) no tiene forma de contenerlos.
 *
 * Por eso el interruptor de `/admin/ajustes` nace APAGADO: mandar una foto a
 * un tercero es una decisión, no un estado inicial.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SI ESTO FALLA, NO PASA NADA
 * ═══════════════════════════════════════════════════════════════════════════
 * Sin clave, con timeout, con un 429 por cuota agotada o con una respuesta
 * ilegible, `suggestFromImage` devuelve un fallo TIPADO. Nunca lanza. El alta
 * de producto sigue funcionando igual que sin IA.
 */

/** `x-goog-api-key` + JSON plano. Sin SDK. */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Modelo por defecto.
 *
 * Un Flash del tramo gratuito: para mirar UNA foto y escribir tres frases no
 * hace falta más, y es lo que mantiene el coste en cero. Configurable por
 * entorno porque la elección —calidad frente a cuota— es del negocio.
 */
const DEFAULT_MODEL = "gemini-3.5-flash";

/** Nadie espera más de esto delante de un formulario. */
const TIMEOUT_MS = 25_000;

/** Formatos que acepta la API para imágenes en línea. */
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function createGeminiProductAssistant(): ProductAssistant {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_PRODUCT_MODEL ?? DEFAULT_MODEL;

  return {
    isConfigured() {
      return typeof apiKey === "string" && apiKey.length > 0;
    },

    async suggestFromImage(image, context: AssistantContext): Promise<AssistantOutcome> {
      if (!apiKey) return { ok: false, reason: "NOT_CONFIGURED" };

      if (!SUPPORTED_MEDIA_TYPES.has(image.mediaType)) {
        return { ok: false, reason: "IMAGE_REJECTED" };
      }

      const body = buildGeminiRequest(
        {
          base64: Buffer.from(image.bytes).toString("base64"),
          mediaType: image.mediaType,
        },
        context,
        model,
      );

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const abortada =
          error instanceof DOMException && error.name === "TimeoutError";
        if (abortada) {
          console.error("[ai] timeout del proveedor");
          return { ok: false, reason: "TIMEOUT" };
        }
        // Sin el mensaje crudo: puede contener la petición, y la petición
        // lleva la foto.
        console.error("[ai] no se pudo contactar con el proveedor", {
          name: error instanceof Error ? error.name : "desconocido",
        });
        return { ok: false, reason: "PROVIDER_ERROR" };
      }

      if (!response.ok) {
        /*
          Se registra SOLO el código. 400 suele ser clave inválida, 429 cuota
          agotada; ninguna de las dos cosas se le cuenta al administrador con
          el texto del proveedor, que puede venir en inglés y con jerga.
        */
        console.error("[ai] fallo del proveedor", { status: response.status });
        return { ok: false, reason: "PROVIDER_ERROR" };
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        console.error("[ai] la respuesta no era JSON");
        return { ok: false, reason: "UNUSABLE_RESPONSE" };
      }

      const text = extractJsonText(payload);
      if (text === null) {
        console.error("[ai] no se encontró texto en la respuesta");
        return { ok: false, reason: "UNUSABLE_RESPONSE" };
      }

      let parsed: unknown;
      try {
        parsed = parseJson(text);
      } catch {
        console.error("[ai] el texto de la respuesta no era JSON");
        return { ok: false, reason: "UNUSABLE_RESPONSE" };
      }

      // La respuesta del modelo NO decide nada: `normalizeSuggestion` descarta
      // lo que no exista en el catálogo y lo que no esté en la lista blanca.
      return { ok: true, result: normalizeSuggestion(parsed, context) };
    },
  };
}
