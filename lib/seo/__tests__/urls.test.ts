import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DISALLOWED_PREFIXES,
  NOINDEX_ROUTES,
  absoluteUrl,
  normalizeSiteUrl,
  productPath,
  productUrl,
  sitemapUrl,
} from "../urls.ts";

describe("normalizeSiteUrl", () => {
  test("quita la barra final y se queda con el origen", () => {
    assert.equal(normalizeSiteUrl("https://yi.example/"), "https://yi.example");
    assert.equal(normalizeSiteUrl("https://yi.example"), "https://yi.example");
    assert.equal(
      normalizeSiteUrl("https://yi.example/algo/profundo"),
      "https://yi.example",
    );
  });

  test("conserva el puerto", () => {
    assert.equal(normalizeSiteUrl("http://localhost:3458"), "http://localhost:3458");
  });

  test("cae a localhost si falta o no es una URL", () => {
    assert.equal(normalizeSiteUrl(undefined), "http://localhost:3000");
    assert.equal(normalizeSiteUrl(null), "http://localhost:3000");
    assert.equal(normalizeSiteUrl(""), "http://localhost:3000");
    assert.equal(normalizeSiteUrl("   "), "http://localhost:3000");
    assert.equal(normalizeSiteUrl("no-es-una-url"), "http://localhost:3000");
  });

  test("rechaza protocolos que no sean http(s)", () => {
    // Un `javascript:` o un `data:` en metadataBase acabaría en un <link>.
    assert.equal(normalizeSiteUrl("javascript:alert(1)"), "http://localhost:3000");
    assert.equal(normalizeSiteUrl("data:text/html,x"), "http://localhost:3000");
    assert.equal(normalizeSiteUrl("file:///etc/passwd"), "http://localhost:3000");
  });
});

describe("absoluteUrl", () => {
  test("no genera dobles barras", () => {
    assert.equal(absoluteUrl("https://yi.example/", "/"), "https://yi.example/");
    assert.equal(
      absoluteUrl("https://yi.example/", "/producto/x"),
      "https://yi.example/producto/x",
    );
  });

  test("acepta rutas sin barra inicial", () => {
    assert.equal(absoluteUrl("https://yi.example", "sitemap.xml"), "https://yi.example/sitemap.xml");
  });
});

describe("rutas de producto", () => {
  test("productPath y productUrl coinciden con la ruta real de app/", () => {
    assert.equal(productPath("camiseta-sendero-oversize"), "/producto/camiseta-sendero-oversize");
    assert.equal(
      productUrl("https://yi.example", "gorra-horizonte"),
      "https://yi.example/producto/gorra-horizonte",
    );
  });
});

describe("sitemapUrl", () => {
  test("apunta a /sitemap.xml del sitio", () => {
    assert.equal(sitemapUrl("https://yi.example/"), "https://yi.example/sitemap.xml");
  });
});

describe("listas de rutas", () => {
  test("/admin y /api están siempre denegadas", () => {
    assert.ok(DISALLOWED_PREFIXES.includes("/admin"));
    assert.ok(DISALLOWED_PREFIXES.includes("/api"));
  });

  test("carrito, checkout y pedido no son indexables", () => {
    for (const route of ["/carrito", "/checkout", "/pedido"]) {
      assert.ok(
        NOINDEX_ROUTES.includes(route as (typeof NOINDEX_ROUTES)[number]),
        `${route} debería estar en NOINDEX_ROUTES`,
      );
    }
  });

  test("la home NO está denegada: es la página que debe indexarse", () => {
    const blocked: string[] = [...DISALLOWED_PREFIXES, ...NOINDEX_ROUTES];
    assert.ok(!blocked.includes("/"), "la home nunca puede quedar bloqueada");
  });
});
