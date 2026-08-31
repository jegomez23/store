import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Divider } from "@/components/ui/Divider";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { VariantPicker } from "@/components/store/VariantPicker";
import { formatPrice } from "@/lib/money/format";
import { getAllProductSlugs, getProductBySlug } from "@/lib/data/products";
import { getActiveMarket } from "@/lib/markets";

export const revalidate = 300;

export async function generateStaticParams() {
  const market = await getActiveMarket();
  const slugs = await getAllProductSlugs(market);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/producto/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const market = await getActiveMarket();
  const product = await getProductBySlug(market, slug);

  if (!product) return { title: "Producto no encontrado" };

  return {
    title: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    openGraph: product.images[0]?.url
      ? { images: [{ url: product.images[0].url }] }
      : undefined,
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

  return (
    <Container className="flex flex-col gap-8 py-8 md:grid md:grid-cols-2 md:items-start md:gap-12 md:py-14">
      <div className="flex flex-col gap-3">
        <RemoteImage
          src={mainImage?.url ?? null}
          alt={mainImage?.alt ?? product.name}
          priority
        />
        {detailImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {detailImages.map((image, index) => (
              <RemoteImage
                key={index}
                src={image.url}
                alt={image.alt}
                ratio="square"
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
          <div className="flex items-center gap-2">
            <span
              className={`text-xl font-semibold ${
                product.compareAtPrice ? "text-red" : "text-black"
              }`}
            >
              {formatPrice(product.price, product.currencyCode, product.locale)}
            </span>
            {product.compareAtPrice ? (
              <span className="text-sm text-gray-400 line-through">
                {formatPrice(
                  product.compareAtPrice,
                  product.currencyCode,
                  product.locale,
                )}
              </span>
            ) : null}
          </div>
        </div>

        <Divider />

        <VariantPicker variants={product.variants} />

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            disabled
            aria-label="Comprar por WhatsApp (próximamente)"
            className="w-full"
          >
            Comprar por WhatsApp
          </Button>
          <Button
            variant="secondary"
            disabled
            aria-label="Añadir al carrito (próximamente)"
            className="w-full"
          >
            Añadir al carrito
          </Button>
          <p className="text-xs text-gray-400">
            Compra disponible próximamente — catálogo en construcción (Fase
            4).
          </p>
        </div>

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
