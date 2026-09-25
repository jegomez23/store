/**
 * Forma de la petición y de la respuesta de Gemini (incremento 21).
 *
 * Vive aparte del adaptador por una razón concreta: `gemini-assistant.ts`
 * lleva `import "server-only"`, que NO resuelve bajo `node --test`, y estas
 * dos funciones son justo las que hay que poder comprobar sin red —cómo se
 * arma el cuerpo y cómo se lee la respuesta—. Mismo patrón que el resto del
 * proyecto: la lógica pura en un módulo sin I/O (DEC-025).
 */
import {
  buildAssistantInstructions,
  suggestionJsonSchema,
  type AssistantContext,
} from "./product-assistant.ts";
/**
 * Cuerpo de la petición. Función PURA: se puede comprobar en un test que manda
 * el esquema de la lista blanca y que no mete nada más.
 */
export function buildGeminiRequest(
  image: { base64: string; mediaType: string },
  context: AssistantContext,
  model: string,
): Record<string, unknown> {
  return {
    model,
    system_instruction: buildAssistantInstructions(context),
    input: [
      { type: "image", data: image.base64, mime_type: image.mediaType },
      {
        type: "text",
        text: "Propón los datos de ficha de este artículo. Lo que no se vea, null.",
      },
    ],
    // Salida estructurada contra el MISMO esquema que usaba el adaptador
    // anterior: la lista blanca no es del proveedor, es del proyecto.
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: suggestionJsonSchema(),
    },
  };
}

/**
 * Saca el texto generado de la respuesta.
 *
 * ⚠️ TOLERANTE A PROPÓSITO. La API de Gemini ha movido esta forma más de una
 * vez —`candidates[].content.parts[]` en el endpoint clásico, y en el de
 * `interactions` la documentación muestra tanto `steps[].outputs[]` como
 * `steps[].content[]`, además de la comodidad `output_text` en sus SDK—. Como
 * aquí no hay SDK que absorba el cambio, se recogen todas las formas conocidas
 * en vez de apostar por una: si mañana devuelve otra cosa, el peor caso es
 * `UNUSABLE_RESPONSE` y el formulario se rellena a mano, no una excepción en
 * la cara del administrador.
 *
 * Función pura, con un test por cada forma.
 */
export function extractJsonText(payload: unknown): string | null {
  const trozos: string[] = [];

  const recoger = (valor: unknown, profundidad: number): void => {
    if (profundidad > 6 || valor === null || typeof valor !== "object") return;

    if (Array.isArray(valor)) {
      for (const elemento of valor) recoger(elemento, profundidad + 1);
      return;
    }

    const objeto = valor as Record<string, unknown>;

    // `output_text`: la comodidad que exponen sus SDK.
    if (typeof objeto.output_text === "string" && objeto.output_text.trim()) {
      trozos.push(objeto.output_text);
    }

    /*
      Un bloque de texto es `{type: "text", text: "…"}`. Se exige el `type`
      para no tragarse por error cualquier otra propiedad llamada `text`
      —por ejemplo la de un bloque de error—.
    */
    if (objeto.type === "text" && typeof objeto.text === "string") {
      trozos.push(objeto.text);
    }

    for (const clave of ["steps", "outputs", "content", "parts", "candidates"]) {
      if (clave in objeto) recoger(objeto[clave], profundidad + 1);
    }

    // `candidates[].content.parts[].text` del endpoint clásico: ahí los
    // fragmentos no llevan `type`.
    if (typeof objeto.text === "string" && objeto.type === undefined) {
      trozos.push(objeto.text);
    }
  };

  recoger(payload, 0);

  const texto = trozos.join("").trim();
  return texto.length > 0 ? texto : null;
}

/**
 * El JSON puede venir envuelto en un bloque de código si el modelo ignora el
 * `response_format`. Se le quita la valla antes de parsear; si aun así no es
 * JSON, se descarta entero — **nunca** se rescata texto suelto para meterlo en
 * un campo.
 */
export function parseJson(text: string): unknown {
  const limpio = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(limpio);
}

