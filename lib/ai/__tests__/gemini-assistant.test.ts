import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGeminiRequest, extractJsonText } from "../gemini-shape.ts";
import type { AssistantContext } from "../product-assistant.ts";

/*
  Las funciones puras viven en `gemini-shape.ts` y no en el adaptador: este
  lleva `import "server-only"`, que NO resuelve bajo `node --test` (medido:
  ERR_MODULE_NOT_FOUND). Las invariantes del adaptador se comprueban leyendo
  su código, que sí se puede.
*/

const CONTEXT: AssistantContext = {
  categories: [
    { slug: "camisetas", name: "Camisetas" },
    { slug: "gorras", name: "Gorras" },
  ],
  colors: ["Negro", "Verde bosque"],
  marketId: "ES",
  locale: "es-ES",
};

/** La forma que este test espera del cuerpo, para no usar `any`. */
interface GeminiBody {
  model: string;
  system_instruction: string;
  input: { type: string; text?: string; data?: string; mime_type?: string }[];
  response_format: {
    type: string;
    mime_type: string;
    schema: { properties: Record<string, unknown> };
  };
}

describe("buildGeminiRequest", () => {
  const body = buildGeminiRequest(
    { base64: "QUJD", mediaType: "image/jpeg" },
    CONTEXT,
    "gemini-3.5-flash",
  ) as unknown as GeminiBody;

  test("manda el modelo pedido", () => {
    assert.equal(body.model, "gemini-3.5-flash");
  });

  test("manda la foto en línea, con su tipo", () => {
    const imagen = body.input.find((parte) => parte.type === "image");
    assert.equal(imagen?.data, "QUJD");
    assert.equal(imagen?.mime_type, "image/jpeg");
  });

  test("las instrucciones llevan el catálogo REAL, no categorías inventadas", () => {
    assert.match(body.system_instruction, /camisetas/);
    assert.match(body.system_instruction, /Verde bosque/);
  });

  test("pide JSON contra el esquema de la lista blanca", () => {
    assert.equal(body.response_format.mime_type, "application/json");
    const propiedades = Object.keys(body.response_format.schema.properties);
    assert.deepEqual(propiedades.sort(), [
      "categorySlug",
      "colorName",
      "description",
      "keywords",
      "name",
      "shortDescription",
    ]);
  });

  test("el esquema NO admite ningún campo prohibido", () => {
    const esquema = JSON.stringify(body.response_format.schema);
    for (const prohibido of ["price", "stock", "materials", "sizes", "supplier", "status"]) {
      assert.equal(esquema.includes(prohibido), false, `el esquema admite ${prohibido}`);
    }
  });

  test("no viaja nada más: solo modelo, instrucciones, entrada y formato", () => {
    assert.deepEqual(Object.keys(body).sort(), [
      "input",
      "model",
      "response_format",
      "system_instruction",
    ]);
  });
});

describe("extractJsonText · tolerante a la forma de la respuesta", () => {
  const ESPERADO = '{"name":"Gorra"}';

  test("forma steps[].outputs[]", () => {
    assert.equal(
      extractJsonText({
        steps: [{ role: "assistant", outputs: [{ type: "text", text: ESPERADO }] }],
      }),
      ESPERADO,
    );
  });

  test("forma steps[].content[]", () => {
    assert.equal(
      extractJsonText({ steps: [{ content: [{ type: "text", text: ESPERADO }] }] }),
      ESPERADO,
    );
  });

  test("comodidad output_text", () => {
    assert.equal(extractJsonText({ output_text: ESPERADO }), ESPERADO);
  });

  test("forma clásica candidates[].content.parts[]", () => {
    assert.equal(
      extractJsonText({
        candidates: [{ content: { parts: [{ text: ESPERADO }] } }],
      }),
      ESPERADO,
    );
  });

  test("junta los fragmentos en orden cuando vienen partidos", () => {
    assert.equal(
      extractJsonText({
        steps: [
          {
            outputs: [
              { type: "text", text: '{"name":' },
              { type: "text", text: '"Gorra"}' },
            ],
          },
        ],
      }),
      ESPERADO,
    );
  });

  test("una respuesta sin texto devuelve null en vez de lanzar", () => {
    assert.equal(extractJsonText({}), null);
    assert.equal(extractJsonText(null), null);
    assert.equal(extractJsonText("una cadena suelta"), null);
    assert.equal(extractJsonText({ steps: [] }), null);
    assert.equal(extractJsonText({ error: { message: "algo" } }), null);
  });

  test("no se traga el texto de un bloque que no es de texto", () => {
    // Un bloque de imagen con `text` no es la respuesta del modelo.
    assert.equal(extractJsonText({ steps: [{ outputs: [{ type: "image", text: "x" }] }] }), null);
  });

  test("no se pierde en una respuesta profundamente anidada", () => {
    const profundo = { a: { b: { c: { d: { e: { f: { text: "x" } } } } } } } as unknown;
    assert.equal(extractJsonText(profundo), null);
  });
});

describe("invariantes del adaptador", () => {
  const source = readFileSync(new URL("../gemini-assistant.ts", import.meta.url), "utf8") + readFileSync(new URL("../gemini-shape.ts", import.meta.url), "utf8");

  test("cero dependencias: habla con fetch", () => {
    assert.ok(source.includes("fetch("));
    // Se mira el USO, no la palabra: la cabecera del adaptador explica
    // justamente que ese paquete se ha retirado, así que nombrarlo es correcto.
    assert.equal(/from "@anthropic-ai\/sdk"/.test(source), false);
    // Solo `server-only`, el alias interno del proyecto y rutas relativas:
    // ningún paquete de terceros.
    assert.equal(/^import .* from "(?!server-only|@\/lib|\.)/m.test(source), false);
  });

  test("el adaptador anterior ya no existe", () => {
    let existe = true;
    try {
      readFileSync(new URL("../anthropic-assistant.ts", import.meta.url), "utf8");
    } catch {
      existe = false;
    }
    assert.equal(existe, false, "lib/ai/anthropic-assistant.ts debería estar borrado");
  });

  test("no registra el cuerpo de la petición: lleva la foto dentro", () => {
    // Se permite registrar el `status`, nunca el body ni la respuesta cruda.
    assert.equal(/console\.error\([^)]*body/.test(source), false);
    assert.equal(/console\.error\([^)]*payload/.test(source), false);
  });

  test("el timeout está acotado", () => {
    assert.ok(source.includes("AbortSignal.timeout"));
  });
});
