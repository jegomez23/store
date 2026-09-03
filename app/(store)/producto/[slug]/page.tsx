import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Divider } from "@/components/ui/Divider";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { AddToCartForm } from "@/components/store/cart/AddToCartForm";
import { getAllProductSlugs, getProductBySlug } from "@/lib/data/products";
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
  const product = await getProductBySlug(market, slug);

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
  const images = product.images
    .flatMap((image) => (image.url ? [image.url] : []))
    .slice(0, 4);

  return {
    title: product.metaTitle ?? product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: absoluteUrl(siteUrl, canonical),
      title: product.metaTitle ?? product.name,
      description,
      siteName: "YI",
      locale: market.locale,
      ...(images.length > 0 ? { images } : {}),
    },
    twitter: {
      card: images.length > 0 ? "summary_large_image" : "summary",
      title: product.metaTitle ?? product.name,
      description,
      ...(images.length > 0 ? { images } : {}),
    },
  };
}

export default async function ProductPage(
  props: PageProps<"/producto/[slug]">,
) {
  const { slug } = await props.params;
  const market = await getActiveMarket();
  const product = await getProductBySlug(market, slug);

  if (!product) notFound();

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
        <RemoteImage
          src={mainImage?.url ?? null}
          alt={mainImage?.alt ?? product.name}
          blurDataURL={mainImage?.blurDataUrl ?? null}
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
