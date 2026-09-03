import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slugify, parseSlug } from "../slug.ts";
import { validateProductInput, catalogErrorMessage, isUuid } from "../products.ts";
import {
  buildMissingCombinations,
  combinationKey,
  parseSku,
  suggestSku,
} from "../variants.ts";
import {
  checkImageUpload,
  detectImageFormat,
  parseAltText,
  buildImagePath,
  pathBelongsToProduct,
  MAX_IMAGE_BYTES,
} from "../images.ts";
import {
  HOME_SECTIONS,
  canBeParent,
  canReceiveParent,
  isHomeSection,
  parseCtaHref,
  parseSocialUrl,
  parseSortOrder,
  validateCategoryInput,
  validateHomeBlockInput,
  validateSettingsInput,
} from "../content.ts";

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("slugify / parseSlug", () => {
  test("normaliza acentos y símbolos", () => {
    assert.equal(slugify("Pantalón cargo Altiplano"), "pantalon-cargo-altiplano");
    assert.equal(slugify("Niño & Niña — 50% OFF"), "nino-nina-50-off");
    assert.equal(slugify("  ÁÉÍÓÚ  "), "aeiou");
  });

  test("nunca deja guiones colgando ni cadenas raras", () => {
    assert.equal(slugify("---"), "");
    assert.equal(slugify("!!!"), "");
    assert.ok(!slugify("a".repeat(200)).endsWith("-"));
    assert.ok(slugify("a".repeat(200)).length <= 80);
  });

  test("parseSlug rechaza en vez de arreglar en silencio", () => {
    assert.equal(parseSlug("camiseta-sendero").ok, true);
    assert.equal(parseSlug("Camiseta Sendero").ok, false);
    assert.equal(parseSlug("camiseta--doble").ok, false);
    assert.equal(parseSlug("-inicio").ok, false);
    assert.equal(parseSlug("fin-").ok, false);
    assert.equal(parseSlug("").ok, false);
    assert.equal(parseSlug("acentós").ok, false);
  });
});

describe("validateProductInput", () => {
  const base = { name: "Camiseta", slug: "camiseta", categoryId: UUID_A };

  test("acepta un producto mínimo válido", () => {
    const r = validateProductInput(base, parseSlug);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.input.name, "Camiseta");
      assert.equal(r.input.shortDescription, null, "campos vacíos deben ser null, no ''");
      assert.equal(r.input.isFeatured, false);
    }
  });

  test("los campos opcionales vacíos van a null", () => {
    const r = validateProductInput({ ...base, description: "   ", metaTitle: "" }, parseSlug);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.input.description, null);
      assert.equal(r.input.metaTitle, null);
    }
  });

  test("rechaza nombre corto, slug inválido y categoría no-uuid", () => {
    assert.equal(validateProductInput({ ...base, name: "A" }, parseSlug).ok, false);
    assert.equal(validateProductInput({ ...base, slug: "Con Espacios" }, parseSlug).ok, false);
    assert.equal(validateProductInput({ ...base, categoryId: "no-uuid" }, parseSlug).ok, false);
    assert.equal(validateProductInput({ ...base, categoryId: undefined }, parseSlug).ok, false);
  });

  test("respeta los límites de longitud de cada campo", () => {
    assert.equal(validateProductInput({ ...base, metaDescription: "x".repeat(161) }, parseSlug).ok, false);
    assert.equal(validateProductInput({ ...base, metaDescription: "x".repeat(160) }, parseSlug).ok, true);
    assert.equal(validateProductInput({ ...base, name: "x".repeat(121) }, parseSlug).ok, false);
  });

  test("los booleanos solo son true si valen exactamente true", () => {
    const r = validateProductInput({ ...base, isFeatured: "on", isNew: true }, parseSlug);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.input.isFeatured, false, "'on' no es true: la action normaliza antes");
      assert.equal(r.input.isNew, true);
    }
  });

  test("no inventa campos SEO fuera del esquema", () => {
    const sql = fs.readFileSync("supabase/migrations/0006_products.sql", "utf8");
    for (const column of ["meta_title", "meta_description", "short_description", "materials", "care_instructions", "shipping_info_override"]) {
      assert.ok(sql.includes(column), `la columna ${column} debe existir en el esquema`);
    }
    assert.ok(!sql.includes("og_image"), "control negativo: og_image NO existe y no debe usarse");
  });

  test("isUuid es estricto", () => {
    assert.equal(isUuid(UUID_A), true);
    assert.equal(isUuid("1234"), false);
    assert.equal(isUuid(null), false);
  });
});

describe("catalogErrorMessage", () => {
  test("traduce los códigos de Postgres sin filtrar el mensaje crudo", () => {
    assert.match(catalogErrorMessage("23505", "x"), /slug o SKU/);
    assert.match(catalogErrorMessage("23503", "x"), /referencia/);
    assert.match(catalogErrorMessage("42501", "x"), /permisos/);
    assert.equal(catalogErrorMessage("XX999", "generico"), "generico");
    assert.equal(catalogErrorMessage(undefined, "generico"), "generico");
  });

  test("explica NO_ACTIVE_VARIANT en vez de soltar el error crudo", () => {
    // El trigger `enforce_publishable_product` (migración 0031) lanza P0001,
    // que es el código genérico de cualquier `raise exception`: hay que mirar
    // el mensaje, y por eso se comprueba ANTES que el código.
    const message = catalogErrorMessage("P0001", "generico", "NO_ACTIVE_VARIANT");
    assert.match(message, /variante activa/i);
    assert.match(message, /404/);
    assert.ok(!message.includes("NO_ACTIVE_VARIANT"), "no se filtra el error crudo");
  });

  test("sin ese mensaje, el comportamiento anterior no cambia", () => {
    assert.equal(catalogErrorMessage("P0001", "generico"), "generico");
    assert.equal(catalogErrorMessage("P0001", "generico", "otra cosa"), "generico");
    assert.match(catalogErrorMessage("23505", "x", "otra cosa"), /slug o SKU/);
  });
});

describe("matriz de variantes", () => {
  test("genera el producto cartesiano", () => {
    const combos = buildMissingCombinations(["c1", "c2"], ["s1", "s2", "s3"], []);
    assert.equal(combos.length, 6);
  });

  test("omite las combinaciones que ya existen", () => {
    const combos = buildMissingCombinations(
      ["c1", "c2"],
      ["s1"],
      [{ colorId: "c1", sizeId: "s1" }],
    );
    assert.deepEqual(combos, [{ colorId: "c2", sizeId: "s1" }]);
  });

  test("sin colores o sin tallas usa NULL (accesorios, DEC-019)", () => {
    assert.deepEqual(buildMissingCombinations([], ["s1"], []), [{ colorId: null, sizeId: "s1" }]);
    assert.deepEqual(buildMissingCombinations(["c1"], [], []), [{ colorId: "c1", sizeId: null }]);
    assert.deepEqual(buildMissingCombinations([], [], []), [{ colorId: null, sizeId: null }]);
  });

  test("no duplica la combinación sin color ni talla, que el UNIQUE de Postgres SÍ permitiría", () => {
    // En un índice UNIQUE, PostgreSQL trata dos NULL como distintos: sin esta
    // comprobación se podrían crear dos variantes idénticas de un accesorio.
    const combos = buildMissingCombinations([], [], [{ colorId: null, sizeId: null }]);
    assert.deepEqual(combos, []);
  });

  test("no repite dentro de la misma petición", () => {
    const combos = buildMissingCombinations(["c1", "c1"], ["s1"], []);
    assert.equal(combos.length, 1);
  });

  test("combinationKey distingue null de un id", () => {
    assert.notEqual(
      combinationKey({ colorId: null, sizeId: "s1" }),
      combinationKey({ colorId: "s1", sizeId: null }),
    );
  });

  test("parseSku normaliza y valida", () => {
    assert.deepEqual(parseSku(" yi-es-cso "), { ok: true, value: "YI-ES-CSO" });
    assert.equal(parseSku("a").ok, false);
    assert.equal(parseSku("con espacios").ok, false);
    assert.equal(parseSku("con_guionbajo").ok, false);
    assert.equal(parseSku("X".repeat(41)).ok, false);
  });

  test("suggestSku produce algo usable y acotado", () => {
    assert.equal(suggestSku("camiseta-sendero", "negro", "M"), "CAMISE-NEGRO-M");
    assert.equal(suggestSku("gorra-horizonte", null, null), "GORRAH");
    assert.ok(suggestSku("x".repeat(50), "y".repeat(50), "z".repeat(50)).length <= 40);
  });
});

describe("validación de imágenes", () => {
  const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = () =>
    new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

  test("detecta los tres formatos reales", () => {
    assert.equal(detectImageFormat(jpeg()), "jpeg");
    assert.equal(detectImageFormat(png()), "png");
    assert.equal(detectImageFormat(webp()), "webp");
  });

  test("rechaza contenido que NO es imagen aunque el cliente diga que sí", () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const check = checkImageUpload(svg, "image/svg+xml");
    assert.equal(check.ok, false);

    const php = new TextEncoder().encode("<?php system($_GET[0]); ?>");
    assert.equal(checkImageUpload(php, "image/png").ok, false, "MIME falsificado debe fallar");

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    assert.equal(checkImageUpload(gif, "image/gif").ok, false, "GIF no está permitido");
  });

  test("acepta imágenes reales", () => {
    assert.deepEqual(checkImageUpload(jpeg(), "image/jpeg"), { ok: true, format: "jpeg" });
    assert.deepEqual(checkImageUpload(webp(), undefined), { ok: true, format: "webp" });
  });

  test("rechaza vacío y exceso de tamaño", () => {
    assert.equal(checkImageUpload(new Uint8Array(0), "image/png").ok, false);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(jpeg(), 0);
    const r = checkImageUpload(big, "image/jpeg");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /5 MB/);
  });

  test("el límite es el mismo que el del bucket en la migración 0020", () => {
    const sql = fs.readFileSync(
      "supabase/migrations/0020_admin_market_isolation_and_storage.sql",
      "utf8",
    );
    assert.ok(sql.includes(String(MAX_IMAGE_BYTES)), "app y Storage deben usar el mismo límite");
  });

  test("parseAltText exige texto real", () => {
    assert.deepEqual(parseAltText("  Gorra   negra  "), { ok: true, value: "Gorra negra" });
    assert.equal(parseAltText("ab").ok, false);
    assert.equal(parseAltText("   ").ok, false);
    assert.equal(parseAltText("x".repeat(161)).ok, false);
  });

  test("buildImagePath no repite el bucket ni acepta rutas del cliente", () => {
    const path = buildImagePath("camiseta-sendero", UUID_A);
    assert.equal(path, `camiseta-sendero/${UUID_A}.webp`);
    assert.ok(!path.startsWith("products/"), "rules/database.md #19: sin el bucket delante");
    assert.equal(buildImagePath("../../etc/passwd", UUID_A), `etcpasswd/${UUID_A}.webp`);
    assert.equal(buildImagePath("", UUID_A), `producto/${UUID_A}.webp`);
  });

  test("pathBelongsToProduct bloquea rutas de otro producto", () => {
    assert.equal(pathBelongsToProduct(`gorra/${UUID_A}.webp`, "gorra"), true);
    assert.equal(pathBelongsToProduct(`otro/${UUID_A}.webp`, "gorra"), false);
    assert.equal(pathBelongsToProduct("gorra/../otro/x.webp", "gorra"), false);
    assert.equal(pathBelongsToProduct("gorra/x.php", "gorra"), false);
  });
});

describe("categorías", () => {
  const base = { name: "Camisetas", slug: "camisetas", isActive: true };

  test("acepta una categoría raíz válida", () => {
    const r = validateCategoryInput(base, parseSlug);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.input.parentId, null);
      assert.equal(r.input.sortOrder, 0);
    }
  });

  test("acepta un padre uuid y rechaza uno inválido", () => {
    assert.equal(validateCategoryInput({ ...base, parentId: UUID_B }, parseSlug).ok, true);
    assert.equal(validateCategoryInput({ ...base, parentId: "x" }, parseSlug).ok, false);
  });

  test("canBeParent replica el trigger de 2 niveles", () => {
    assert.equal(canBeParent({ id: UUID_A, parentId: null }, null), true);
    assert.equal(canBeParent({ id: UUID_A, parentId: UUID_B }, null), false, "ya es hija");
    assert.equal(canBeParent({ id: UUID_A, parentId: null }, UUID_A), false, "no puede ser su propia madre");
  });

  test("una categoría con hijas no puede recibir padre", () => {
    assert.equal(canReceiveParent(false), true);
    assert.equal(canReceiveParent(true), false);
  });

  test("parseSortOrder rechaza lo que Number() aceptaría", () => {
    assert.deepEqual(parseSortOrder("7"), { ok: true, value: 7 });
    assert.deepEqual(parseSortOrder(""), { ok: true, value: 0 });
    assert.deepEqual(parseSortOrder(undefined), { ok: true, value: 0 });
    for (const bad of ["-1", "1.5", "1e3", "abc", "99999"]) {
      assert.equal(parseSortOrder(bad).ok, false, `orden "${bad}"`);
    }
  });
});

describe("bloques de home", () => {
  test("las secciones son exactamente las del CHECK de la migración 0014", () => {
    const sql = fs.readFileSync("supabase/migrations/0014_home_content.sql", "utf8");
    const match = sql.match(/section in \(([^)]+)\)/);
    assert.ok(match);
    assert.deepEqual(
      [...HOME_SECTIONS].sort(),
      match[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort(),
    );
  });

  test("isHomeSection rechaza inventos", () => {
    assert.equal(isHomeSection("hero"), true);
    assert.equal(isHomeSection("carousel"), false);
    assert.equal(isHomeSection("HERO"), false);
  });

  test("acepta un bloque válido", () => {
    const r = validateHomeBlockInput({
      section: "hero",
      title: "Vive a tu ritmo",
      ctaLabel: "Ver",
      ctaHref: "/producto/gorra-horizonte",
      isActive: true,
    });
    assert.equal(r.ok, true);
  });

  test("el CTA debe ser una ruta interna (no redirector abierto)", () => {
    assert.deepEqual(parseCtaHref(""), { ok: true, value: null });
    assert.equal(parseCtaHref("/carrito").ok, true);
    assert.equal(parseCtaHref("https://evil.example").ok, false);
    assert.equal(parseCtaHref("//evil.example").ok, false);
    assert.equal(parseCtaHref("javascript:alert(1)").ok, false);
    assert.equal(parseCtaHref("/ok\\evil").ok, false);
  });

  test("texto de botón sin enlace se rechaza", () => {
    const r = validateHomeBlockInput({ section: "banner", ctaLabel: "Ver", ctaHref: "" });
    assert.equal(r.ok, false);
  });

  test("una sección inventada se rechaza", () => {
    assert.equal(validateHomeBlockInput({ section: "carousel" }).ok, false);
  });
});

describe("ajustes", () => {
  test("acepta lo mínimo válido", () => {
    const r = validateSettingsInput({ storeName: "YI" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.input.contactEmail, null);
      assert.equal(r.input.instagramUrl, null);
    }
  });

  test("valida el email", () => {
    assert.equal(validateSettingsInput({ storeName: "YI", contactEmail: "hola@yi.es" }).ok, true);
    assert.equal(validateSettingsInput({ storeName: "YI", contactEmail: "hola@" }).ok, false);
    assert.equal(validateSettingsInput({ storeName: "YI", contactEmail: "sin-arroba" }).ok, false);
  });

  test("las redes solo admiten https (nada de javascript:)", () => {
    assert.equal(parseSocialUrl("https://instagram.com/yi", "x").ok, true);
    assert.equal(parseSocialUrl("http://instagram.com/yi", "x").ok, false);
    assert.equal(parseSocialUrl("javascript:alert(1)", "x").ok, false);
    assert.deepEqual(parseSocialUrl("", "x"), { ok: true, value: null });
  });

  test("el nombre de tienda es obligatorio", () => {
    assert.equal(validateSettingsInput({ storeName: "" }).ok, false);
    assert.equal(validateSettingsInput({}).ok, false);
  });

  test("los ajustes NO incluyen el número de WhatsApp: tiene su propia acción", () => {
    const r = validateSettingsInput({ storeName: "YI", whatsappNumber: "34600000000" });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(!("whatsappNumber" in r.input), "una sola fuente de verdad, un solo camino de escritura");
    }
  });
});
