import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ACTION_BODY_LIMIT_BYTES,
  ALT_TEXT_MAX,
  MAX_FILES_PER_BATCH,
  MAX_IMAGE_BYTES,
  PLATFORM_BODY_LIMIT_BYTES,
  UPLOAD_REQUEST_BUDGET_BYTES,
  buildAutoAltText,
  buildLogoPath,
  checkImageUpload,
  detectImageFormat,
  isLogoPath,
  parseAltText,
  uploadBudgetPerFile,
} from "../images.ts";

/**
 * Validación y límites de las imágenes de catálogo.
 *
 * Lo nuevo del incremento 7 son los tres últimos bloques: el límite del cuerpo
 * de las Server Actions —que estaba en 1 MB por defecto y hacía imposible
 * subir una foto de móvil— y el texto alternativo automático.
 */

/** Firmas reales, para no depender de leer un archivo de disco. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

describe("detectImageFormat", () => {
  test("reconoce los tres formatos admitidos por su firma", () => {
    assert.equal(detectImageFormat(JPEG), "jpeg");
    assert.equal(detectImageFormat(PNG), "png");
    assert.equal(detectImageFormat(WEBP), "webp");
  });

  test("un GIF no cuela, aunque sea una imagen de verdad", () => {
    assert.equal(detectImageFormat(GIF), null);
  });

  test("texto plano tampoco", () => {
    assert.equal(detectImageFormat(new TextEncoder().encode("<svg>hola</svg>")), null);
  });
});

describe("checkImageUpload", () => {
  test("acepta un JPEG dentro del tamaño", () => {
    assert.deepEqual(checkImageUpload(JPEG, "image/jpeg"), { ok: true, format: "jpeg" });
  });

  test("rechaza el archivo vacío", () => {
    const result = checkImageUpload(new Uint8Array(0), "image/jpeg");
    assert.equal(result.ok, false);
  });

  test("NO se fía del MIME que declara el navegador", () => {
    // Es la regla central: se mira el contenido, no la etiqueta.
    const result = checkImageUpload(GIF, "image/png");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /JPEG, PNG o WebP/);
  });

  test("rechaza por encima de MAX_IMAGE_BYTES", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(JPEG);
    const result = checkImageUpload(big, "image/jpeg");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /5 MB/);
  });
});

describe("límite del cuerpo de las Server Actions (incrementos 7 y 17, DEC-089)", () => {
  test("es EL tope de Vercel: local rechaza lo mismo que producción", () => {
    /*
      Hasta la preparación para Vercel valía 26 MB (5 × 5 MB + holgura) y en
      local todo pasaba. Vercel corta en 4,5 MB con un 413 antes de llegar a
      Next (docs/functions/limitations, «Request body size»): una sola foto de
      móvil de 4,84 MB —la medida en el incremento 17— no habría llegado. Si
      alguien vuelve a subir este número, local deja de avisar.
    */
    assert.equal(ACTION_BODY_LIMIT_BYTES, PLATFORM_BODY_LIMIT_BYTES);
    assert.ok(PLATFORM_BODY_LIMIT_BYTES <= 4_500_000);
  });

  test("las fotos de una petición dejan holgura para multipart y los campos de texto", () => {
    const overhead = ACTION_BODY_LIMIT_BYTES - UPLOAD_REQUEST_BUDGET_BYTES;
    assert.ok(overhead >= 256 * 1024, `holgura insuficiente: ${overhead} bytes`);
  });

  test("un lote completo, ya reducido, cabe en una petición", () => {
    const perFile = uploadBudgetPerFile(MAX_FILES_PER_BATCH);
    assert.ok(perFile * MAX_FILES_PER_BATCH <= UPLOAD_REQUEST_BUDGET_BYTES);
    // Y cada foto sigue teniendo un tamaño razonable a 2000 px.
    assert.ok(perFile >= 700_000, `demasiado poco por foto: ${perFile}`);
  });

  test("el presupuesto por foto no divide por cero ni crece con cantidades raras", () => {
    assert.equal(uploadBudgetPerFile(1), UPLOAD_REQUEST_BUDGET_BYTES);
    assert.equal(uploadBudgetPerFile(0), UPLOAD_REQUEST_BUDGET_BYTES);
    assert.equal(uploadBudgetPerFile(-3), UPLOAD_REQUEST_BUDGET_BYTES);
    assert.ok(uploadBudgetPerFile(2.5) <= UPLOAD_REQUEST_BUDGET_BYTES / 2);
  });

  test("`next.config.ts` usa ESA constante y no un número suelto", () => {
    /*
      Control de deriva. El valor por defecto de Next es 1 MB y estaba sin
      configurar: medido sobre el build servido, un JPEG de 1,20 MB devolvía
      500 «Body exceeded 1 MB limit» mientras la aplicación decía admitir 5 MB.
    */
    const config = fs.readFileSync("next.config.ts", "utf8");
    assert.match(config, /bodySizeLimit:\s*ACTION_BODY_LIMIT_BYTES/);
    assert.match(config, /from "\.\/lib\/admin\/images"/);
  });

  test("el límite del PROXY también, o los dos se separan", () => {
    /*
      INCREMENTO 17 · con `proxy.ts` presente, Next bufferiza el cuerpo con un
      tope PROPIO (10 MB por defecto). Medido: 3 fotos × 4,84 MB → "Algo ha
      fallado", 0 imágenes subidas. Los dos límites salen de la MISMA constante.
    */
    const config = fs.readFileSync("next.config.ts", "utf8");
    assert.match(config, /proxyClientMaxBodySize:\s*ACTION_BODY_LIMIT_BYTES/);
  });

  test("TODO control de archivo del panel reduce las fotos antes de enviarlas", () => {
    /*
      Regresión de DEC-089: un `<input type="file">` nuevo que mande la foto tal
      cual funciona en local con fotos pequeñas y da 413 en Vercel con las del
      móvil. Se busca en components/ y app/ entero.
    */
    const roots = ["components", "app"];
    const withFileInput: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith(".tsx") && /type="file"/.test(fs.readFileSync(path, "utf8"))) {
          withFileInput.push(path);
        }
      }
    };
    roots.forEach(walk);
    assert.ok(withFileInput.length >= 3, `solo ${withFileInput.length} controles de archivo`);
    for (const path of withFileInput) {
      const source = fs.readFileSync(path, "utf8");
      assert.match(source, /useImageShrinker\(/, `${path} manda la foto sin reducir`);
      assert.match(source, /onSubmit=\{shrinker\.guardSubmit\}/, `${path} se puede enviar a medio reducir`);
    }
  });
});

describe("buildAutoAltText (incremento 7)", () => {
  test("la primera foto lleva el nombre del producto tal cual", () => {
    assert.equal(buildAutoAltText("Camiseta Sendero Oversize", 1), "Camiseta Sendero Oversize");
  });

  test("las siguientes llevan su posición, para no ser idénticas", () => {
    assert.equal(buildAutoAltText("Camiseta Sendero Oversize", 2), "Camiseta Sendero Oversize (2)");
    assert.equal(buildAutoAltText("Camiseta Sendero Oversize", 7), "Camiseta Sendero Oversize (7)");
  });

  test("normaliza los espacios del nombre", () => {
    assert.equal(buildAutoAltText("  Gorra   Horizonte  ", 1), "Gorra Horizonte");
  });

  test("un nombre demasiado corto NO deja la imagen sin alt válido", () => {
    // `alt_text` es NOT NULL y `parseAltText` exige 3 caracteres: sin respaldo,
    // un producto llamado "A" rompería la subida entera.
    const alt = buildAutoAltText("A", 1);
    assert.ok(parseAltText(alt).ok, `alt inválido: ${JSON.stringify(alt)}`);
  });

  test("todo lo que genera pasa la validación de alt", () => {
    for (const name of ["A", "AB", "Gorra", "Chaqueta cortavientos Cumbre"]) {
      for (const position of [1, 2, 10]) {
        const alt = buildAutoAltText(name, position);
        assert.ok(parseAltText(alt).ok, `${name} #${position} → ${JSON.stringify(alt)}`);
      }
    }
  });

  test("recorta un nombre larguísimo al máximo de la columna", () => {
    const alt = buildAutoAltText("x".repeat(400), 3);
    assert.equal(alt.length, ALT_TEXT_MAX);
    assert.ok(parseAltText(alt).ok);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENTO 17 · La ruta del logo
   ═══════════════════════════════════════════════════════════════════════════

   `isLogoPath` se consulta ANTES de borrar. La RLS de Storage solo comprueba
   que seas admin, no de qué es el objeto: sin esta comprobación, un
   `logo_url` manipulado en la base de datos haría que sustituir el logo
   borrase una foto del catálogo.
   ═════════════════════════════════════════════════════════════════════════ */

describe("logo · ruta del objeto", () => {
  const UUID = "0f6d2c8a-1b3e-4c5d-8e9f-a0b1c2d3e4f5";

  test("la ruta lleva el mercado y termina en .webp", () => {
    assert.equal(buildLogoPath("ES", UUID), `logo/ES-${UUID}.webp`);
  });

  test("cada subida es un objeto NUEVO, nunca la misma ruta", () => {
    // Sobrescribir la misma ruta dejaría el CDN sirviendo el logo anterior.
    assert.notEqual(buildLogoPath("ES", UUID), buildLogoPath("ES", "11111111-2222-3333-4444-555555555555"));
  });

  test("dos mercados no se pisan", () => {
    assert.notEqual(buildLogoPath("ES", UUID), buildLogoPath("CO", UUID));
  });

  test("un market_id con basura no se escapa de la carpeta", () => {
    for (const evil of ["../../evil", "ES/../..", "a/b", "ES;drop"]) {
      const path = buildLogoPath(evil, UUID);
      assert.ok(path.startsWith("logo/"), path);
      assert.ok(!path.includes(".."), path);
      assert.equal(path.split("/").length, 2, path);
    }
  });

  test("reconoce la ruta que ella misma genera", () => {
    assert.equal(isLogoPath(buildLogoPath("ES", UUID), "ES"), true);
  });

  test("RECHAZA la ruta de otro mercado", () => {
    assert.equal(isLogoPath(buildLogoPath("CO", UUID), "ES"), false);
  });

  test("RECHAZA una ruta de catálogo: no se puede borrar una foto de producto", () => {
    assert.equal(isLogoPath(`gorra-horizonte/${UUID}.webp`, "ES"), false);
    assert.equal(isLogoPath(`logo/../gorra-horizonte/${UUID}.webp`, "ES"), false);
  });

  test("RECHAZA nulos, vacíos y basura", () => {
    for (const value of [null, undefined, "", "   ", "logo/", "logo/ES-.webp", "logo/ES-x.png"]) {
      assert.equal(isLogoPath(value as string | null, "ES"), false, String(value));
    }
  });
});

describe("logo · reutiliza la validación del catálogo, no una copia", () => {
  test("un SVG se rechaza aunque el navegador lo declare como imagen", () => {
    // Los buckets son de lectura pública y un SVG es texto que puede llevar
    // scripts. Lo decide el CONTENIDO, no `File.type`.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = checkImageUpload(svg, "image/svg+xml");
    assert.equal(result.ok, false);
  });

  test("un PNG con extensión mentida se acepta por sus bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const result = checkImageUpload(png, "application/octet-stream");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.format, "png");
  });

  test("un archivo de más de 5 MB se rechaza antes de tocar sharp", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    const result = checkImageUpload(big, "image/jpeg");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /5 MB/);
  });

  test("un logo, reducido en el navegador, cabe en una petición", () => {
    assert.ok(uploadBudgetPerFile(1) < ACTION_BODY_LIMIT_BYTES);
  });
});
