import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Divider } from "@/components/ui/Divider";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { AddToCartForm } from "@/components/store/cart/AddToCartForm";
import { getAllProductSlugs, getProductBySlug } from "@/lib/data/products";
import { getStorefrontSettings } from "@/lib/data/settings";
import { listShippingMethods } from "@/lib/data/shipping";
import { summarizeShipping } from "@/lib/checkout/shipping-summary";
import { ShippingNote } from "@/components/store/ShippingNote";
import { getActiveMarket } from "@/lib/markets";
import {
  breadcrumbJsonLd,
  productJsonLd,
  serializeJsonLd,
} from "@/lib/seo/json-ld";
import { absoluteUrl, normalizeSiteUrl, productPath } from "@/lib/seo/urls";

export const revalidate = 300;

export async function generateStaticParams() {
  const market = await getActiveMarket();
  const slugs = await getAllProductSlugs(market);
  return slugs.map((slug) => ({ slug }));
}

/**
 * Metadata de la ficha (Fase 9, `docs/09-SEO-PERFORMANCE.md` §1).
 *
 * Solo campos que EXISTEN en el esquema: `meta_title`/`meta_description` con
 * fallback a `name`/`short_description`/`description`, tal y como documenta
 * `03-DATABASE.md` §2.6. No se inventa ningún campo SEO nuevo.
 *
 * Un producto que no existe, es borrador o está eliminado devuelve `null` desde
 * `getProductBySlug` (la misma función que usa la página para hacer `notFound()`),
 * así que su metadata sale con `robots: noindex`: si por lo que sea llegara a
 * responder, no se indexa.
 */
export async function generateMetadata(
  props: PageProps<"/producto/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const market = await getActiveMarket();
  // El `siteName` de Open Graph sale de `settings` desde el incremento 16: era
  // el último "YI" escrito a mano en una ficha. La consulta la comparte con el
  // layout de `(store)` (`cache()` de React), así que no añade ninguna.
  const [product, settings] = await Promise.all([
    getProductBySlug(market, slug),
    getStorefrontSettings(market),
  ]);

  if (!product) {
    return { title: "Producto no encontrado", robots: { index: false, follow: false } };
  }

  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const canonical = productPath(product.slug);
  const description =
    product.metaDescription ??
    product.shortDescription ??
    product.description ??
    undefined;
  const ownImages = product.images
    .flatMap((image) => (image.url ? [image.url] : []))
    .slice(0, 4);

  /*
    ───────────────────────────────────────────────────────────────────────
    UNA FICHA SIN FOTO SE COMPARTÍA SIN NINGUNA IMAGEN (incremento 19)
    ───────────────────────────────────────────────────────────────────────
    MEDIDO sobre el build servido con el catálogo real:

        <meta property="og:image"> → null
        <meta name="twitter:card"> → "summary"

    Es decir: pegar el enlace de un producto en WhatsApp, en Instagram o
    usarlo de destino de un anuncio daba una tarjeta sin imagen — justo
    cuando la imagen es lo único que detiene el scroll.

    La foto del producto sigue siendo la mejor opción y manda cuando existe.
    Cuando no, se cae a la PORTADA de la tienda (`app/opengraph-image.tsx`),
    que ya lleva el logo y la frase administrables (DEC-071, DEC-074). No es
    una imagen inventada del producto: es la marca, que es lo que la tienda
    puede afirmar con verdad mientras no haya fotografía.
  */
  const ogImages = ownImages.length > 0 ? ownImages : [absoluteUrl(siteUrl, "/opengraph-image")];

  return {
    title: product.metaTitle ?? product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: absoluteUrl(siteUrl, canonical),
      title: product.metaTitle ?? product.name,
      description,
      ...(settings?.storeName ? { siteName: settings.storeName } : {}),
      locale: market.locale,
      images: ogImages,
    },
    twitter: {
      // Siempre hay imagen grande: o la del producto, o la portada.
      card: "summary_large_image",
      title: product.metaTitle ?? product.name,
      description,
      images: ogImages,
    },
  };
}

export default async function ProductPage(
  props: PageProps<"/producto/[slug]">,
) {
  const { slug } = await props.params;
  const market = await getActiveMarket();
  /*
    El envío se carga aquí y NO en un componente cliente: es un dato del
    servidor, no cambia con la interacción, y así no viaja ni un byte de
    JavaScript de más. Va en paralelo con el producto.
  */
  const [product, shippingMethods] = await Promise.all([
    getProductBySlug(market, slug),
    listShippingMethods(market),
  ]);

  if (!product) notFound();

  const shipping = summarizeShipping(shippingMethods);

  const [mainImage, ...detailImages] = product.images;

  // JSON-LD (docs/09-SEO-PERFORMANCE.md §1). Se construye en el Server
  // Component: no añade ni un byte de JavaScript al cliente. Todos los valores
  // salen de columnas reales — el stock que se declara es la suma del stock de
  // las variantes ACTIVAS, el mismo que decide si la ficha es comprable.
  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const productUrl = absoluteUrl(siteUrl, productPath(product.slug));
  const jsonLd = productJsonLd({
    name: product.name,
    slug: product.slug,
    url: productUrl,
    description: product.shortDescription ?? product.description,
    images: product.images.flatMap((image) => (image.url ? [image.url] : [])),
    price: product.price,
    currencyCode: product.currencyCode,
    stock: product.variants.reduce((total, variant) => total + variant.stock, 0),
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: "Inicio", url: absoluteUrl(siteUrl, "/") },
    { name: product.name, url: productUrl },
  ]);

  return (
    <Container className="flex flex-col gap-8 py-8 md:grid md:grid-cols-2 md:items-start md:gap-12 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
      />
      <div className="flex flex-col gap-3">
        {/*
          ─────────────────────────────────────────────────────────────────
          SIN FOTO, EL HUECO NO PUEDE OCUPAR MEDIA PANTALLA (incremento 19)
          ─────────────────────────────────────────────────────────────────
          MEDIDO en Chrome a 390×844 sobre el build servido, con el catálogo
          real (que hoy no tiene fotos):

              placeholder 3/4  →  520 px de alto
              h1               →  639 px
              precio           →  748 px
              tallas           →  920 px
              CTA              → 1108 px   ← 1,3 pantallas de scroll

          Es decir: quien llega desde un anuncio ve un recuadro gris enorme y
          tiene que bajar dos veces para encontrar el botón de comprar. El
          recuadro no comunica NADA —no hay foto que enseñar—, así que se le da
          la proporción ancha: sigue marcando dónde irá la imagen, pero sin
          gastarse la primera pantalla.

          Con foto real se mantiene el retrato 3/4, que es el formato de la
          fotografía de producto y el que decide el LCP.
        */}
        <RemoteImage
          src={mainImage?.url ?? null}
          alt={mainImage?.alt ?? product.name}
          blurDataURL={mainImage?.blurDataUrl ?? null}
          ratio={mainImage?.url ? "portrait" : "wide"}
          // Única imagen above-the-fold de la ficha: la que decide el LCP
          // (09-SEO-PERFORMANCE.md §56). Ninguna otra lleva `priority`.
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
        />
        {detailImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {detailImages.map((image, index) => (
              <RemoteImage
                key={index}
                src={image.url}
                alt={image.alt}
                blurDataURL={image.blurDataUrl}
                ratio="square"
                sizes="(min-width: 768px) 17vw, 33vw"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {product.isNew ? (
            <Badge tone="accent" className="w-fit">
              Nuevo
            </Badge>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
            {product.name}
          </h1>
          <p className="text-sm text-gray-700">{product.shortDescription}</p>
        </div>

        <Divider />

        {/*
          Precio, selección de variante, cantidad y "Añadir al carrito" viven
          juntos en un único Client Component: son una sola interacción y
          necesitan compartir la variante seleccionada. El resto de la ficha
          sigue siendo Server Component.
        */}
        <AddToCartForm product={product} />

        {/*
          EL ENVÍO, ANTES DEL CHECKOUT (incremento 19). Hasta aquí el cliente no
          sabía cuánto costaba recibirlo hasta el último paso. Sale de
          `shipping_methods`, igual que el checkout y que `create_order`: la
          ficha no puede inventarse un importe ni contradecir lo que se cobra.
        */}
        <ShippingNote
          summary={shipping}
          currencyCode={product.currencyCode}
          locale={product.locale}
        />

        <Divider />

        <div className="flex flex-col gap-4 text-sm text-gray-700">
          <div>
            <h2 className="mb-1 font-semibold text-black">Descripción</h2>
            <p>{product.description}</p>
          </div>
          <div>
            <h2 className="mb-1 font-semibold text-black">Materiales</h2>
            <p>{product.materials}</p>
          </div>
        </div>
      </div>
    </Container>
  );
}
