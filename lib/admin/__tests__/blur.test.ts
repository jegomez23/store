import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BLUR_DATA_URL_MAX,
  BLUR_DATA_URL_PREFIX,
  BLUR_WIDTH,
  isValidBlurDataUrl,
  toBlurDataUrl,
} from "../images.ts";

/**
 * El placeholder blur SOLO puede generarlo el servidor (Fase 9). Estos tests
 * cubren la puerta de validación; el CHECK de la migración 0022 la repite en
 * PostgreSQL, así que ni una escritura directa puede colar otra cosa.
 */

const VALID = `${BLUR_DATA_URL_PREFIX}UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==`;

describe("toBlurDataUrl", () => {
  test("compone el data URI con el prefijo WebP", () => {
    assert.ok(toBlurDataUrl("AAAA").startsWith("data:image/webp;base64,"));
  });
});

describe("isValidBlurDataUrl", () => {
  test("acepta un data URI WebP base64 de tamaño de placeholder", () => {
    assert.equal(isValidBlurDataUrl(VALID), true);
  });

  test("rechaza null, undefined y no-strings", () => {
    assert.equal(isValidBlurDataUrl(null), false);
    assert.equal(isValidBlurDataUrl(undefined), false);
    assert.equal(isValidBlurDataUrl(""), false);
  });

  test("rechaza otros formatos aunque sean imágenes legítimas", () => {
    assert.equal(isValidBlurDataUrl("data:image/png;base64,iVBORw0KGgo="), false);
    assert.equal(isValidBlurDataUrl("data:image/jpeg;base64,/9j/4AAQ"), false);
    assert.equal(isValidBlurDataUrl("data:image/svg+xml;base64,PHN2Zz4="), false);
  });

  test("rechaza data URIs peligrosos y URLs remotas", () => {
    assert.equal(isValidBlurDataUrl("data:text/html;base64,PHNjcmlwdD4="), false);
    assert.equal(isValidBlurDataUrl("javascript:alert(1)"), false);
    assert.equal(isValidBlurDataUrl("https://evil.example/x.webp"), false);
    assert.equal(isValidBlurDataUrl(`${BLUR_DATA_URL_PREFIX}<script>alert(1)</script>`), false);
  });

  test("rechaza payloads que no sean base64 puro", () => {
    assert.equal(isValidBlurDataUrl(`${BLUR_DATA_URL_PREFIX}AAAA AAAA`), false);
    assert.equal(isValidBlurDataUrl(`${BLUR_DATA_URL_PREFIX}AAAA"onload="x`), false);
  });

  test("rechaza una imagen entera disfrazada de placeholder", () => {
    const huge = `${BLUR_DATA_URL_PREFIX}${"A".repeat(BLUR_DATA_URL_MAX)}`;
    assert.equal(huge.length > BLUR_DATA_URL_MAX, true);
    assert.equal(isValidBlurDataUrl(huge), false);
  });

  test("rechaza un data URI demasiado corto para ser una imagen", () => {
    assert.equal(isValidBlurDataUrl(`${BLUR_DATA_URL_PREFIX}AA`), false);
  });
});

describe("parámetros del placeholder", () => {
  test("16 px de ancho, igual que los placeholders propios de Next", () => {
    assert.equal(BLUR_WIDTH, 16);
  });

  test("el límite coincide con el CHECK de la migración 0022", () => {
    assert.equal(BLUR_DATA_URL_MAX, 4000);
  });
});
