import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  availabilityFor,
  breadcrumbJsonLd,
  jsonLdPrice,
  productJsonLd,
  serializeJsonLd,
} from "../json-ld.ts";

const BASE = {
  name: "Camiseta Sendero Oversize",
  slug: "camiseta-sendero-oversize",
  url: "https://yi.example/producto/camiseta-sendero-oversize",
  description: "Algodón orgánico.",
  images: ["https://cdn.example/1.webp"],
  price: 42.5,
  currencyCode: "EUR",
  stock: 7,
};

describe("availabilityFor", () => {
  test("sale del stock REAL, no de una suposición", () => {
    assert.equal(availabilityFor(7), "https://schema.org/InStock");
    assert.equal(availabilityFor(1), "https://schema.org/InStock");
    assert.equal(availabilityFor(0), "https://schema.org/OutOfStock");
  });
});

describe("jsonLdPrice", () => {
  test("usa punto decimal y dos decimales, sin moneda", () => {
    assert.equal(jsonLdPrice(42.5), "42.50");
    assert.equal(jsonLdPrice(89.9), "89.90");
    assert.equal(jsonLdPrice(12), "12.00");
  });
});

describe("productJsonLd", () => {
  test("declara el tipo y los campos que pide 09-SEO-PERFORMANCE §1", () => {
    const node = productJsonLd(BASE) as Record<string, unknown>;
    assert.equal(node["@type"], "Product");
    assert.equal(node["@context"], "https://schema.org");
    assert.equal(node.name, BASE.name);
    assert.deepEqual(node.image, BASE.images);

    const offer = node.offers as Record<string, unknown>;
    assert.equal(offer["@type"], "Offer");
    assert.equal(offer.price, "42.50");
    assert.equal(offer.priceCurrency, "EUR");
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.equal(offer.url, BASE.url);
  });

  test("un producto agotado se declara agotado", () => {
    const node = productJsonLd({ ...BASE, stock: 0 });
    const offer = node.offers as Record<string, unknown>;
    assert.equal(offer.availability, "https://schema.org/OutOfStock");
  });

  test("sin descripción NO se inventa una: se omite la clave", () => {
    assert.ok(!("description" in productJsonLd({ ...BASE, description: null })));
    assert.ok(!("description" in productJsonLd({ ...BASE, description: "   " })));
  });

  test("sin imágenes se omite `image` en vez de publicar un array vacío", () => {
    assert.ok(!("image" in productJsonLd({ ...BASE, images: [] })));
  });
});

describe("breadcrumbJsonLd", () => {
  test("numera las posiciones desde 1", () => {
    const node = breadcrumbJsonLd([
      { name: "Inicio", url: "https://yi.example/" },
      { name: "Producto", url: BASE.url },
    ]);
    const items = node.itemListElement as Record<string, unknown>[];
    assert.equal(node["@type"], "BreadcrumbList");
    assert.equal(items.length, 2);
    assert.equal(items[0].position, 1);
    assert.equal(items[1].position, 2);
    assert.equal(items[1].item, BASE.url);
  });
});

describe("serializeJsonLd", () => {
  test("escapa '<' para que un nombre no pueda cerrar el <script>", () => {
    const node = productJsonLd({
      ...BASE,
      name: 'Camiseta </script><img src=x onerror=alert(1)>',
    });
    const out = serializeJsonLd(node);
    assert.ok(!out.includes("</script>"), "no debe quedar un </script> literal");
    assert.ok(!out.includes("<img"), "no debe quedar un tag literal");
    assert.ok(out.includes("\\u003c"));
  });

  test("sigue siendo JSON válido tras el escapado", () => {
    const out = serializeJsonLd(productJsonLd({ ...BASE, name: "A < B" }));
    const parsed = JSON.parse(out) as Record<string, unknown>;
    assert.equal(parsed.name, "A < B");
  });
});
