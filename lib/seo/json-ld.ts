/**
 * JSON-LD de la ficha de producto (`docs/09-SEO-PERFORMANCE.md` §1: "JSON-LD:
 * `Product` (name, image, offers con precio/moneda/disponibilidad) y
 * `BreadcrumbList` en ficha — inyectado en Server Component").
 *
 * Módulo PURO (DEC-025): recibe datos ya resueltos y devuelve objetos. No lee
 * la BD, no toca `process.env` y no serializa a HTML — de eso se encarga la
 * página.
 *
 * REGLA: aquí NO se inventa nada. Cada campo del JSON-LD sale de una columna
 * real del catálogo. Un producto sin descripción no publica una descripción
 * fabricada: se omite la clave. Datos falsos en JSON-LD son una penalización
 * de Google, no un adorno.
 */

export interface JsonLdProductInput {
  name: string;
  slug: string;
  url: string;
  description: string | null;
  /** URLs absolutas de las imágenes, en orden (la principal primero). */
  images: string[];
  /** Precio más bajo entre las variantes activas, en unidades de la moneda. */
  price: number;
  currencyCode: string;
  /** Suma de stock de las variantes activas. */
  stock: number;
}

/** `availability` de schema.org derivada del stock real, nunca supuesta. */
export function availabilityFor(stock: number): string {
  return stock > 0
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

/**
 * Precio en el formato que schema.org espera: número decimal con punto y dos
 * decimales, sin símbolo de moneda (esa va en `priceCurrency`).
 */
export function jsonLdPrice(price: number): string {
  return price.toFixed(2);
}

export function productJsonLd(input: JsonLdProductInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    sku: input.slug,
    url: input.url,
    offers: {
      "@type": "Offer",
      url: input.url,
      price: jsonLdPrice(input.price),
      priceCurrency: input.currencyCode,
      availability: availabilityFor(input.stock),
    },
  };

  if (input.description && input.description.trim().length > 0) {
    node.description = input.description.trim();
  }
  if (input.images.length > 0) {
    node.image = input.images;
  }

  return node;
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/**
 * `BreadcrumbList`. Hoy la miga es Inicio → producto: la ruta
 * `/categoria/[slug]` de `09-SEO-PERFORMANCE.md` §1 todavía no existe en la
 * app, y un breadcrumb que apunte a un 404 es peor que no tenerlo.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Serializa a texto seguro para `<script type="application/ld+json">`.
 *
 * `</script>` dentro de un string JSON cerraría la etiqueta y convertiría el
 * resto en HTML ejecutable: se escapa `<` como `<`. Los datos vienen del
 * catálogo, que edita el admin, pero eso no lo hace confiable como HTML.
 */
export function serializeJsonLd(node: Record<string, unknown>): string {
  return JSON.stringify(node).replace(/</g, "\\u003c");
}
