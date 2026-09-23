/**
 * Asistente de creación de producto — CONTRATO Y LÓGICA PURA (incremento 20).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA IA PROPONE. EL ADMINISTRADOR DECIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 * Este módulo define QUÉ puede sugerir un asistente y, sobre todo, qué NO. No
 * habla con ningún proveedor: es el contrato que cualquier adaptador tiene que
 * cumplir y el filtro por el que pasa todo lo que devuelva.
 *
 * Nada de lo que salga de aquí se guarda solo. El resultado es una SUGERENCIA
 * que rellena campos de un formulario; guardar sigue siendo un acto del
 * administrador, con las mismas Server Actions y la misma autorización de
 * siempre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE SE PUEDE VER EN UNA FOTO, Y LO QUE NO
 * ═══════════════════════════════════════════════════════════════════════════
 * La lista blanca de abajo no es una preferencia de producto: es la frontera
 * entre observar e inventar.
 *
 *   SE VE           nombre, descripción corta, categoría, color aparente,
 *                   estilo, palabras clave.
 *   NO SE VE        composición, material, gramaje, tallas, precio, stock,
 *                   proveedor, referencia, origen, certificaciones,
 *                   instrucciones de lavado, plazos de entrega.
 *
 * Un modelo puede escribir «100% algodón orgánico» mirando una camiseta gris,
 * y sonará perfectamente creíble. Por eso esos campos **no existen** en el
 * tipo de la sugerencia: no es que se filtren después, es que no hay dónde
 * ponerlos. Lo que no se puede determinar se queda como `null` y lo completa
 * una persona.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

/** Campos que un asistente PUEDE proponer. Añadir aquí es una decisión. */
export const SUGGESTABLE_FIELDS = [
  "name",
  "shortDescription",
  "description",
  "categorySlug",
  "colorName",
  "keywords",
] as const;

export type SuggestableField = (typeof SUGGESTABLE_FIELDS)[number];

/**
 * Campos que un asistente NUNCA puede proponer, con el motivo.
 *
 * Existe como dato —y no solo como comentario— para que un test pueda
 * comprobar que ninguno se ha colado en la sugerencia.
 */
export const FORBIDDEN_FIELDS: Readonly<Record<string, string>> = {
  materials: "la composición no se ve en una foto",
  careInstructions: "las instrucciones de lavado están en la etiqueta, no en la foto",
  price: "el precio es una decisión comercial, no una observación",
  stock: "el stock lo dicta el proveedor externo",
  sku: "lo genera el catálogo",
  supplier: "dato interno de abastecimiento",
  supplierRef: "dato interno de abastecimiento",
  sizes: "las tallas no se deducen de una foto",
  origin: "el origen no es observable",
  status: "publicar es un acto del administrador",
} as const;

export const SUGGESTION_LIMITS = {
  name: 80,
  shortDescription: 160,
  description: 600,
  colorName: 40,
  keyword: 32,
  keywords: 6,
} as const;

/**
 * Una sugerencia ya saneada. `null` significa **«no determinado»**, y es un
 * resultado legítimo: la interfaz lo dice y el administrador lo rellena.
 */
export interface ProductSuggestion {
  name: string | null;
  shortDescription: string | null;
  description: string | null;
  /** Slug de una categoría EXISTENTE. Nunca una categoría inventada. */
  categorySlug: string | null;
  /** Nombre de un color EXISTENTE en el catálogo. */
  colorName: string | null;
  keywords: string[];
}

/** Qué campos vienen de la IA, para poder marcarlos en la interfaz. */
export type SuggestionOrigin = Partial<Record<SuggestableField, "ai">>;

export interface AssistantResult {
  suggestion: ProductSuggestion;
  origin: SuggestionOrigin;
}

/** El contexto REAL del catálogo. Nada de esto se inventa. */
export interface AssistantContext {
  /** Categorías existentes del mercado: la IA elige entre ellas o ninguna. */
  categories: { slug: string; name: string }[];
  /** Colores existentes: la IA elige entre ellos o ninguno. */
  colors: string[];
  /** Mercado activo, para el idioma y la moneda del tono. */
  marketId: string;
  locale: string;
}

/** Por qué no hay sugerencia. La interfaz los traduce; nunca se muestran crudos. */
export type AssistantFailure =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "UNUSABLE_RESPONSE"
  | "IMAGE_REJECTED";

export type AssistantOutcome =
  | { ok: true; result: AssistantResult }
  | { ok: false; reason: AssistantFailure };

/**
 * EL PUERTO. Un adaptador implementa esto y nada más.
 *
 * Devuelve un resultado tipado en lugar de lanzar: que el asistente falle no
 * puede impedir crear el producto, así que la pantalla necesita poder seguir
 * sin excepciones que la tumben.
 */
export interface ProductAssistant {
  /** `false` cuando no hay proveedor configurado: la interfaz no ofrece el botón. */
  isConfigured(): boolean;
  suggestFromImage(
    image: { bytes: Uint8Array; mediaType: string },
    context: AssistantContext,
  ): Promise<AssistantOutcome>;
}

/* ───────────────────────── Saneado de la respuesta ───────────────────────── */

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  /*
    «No determinado» puede llegar como texto si el modelo decide escribirlo en
    vez de mandar null. Se trata como null: es la misma respuesta.
  */
  if (/^(no determinado|desconocido|n\/?a|null|none|unknown)$/i.test(trimmed)) {
    return null;
  }
  return trimmed.slice(0, max);
}

/**
 * Convierte lo que devuelva un proveedor en una sugerencia utilizable.
 *
 * ⚠️ **NO SE FÍA DE NADA.** La respuesta de un modelo es texto generado: puede
 * venir incompleta, con campos de más, con tipos absurdos o con una categoría
 * que no existe. Todo eso acaba en `null`, nunca en una excepción y nunca en
 * un valor inventado.
 *
 * En particular, `categorySlug` y `colorName` se comprueban **contra el
 * catálogo real**: si el modelo propone «sudaderas» y esa categoría no existe,
 * el campo queda sin determinar en vez de crear una categoría fantasma.
 */
export function normalizeSuggestion(
  raw: unknown,
  context: AssistantContext,
): AssistantResult {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const name = cleanText(source.name, SUGGESTION_LIMITS.name);
  const shortDescription = cleanText(
    source.shortDescription,
    SUGGESTION_LIMITS.shortDescription,
  );
  const description = cleanText(source.description, SUGGESTION_LIMITS.description);

  // Solo una categoría que EXISTE en este mercado.
  const proposedCategory = cleanText(source.categorySlug, 120)?.toLowerCase() ?? null;
  const categorySlug =
    proposedCategory !== null &&
    context.categories.some((category) => category.slug === proposedCategory)
      ? proposedCategory
      : null;

  // Solo un color que EXISTE en el catálogo, comparado sin distinguir mayúsculas.
  const proposedColor = cleanText(source.colorName, SUGGESTION_LIMITS.colorName);
  const colorName =
    proposedColor !== null
      ? (context.colors.find(
          (color) => color.toLowerCase() === proposedColor.toLowerCase(),
        ) ?? null)
      : null;

  const keywords = Array.isArray(source.keywords)
    ? source.keywords
        .map((keyword) => cleanText(keyword, SUGGESTION_LIMITS.keyword))
        .filter((keyword): keyword is string => keyword !== null)
        .slice(0, SUGGESTION_LIMITS.keywords)
    : [];

  const suggestion: ProductSuggestion = {
    name,
    shortDescription,
    description,
    categorySlug,
    colorName,
    keywords,
  };

  const origin: SuggestionOrigin = {};
  if (name) origin.name = "ai";
  if (shortDescription) origin.shortDescription = "ai";
  if (description) origin.description = "ai";
  if (categorySlug) origin.categorySlug = "ai";
  if (colorName) origin.colorName = "ai";
  if (keywords.length > 0) origin.keywords = "ai";

  return { suggestion, origin };
}

/** ¿Ha aportado algo? Una sugerencia vacía no merece pintarse como éxito. */
export function isUsefulSuggestion(result: AssistantResult): boolean {
  return Object.keys(result.origin).length > 0;
}

/**
 * Las instrucciones que recibe el modelo.
 *
 * Se construyen a partir del catálogo REAL —categorías y colores que existen
 * hoy— para que no pueda proponer nada que no se pueda guardar. Es también el
 * sitio donde se le prohíbe explícitamente inventar lo que no se ve.
 *
 * Función pura: se puede comprobar en un test que menciona las categorías
 * reales y que contiene las prohibiciones.
 */
export function buildAssistantInstructions(context: AssistantContext): string {
  const categories = context.categories
    .map((category) => `- ${category.slug} (${category.name})`)
    .join("\n");
  const colors = context.colors.map((color) => `- ${color}`).join("\n");

  return [
    "Eres el asistente de catálogo de YI, una tienda de ropa, calzado y accesorios",
    "de estilo streetwear con referencias a la naturaleza y a la ciudad.",
    "",
    "Miras UNA fotografía de un artículo y propones los datos de su ficha.",
    "",
    "TONO: español de España, directo y concreto, sin superlativos publicitarios,",
    "sin promesas y sin exclamaciones. Frases cortas.",
    "",
    "REGLA ABSOLUTA: describe SOLO lo que se ve en la foto.",
    "Si un dato no se puede determinar mirando la imagen, devuelve null.",
    "Devolver null es una respuesta correcta y esperada; inventar no lo es.",
    "",
    "NUNCA propongas —no son observables en una fotografía—:",
    ...Object.entries(FORBIDDEN_FIELDS).map(([field, why]) => `- ${field}: ${why}`),
    "",
    `Categorías que existen (usa el slug EXACTO o null; no inventes ninguna):`,
    categories || "- (no hay categorías)",
    "",
    "Colores que existen (usa el nombre EXACTO o null; no inventes ninguno):",
    colors || "- (no hay colores)",
    "",
    "Campos que sí puedes proponer:",
    `- name: nombre corto del artículo, máx. ${SUGGESTION_LIMITS.name} caracteres.`,
    `- shortDescription: una línea para el listado, máx. ${SUGGESTION_LIMITS.shortDescription}.`,
    `- description: 2-3 frases sobre lo que se ve (forma, corte, detalles visibles), máx. ${SUGGESTION_LIMITS.description}.`,
    "- categorySlug: uno de los slugs de arriba, o null.",
    "- colorName: uno de los colores de arriba, o null.",
    `- keywords: hasta ${SUGGESTION_LIMITS.keywords} palabras sueltas sobre estilo o tipo de prenda.`,
    "",
    "En la descripción no menciones material, composición, tallas, precio ni",
    "cuidados: no se ven en la foto.",
  ].join("\n");
}

/** Esquema JSON de la respuesta. Solo la lista blanca. */
export function suggestionJsonSchema() {
  return {
    type: "object" as const,
    properties: {
      name: { type: ["string", "null"] },
      shortDescription: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      categorySlug: { type: ["string", "null"] },
      colorName: { type: ["string", "null"] },
      keywords: { type: "array", items: { type: "string" } },
    },
    required: [
      "name",
      "shortDescription",
      "description",
      "categorySlug",
      "colorName",
      "keywords",
    ],
    additionalProperties: false,
  };
}
