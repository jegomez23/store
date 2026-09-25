import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  FORBIDDEN_FIELDS,
  SUGGESTABLE_FIELDS,
  SUGGESTION_LIMITS,
  buildAssistantInstructions,
  isUsefulSuggestion,
  normalizeSuggestion,
  suggestionJsonSchema,
  type AssistantContext,
} from "../product-assistant.ts";

/**
 * El asistente de catálogo: qué puede proponer y, sobre todo, qué NO.
 *
 * La respuesta de un modelo es texto generado. Puede venir con campos de más,
 * con tipos absurdos, con una categoría que no existe o con una composición
 * perfectamente creíble que se ha inventado mirando una foto. Estos tests
 * fijan que nada de eso llega al formulario.
 *
 * Importación RELATIVA y con extensión: este archivo corre bajo `node --test`,
 * donde el alias `@/lib/...` no existe (lección del incremento 10).
 */

const CONTEXT: AssistantContext = {
  categories: [
    { slug: "camisetas", name: "Camisetas" },
    { slug: "sudaderas", name: "Sudaderas" },
  ],
  colors: ["Negro", "Verde bosque"],
  marketId: "00000000-0000-0000-0000-000000000001",
  locale: "es-ES",
};

/* ────────────────────── La frontera entre ver e inventar ────────────────── */

test("ningún campo prohibido puede ser también sugerible", () => {
  for (const field of SUGGESTABLE_FIELDS) {
    assert.equal(
      Object.hasOwn(FORBIDDEN_FIELDS, field),
      false,
      `${field} está a la vez en la lista blanca y en la negra`,
    );
  }
  // La lista negra no es decorativa: si se vacía, este test avisa.
  assert.ok(Object.keys(FORBIDDEN_FIELDS).length >= 8);
  for (const reason of Object.values(FORBIDDEN_FIELDS)) {
    assert.ok(reason.length > 0, "cada prohibición lleva su motivo");
  }
});

test("un campo prohibido en la respuesta NO llega a la sugerencia", () => {
  // Lo que un modelo escribiría alegremente mirando una camiseta gris.
  const { suggestion } = normalizeSuggestion(
    {
      name: "Camiseta oversize",
      materials: "100% algodón orgánico",
      price: 29.9,
      stock: 12,
      sizes: ["S", "M", "L"],
      sku: "CAM-001",
      supplier: "Proveedor X",
      supplierRef: "abc-123",
      origin: "Portugal",
      careInstructions: "Lavar a 30º",
      status: "published",
    },
    CONTEXT,
  );

  const keys = Object.keys(suggestion);
  for (const forbidden of Object.keys(FORBIDDEN_FIELDS)) {
    assert.equal(
      keys.includes(forbidden),
      false,
      `${forbidden} se ha colado en la sugerencia`,
    );
  }
  // Y lo que sí se ve, se conserva.
  assert.equal(suggestion.name, "Camiseta oversize");
});

test("el esquema JSON solo declara la lista blanca y prohíbe lo demás", () => {
  const schema = suggestionJsonSchema();
  assert.equal(schema.additionalProperties, false);

  const declared = Object.keys(schema.properties);
  assert.deepEqual([...declared].sort(), [...SUGGESTABLE_FIELDS].sort());
  for (const forbidden of Object.keys(FORBIDDEN_FIELDS)) {
    assert.equal(declared.includes(forbidden), false);
  }
});

/* ───────────────────── Solo lo que existe en el catálogo ────────────────── */

test("una categoría inexistente queda sin determinar, no se inventa", () => {
  const { suggestion, origin } = normalizeSuggestion(
    { categorySlug: "pantalones" },
    CONTEXT,
  );
  assert.equal(suggestion.categorySlug, null);
  assert.equal(origin.categorySlug, undefined);
});

test("una categoría existente se acepta, sin distinguir mayúsculas", () => {
  const { suggestion, origin } = normalizeSuggestion(
    { categorySlug: "SUDADERAS" },
    CONTEXT,
  );
  assert.equal(suggestion.categorySlug, "sudaderas");
  assert.equal(origin.categorySlug, "ai");
});

test("el color se devuelve con el nombre EXACTO del catálogo", () => {
  const { suggestion } = normalizeSuggestion({ colorName: "verde BOSQUE" }, CONTEXT);
  // No «verde BOSQUE»: el nombre que existe en la tabla.
  assert.equal(suggestion.colorName, "Verde bosque");
});

test("un color inexistente queda sin determinar", () => {
  const { suggestion, origin } = normalizeSuggestion({ colorName: "Fucsia" }, CONTEXT);
  assert.equal(suggestion.colorName, null);
  assert.equal(origin.colorName, undefined);
});

/* ─────────────────────────── «No determinado» ───────────────────────────── */

test("«no determinado» escrito como texto se trata como null", () => {
  for (const value of ["no determinado", "No Determinado", "n/a", "N/A", "null", "unknown", "  "]) {
    const { suggestion } = normalizeSuggestion({ name: value }, CONTEXT);
    assert.equal(suggestion.name, null, `"${value}" debería ser null`);
  }
});

test("null es un resultado legítimo y no marca origen", () => {
  const result = normalizeSuggestion(
    { name: null, shortDescription: null, description: null, categorySlug: null, colorName: null, keywords: [] },
    CONTEXT,
  );
  assert.deepEqual(result.origin, {});
  assert.equal(isUsefulSuggestion(result), false);
});

test("una sugerencia con un solo campo ya es útil", () => {
  const result = normalizeSuggestion({ name: "Sudadera" }, CONTEXT);
  assert.equal(isUsefulSuggestion(result), true);
  assert.deepEqual(result.origin, { name: "ai" });
});

/* ───────────────── Respuestas rotas: nunca una excepción ────────────────── */

test("una respuesta basura no lanza y devuelve todo sin determinar", () => {
  for (const raw of [null, undefined, 42, "texto suelto", [], true]) {
    const result = normalizeSuggestion(raw, CONTEXT);
    assert.equal(result.suggestion.name, null);
    assert.deepEqual(result.suggestion.keywords, []);
    assert.equal(isUsefulSuggestion(result), false);
  }
});

test("tipos absurdos en cada campo acaban en null, no en la ficha", () => {
  const { suggestion } = normalizeSuggestion(
    {
      name: { toString: "no soy un string" },
      shortDescription: 123,
      description: ["a", "b"],
      categorySlug: 7,
      colorName: false,
      keywords: "no soy un array",
    },
    CONTEXT,
  );
  assert.deepEqual(suggestion, {
    name: null,
    shortDescription: null,
    description: null,
    categorySlug: null,
    colorName: null,
    keywords: [],
  });
});

test("los textos se recortan al límite y se normaliza el espacio", () => {
  const { suggestion } = normalizeSuggestion(
    {
      name: "x".repeat(500),
      shortDescription: "linea\n\ncon   saltos\ty tabuladores",
      keywords: ["uno", 5, null, "dos", "tres", "cuatro", "cinco", "seis", "siete"],
    },
    CONTEXT,
  );
  assert.equal(suggestion.name?.length, SUGGESTION_LIMITS.name);
  assert.equal(suggestion.shortDescription, "linea con saltos y tabuladores");
  assert.equal(suggestion.keywords.length, SUGGESTION_LIMITS.keywords);
  assert.deepEqual(suggestion.keywords.slice(0, 2), ["uno", "dos"]);
});

/* ───────────────────────── Las instrucciones reales ─────────────────────── */

test("las instrucciones listan el catálogo REAL, no uno de ejemplo", () => {
  const prompt = buildAssistantInstructions(CONTEXT);
  assert.ok(prompt.includes("camisetas"));
  assert.ok(prompt.includes("Verde bosque"));
  assert.ok(prompt.includes("no inventes"));
});

test("las instrucciones enumeran cada prohibición con su motivo", () => {
  const prompt = buildAssistantInstructions(CONTEXT);
  for (const [field, reason] of Object.entries(FORBIDDEN_FIELDS)) {
    assert.ok(prompt.includes(field), `falta la prohibición de ${field}`);
    assert.ok(prompt.includes(reason), `falta el motivo de ${field}`);
  }
});

test("un catálogo vacío no produce una lista falsa", () => {
  const prompt = buildAssistantInstructions({ ...CONTEXT, categories: [], colors: [] });
  assert.ok(prompt.includes("(no hay categorías)"));
  assert.ok(prompt.includes("(no hay colores)"));
});

/* ═══════════════════ Invariantes de seguridad, leídas del código ═════════ */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

test("la action de analizar NO puede escribir en la base de datos", () => {
  const source = read("app/admin/(panel)/catalogo/nuevo/ai-actions.ts");

  // Sin cliente de escritura, sin RPC, sin revalidación: no hay forma de que
  // una respuesta del modelo acabe en una tabla.
  for (const forbidden of ["supabase/server", "supabase/admin", ".insert(", ".update(", ".rpc(", ".delete(", "revalidatePath"]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `ai-actions.ts no debe contener "${forbidden}"`,
    );
  }
});

test("la action de analizar pide admin ANTES que nada", () => {
  const source = read("app/admin/(panel)/catalogo/nuevo/ai-actions.ts");
  const body = source.slice(source.indexOf("export async function analyzeProductPhotoAction"));
  const guard = body.indexOf("requireAdmin()");
  const readsFile = body.indexOf('formData.get("photo")');
  assert.ok(guard > 0, "falta requireAdmin()");
  assert.ok(guard < readsFile, "requireAdmin() debe ir antes de tocar la imagen");
});

test("la imagen se valida por magic bytes antes de salir del servidor", () => {
  const source = read("app/admin/(panel)/catalogo/nuevo/ai-actions.ts");
  assert.ok(source.includes("checkImageUpload"));
  const check = source.indexOf("checkImageUpload(bytes");
  const send = source.indexOf("suggestFromImage");
  assert.ok(check > 0 && check < send, "la validación va antes del envío");
});

test("no se manda al proveedor ningún dato de cliente, pedido ni proveedor", () => {
  const source = read("app/admin/(panel)/catalogo/nuevo/ai-actions.ts");
  for (const pii of ["customer", "order", "phone", "email", "address", "supplier"]) {
    assert.equal(
      source.toLowerCase().includes(pii),
      false,
      `ai-actions.ts no debe mencionar "${pii}": no puede salir del proyecto`,
    );
  }
});

test("la clave del proveedor sale del entorno y NUNCA está escrita en el código", () => {
  const adapter = read("lib/ai/gemini-assistant.ts");
  assert.ok(adapter.includes("process.env.GEMINI_API_KEY"));
  assert.ok(adapter.includes('import "server-only"'), "el adaptador es solo de servidor");

  // Ni aquí ni en ninguna parte del repositorio: una clave real empieza así.
  for (const file of [
    "lib/ai/gemini-assistant.ts",
    "lib/ai/product-assistant.ts",
    "app/admin/(panel)/catalogo/nuevo/ai-actions.ts",
    "components/admin/NewProductFlow.tsx",
    "app/admin/(panel)/catalogo/nuevo/page.tsx",
  ]) {
    // Prefijos reales de clave: Anthropic (`sk-ant-`) y Google (`AIza`).
    // El primero se mantiene aunque ese adaptador ya no exista: una clave
    // pegada por error no deja de ser una clave pegada por error.
    for (const prefijo of ["sk-ant-", "AIza"]) {
      assert.equal(
        read(file).includes(prefijo),
        false,
        `${file} contiene una clave (${prefijo}…)`,
      );
    }
  }
});

test("la clave no puede llegar al navegador: nada de NEXT_PUBLIC", () => {
  const adapter = read("lib/ai/gemini-assistant.ts");
  // Se mira el USO, no la palabra: la cabecera del archivo explica justamente
  // que la clave no lleva ese prefijo.
  assert.equal(adapter.includes("process.env.NEXT_PUBLIC"), false);
  // El componente de cliente solo recibe un booleano.
  const flow = read("components/admin/NewProductFlow.tsx");
  assert.equal(flow.includes("GEMINI"), false);
  assert.equal(flow.includes("process.env"), false);
});

test("el adaptador devuelve fallos tipados y no lanza", () => {
  const adapter = read("lib/ai/gemini-assistant.ts");
  for (const reason of ["NOT_CONFIGURED", "TIMEOUT", "PROVIDER_ERROR", "UNUSABLE_RESPONSE", "IMAGE_REJECTED"]) {
    assert.ok(adapter.includes(reason), `falta el fallo ${reason}`);
  }
  assert.ok(adapter.includes("try {") && adapter.includes("} catch"));
  // Nada de `throw` propio: que el asistente falle no puede tumbar la pantalla.
  assert.equal(/\bthrow\b/.test(adapter), false);
});

test("el módulo puro no habla con nadie", () => {
  const pure = read("lib/ai/product-assistant.ts");
  // Sin imports en runtime: por eso este archivo puede correr bajo node --test.
  assert.equal(/^import\s+(?!type)/m.test(pure), false);
  assert.equal(pure.includes("fetch("), false);
});

test("la pantalla de crear producto funciona sin IA", () => {
  const flow = read("components/admin/NewProductFlow.tsx");
  // El formulario se envía a la action de siempre, no a nada del asistente.
  assert.ok(flow.includes("createProductWithPhotoAction"));
  // Y el botón de analizar se desactiva solo, sin bloquear el resto.
  assert.ok(flow.includes("assistantAvailable"));
  /*
    Incremento 21: el texto del «no» ya no está escrito aquí. Hay tres estados
    —apagada, sin proveedor y lista— y sus mensajes viven en
    `AVAILABILITY_MESSAGE`, para que apagada y sin configurar no digan lo
    mismo (DEC-087). Lo que se comprueba es que la pantalla los consume.
  */
  assert.ok(flow.includes("AVAILABILITY_MESSAGE"));
  assert.equal(
    flow.includes("Asistente no configurado"),
    false,
    "el mensaje no se reescribe en el componente",
  );
});

test("la IA no publica: el producto nace en borrador", () => {
  const actions = read("app/admin/(panel)/catalogo/actions.ts");
  const body = actions.slice(actions.indexOf("export async function createProductWithPhotoAction"));
  assert.ok(body.includes('status: "draft"'), "createProductWithPhoto debe crear en borrador");
  assert.equal(body.includes('status: "published"'), false);
  // Ni precio ni stock: eso vive en las variantes y lo decide una persona.
  assert.equal(body.includes("price"), false);
  assert.equal(body.includes("stock"), false);
});
