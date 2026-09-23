import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Invariantes de la FICHA DE PRODUCTO (Incremento 19).
 *
 * No comprueban que React pinte texto: comprueban las tres cosas que, medidas
 * en Chrome sobre el build servido, hacían perder una venta.
 *
 *   1. Un producto agotado del todo NO puede ofrecer botones de compra.
 *   2. El hueco de una foto que no existe NO puede comerse la primera pantalla.
 *   3. Una ficha sin foto NO puede compartirse sin ninguna imagen.
 *
 * Son guardas sobre el código porque el comportamiento se verifica en el E2E:
 * aquí se fija la INTENCIÓN, para que un refactor no la deshaga en silencio.
 */

const sinComentarios = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("agotado: el producto entero, no solo la variante", () => {
  const source = fs.readFileSync("components/store/cart/AddToCartForm.tsx", "utf8");
  const codigo = sinComentarios(source);

  test("la disponibilidad se calcula sobre TODAS las variantes", () => {
    /*
      El fallo medido: `isOutOfStock` exigía `selectedVariant !== null`, así que
      con todas las tallas a 0 y ninguna elegida los botones quedaban activos y
      en ningún sitio ponía "agotado". El cliente pulsaba comprar y se le pedía
      elegir una talla que no se podía pulsar.
    */
    assert.match(codigo, /productHasStock[\s\S]{0,200}variants\.some\([\s\S]{0,60}stock > 0/);
  });

  test("y manda sobre la variante seleccionada", () => {
    assert.match(codigo, /isOutOfStock\s*=\s*\n?\s*!productHasStock \|\|/);
  });

  test("sin stock NO se pide elegir una talla imposible", () => {
    // El mensaje "elige una talla" solo aparece si hay alguna que elegir.
    assert.match(codigo, /showValidation && productHasStock && \(missingSize \|\| missingColor\)/);
  });

  test("y se DICE que está agotado, no se deduce de unas tallas tachadas", () => {
    assert.match(source, /!productHasStock \? \([\s\S]{0,400}Agotado/);
  });
});

describe("el hueco de la foto no puede comerse la primera pantalla", () => {
  test("sin imagen, la proporción es ancha; con imagen, retrato", () => {
    /*
      Medido a 390×844 con el catálogo real (sin fotos): el placeholder 3/4
      ocupaba 520 px y empujaba el CTA hasta 1108 px — 1,3 pantallas de scroll
      para llegar al botón de comprar desde un anuncio.
    */
    const source = fs.readFileSync("app/(store)/producto/[slug]/page.tsx", "utf8");
    assert.match(source, /ratio=\{mainImage\?\.url \? "portrait" : "wide"\}/);
  });

  test("la imagen principal sigue siendo la única con `priority` (LCP)", () => {
    const source = sinComentarios(
      fs.readFileSync("app/(store)/producto/[slug]/page.tsx", "utf8"),
    );
    assert.equal((source.match(/priority/g) ?? []).length, 1);
  });
});

describe("una ficha sin foto sigue siendo compartible", () => {
  const source = fs.readFileSync("app/(store)/producto/[slug]/page.tsx", "utf8");

  test("hay respaldo a la portada de la tienda cuando el producto no tiene fotos", () => {
    // Medido antes: `og:image` → null y `twitter:card` → "summary". Pegar el
    // enlace en WhatsApp o usarlo de destino de un anuncio daba una tarjeta
    // sin imagen.
    assert.match(source, /ownImages\.length > 0 \? ownImages : \[absoluteUrl\(siteUrl, "\/opengraph-image"\)\]/);
  });

  test("la foto del producto MANDA cuando existe", () => {
    assert.match(sinComentarios(source), /const ogImages = ownImages\.length > 0 \? ownImages/);
  });

  test("la tarjeta es siempre grande: nunca se queda en `summary`", () => {
    assert.match(sinComentarios(source), /card: "summary_large_image"/);
    assert.ok(
      !/card: images\.length > 0 \? "summary_large_image" : "summary"/.test(source),
      "quedó la versión que dejaba la tarjeta pequeña sin foto",
    );
  });

  test("NO se inventa una imagen del producto", () => {
    /*
      El respaldo es la PORTADA de la tienda —logo y frase administrables—, no
      una fotografía falsa ni una plantilla que simule el producto.
    */
    assert.match(source, /opengraph-image/);
    assert.ok(
      !/placeholder\.|picsum|unsplash|dummyimage|via\.placeholder/i.test(source),
      "hay una imagen de relleno de un servicio externo",
    );
  });
});

describe("la ficha no inventa información de producto", () => {
  const source = fs.readFileSync("app/(store)/producto/[slug]/page.tsx", "utf8");

  test("descripción y materiales salen de columnas, no de literales", () => {
    assert.match(source, /\{product\.description\}/);
    assert.match(source, /\{product\.materials\}/);
  });

  test("no hay copy comercial escrito a mano en la ficha", () => {
    const visible = sinComentarios(source);
    assert.ok(
      !/env[ií]o gratis|garant[ií]a|devoluci[oó]n gratuita|100% |mejor precio|calidad premium/i.test(
        visible,
      ),
      "hay una promesa comercial escrita en el código",
    );
  });
});
