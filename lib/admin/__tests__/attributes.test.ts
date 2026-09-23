import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SIZE_GROUPS,
  attributeErrorMessage,
  isSizeGroup,
  validateColorInput,
  validateSizeInput,
} from "../attributes.ts";
import { parseSlug, slugify } from "../slug.ts";

/**
 * Validación pura de colores y tallas (Fase 9.5, incremento 6).
 *
 * Sin red: lo que se prueba aquí es la PRIMERA barrera. La autoridad sigue
 * siendo PostgreSQL, y eso se prueba en `attributes.integration.test.ts`.
 */

const color = (over: Partial<Parameters<typeof validateColorInput>[0]> = {}) =>
  validateColorInput(
    { name: "Verde bosque", slug: "verde-bosque", hexCode: "#3A4A3E", sortOrder: "0", isActive: true, ...over },
    parseSlug,
  );

const size = (over: Partial<Parameters<typeof validateSizeInput>[0]> = {}) =>
  validateSizeInput({ label: "M", sizeGroup: "apparel", sortOrder: "0", isActive: true, ...over });

describe("validateColorInput", () => {
  test("acepta un color correcto", () => {
    const result = color();
    assert.ok(result.ok);
    assert.deepEqual(result.input, {
      name: "Verde bosque",
      slug: "verde-bosque",
      hexCode: "#3A4A3E",
      sortOrder: 0,
      isActive: true,
    });
  });

  test("NORMALIZA el hexadecimal a mayúsculas", () => {
    // Si no, "#aabbcc" y "#AABBCC" convivirían como dos colores que se ven
    // exactamente igual y el admin no podría distinguirlos en la matriz.
    const result = color({ hexCode: "#aabbcc" });
    assert.ok(result.ok);
    assert.equal(result.input.hexCode, "#AABBCC");
  });

  test("recorta los espacios del hexadecimal antes de validarlo", () => {
    const result = color({ hexCode: "  #3a4a3e  " });
    assert.ok(result.ok);
    assert.equal(result.input.hexCode, "#3A4A3E");
  });

  for (const bad of ["rojo", "#GGGGGG", "#3A4A3", "3A4A3E", "#3A4A3EE", "", "   "]) {
    test(`rechaza el hexadecimal ${JSON.stringify(bad)}`, () => {
      const result = color({ hexCode: bad });
      assert.equal(result.ok, false);
      assert.match((result as { error: string }).error, /hexadecimal/i);
    });
  }

  test("rechaza el nombre vacío y el de solo espacios", () => {
    assert.equal(color({ name: "" }).ok, false);
    assert.equal(color({ name: "   " }).ok, false);
  });

  test("rechaza un nombre demasiado largo", () => {
    assert.equal(color({ name: "x".repeat(61) }).ok, false);
  });

  test("rechaza un slug con mayúsculas o espacios", () => {
    assert.equal(color({ slug: "Verde Bosque" }).ok, false);
    assert.equal(color({ slug: "verde_bosque" }).ok, false);
  });

  test("el slug derivado de un nombre con tilde y ñ es utilizable", () => {
    // `slugify` es lo que usa la acción cuando el admin deja el slug vacío.
    const derived = slugify("Marrón Otoño");
    assert.equal(derived, "marron-otono");
    assert.ok(color({ slug: derived }).ok);
  });

  test("dos nombres iguales producen el mismo slug", () => {
    // Es la ÚNICA defensa contra dos colores homónimos: `colors.name` no es
    // único (verificado contra el proyecto real), pero `colors.slug` sí, así
    // que el segundo lo rechaza PostgreSQL con 23505.
    assert.equal(slugify("Azul Marino"), slugify("azul  marino"));
  });

  test("el orden vacío vale 0, y el no numérico se rechaza", () => {
    const empty = color({ sortOrder: "" });
    assert.ok(empty.ok);
    assert.equal(empty.input.sortOrder, 0);
    assert.equal(color({ sortOrder: "1.5" }).ok, false);
    assert.equal(color({ sortOrder: "muchos" }).ok, false);
    assert.equal(color({ sortOrder: "99999999" }).ok, false);
  });

  test("admite orden negativo (para poner algo el primero)", () => {
    const result = color({ sortOrder: "-5" });
    assert.ok(result.ok);
    assert.equal(result.input.sortOrder, -5);
  });
});

describe("validateSizeInput", () => {
  test("acepta una talla correcta", () => {
    const result = size();
    assert.ok(result.ok);
    assert.deepEqual(result.input, {
      label: "M",
      sizeGroup: "apparel",
      sortOrder: 0,
      isActive: true,
    });
  });

  test("los tres grupos del CHECK son válidos y ninguno más", () => {
    for (const group of SIZE_GROUPS) assert.ok(size({ sizeGroup: group }).ok, group);
    for (const bad of ["kids", "APPAREL", "", "ropa"]) {
      assert.equal(size({ sizeGroup: bad }).ok, false, bad);
    }
  });

  test("`isSizeGroup` no acepta nada fuera de los tres", () => {
    assert.equal(isSizeGroup("apparel"), true);
    assert.equal(isSizeGroup("kids"), false);
    assert.equal(isSizeGroup(null), false);
    assert.equal(isSizeGroup(42), false);
  });

  test("rechaza la etiqueta vacía y la demasiado larga", () => {
    assert.equal(size({ label: "" }).ok, false);
    assert.equal(size({ label: "   " }).ok, false);
    assert.equal(size({ label: "x".repeat(21) }).ok, false);
  });

  test("acepta las etiquetas reales del seed", () => {
    for (const label of ["XS", "XL", "38", "42", "Única"]) {
      assert.ok(size({ label }).ok, label);
    }
  });
});

describe("attributeErrorMessage", () => {
  test("23503 explica que está EN USO y qué hacer, no un error crudo", () => {
    const message = attributeErrorMessage("23503", "color", "fallback");
    assert.match(message, /en uso|usan este color/i);
    assert.match(message, /desactí?valo/i);
  });

  test("23505 distingue color de talla", () => {
    assert.match(attributeErrorMessage("23505", "color", "f"), /slug/i);
    assert.match(attributeErrorMessage("23505", "size", "f"), /etiqueta/i);
  });

  test("un código desconocido devuelve el fallback tal cual", () => {
    assert.equal(attributeErrorMessage("XXXXX", "color", "fallback"), "fallback");
    assert.equal(attributeErrorMessage(undefined, "size", "fallback"), "fallback");
  });
});
