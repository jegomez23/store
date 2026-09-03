import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductCard } from "@/components/store/ProductCard";
import { getCategories } from "@/lib/data/categories";
import { getHomeHero } from "@/lib/data/home";
import { getFeaturedProducts } from "@/lib/data/products";
import { getActiveMarket } from "@/lib/markets";

export const revalidate = 300;

/**
 * Metadata de la home (Fase 9). Canonical explícita para que los enlaces con
 * `?utm_...` o con hash no generen duplicados a ojos de Google
 * (`docs/09-SEO-PERFORMANCE.md` §1, "Sin páginas duplicadas").
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "YI",
    title: "YI",
    description: "Vive a tu propio ritmo.",
  },
  twitter: {
    card: "summary_large_image",
    title: "YI",
    description: "Vive a tu propio ritmo.",
  },
};

// TODO(i18n): strings visibles sin centralizar — lib/i18n/ no existe
// todavía (DEC-013 resuelta, español único; módulo pendiente de crear).
export default async function Home() {
  const market = await getActiveMarket();
  const [hero, categories, featured] = await Promise.all([
    getHomeHero(market),
    getCategories(market),
    getFeaturedProducts(market),
  ]);
  const firstProduct = featured[0];

  return (
    <>
      {/* Hero de marca */}
      <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 border-b border-line bg-cream px-4 text-center md:min-h-[80vh]">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
          Streetwear · Naturaleza · Ciudad
        </span>
        <h1 className="max-w-lg text-4xl font-bold tracking-tight text-black md:text-6xl">
          {hero?.title ?? "YI"}
        </h1>
        <p className="max-w-sm text-base text-gray-700 md:text-lg">
          {hero?.subtitle ?? "Vive a tu propio ritmo."}
        </p>
        <a href={hero?.ctaHref ?? "#destacados"}>
          <Button variant="primary">{hero?.ctaLabel ?? "Explorar"}</Button>
        </a>
      </section>

      {/* Categorías */}
      <section id="categorias" className="scroll-mt-16 py-14 md:py-20">
        <Container className="flex flex-col gap-6">
          <SectionHeading
            title="Categorías"
            subtitle="Encuentra lo tuyo por tipo de prenda."
          />
          {categories.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {categories.map((category) => (
                <div key={category.slug} className="flex flex-col gap-2">
                  <RemoteImage
                    src={category.imageUrl}
                    alt={category.name}
                    ratio="square"
                  />
                  <span className="text-sm font-medium text-black">
                    {category.name}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Todavía no hay categorías publicadas.
            </p>
          )}
        </Container>
      </section>

      {/* Productos destacados */}
      <section id="destacados" className="scroll-mt-16 bg-cream-dark py-14 md:py-20">
        <Container className="flex flex-col gap-6">
          <SectionHeading
            title="Destacados"
            subtitle="Lo nuevo de la temporada."
          />
          {featured.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Todavía no hay productos destacados.
            </p>
          )}
        </Container>
      </section>

      {/* Sección conceptual de YI */}
      <section className="py-14 md:py-20">
        <Container className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
          <RemoteImage src={null} alt="Montaña + ciudad" ratio="wide" />
          <div className="flex flex-col gap-3">
            <SectionHeading title="Naturaleza + actitud" />
            <p className="text-sm text-gray-700 md:text-base">
              YI nace del cruce entre la montaña y la calle: prendas pensadas
              para moverte con la misma libertad en la ciudad que en el
              sendero. Sin etiquetas, sin reglas fijas — vive a tu propio
              ritmo.
            </p>
            {firstProduct ? (
              <Badge tone="accent" className="w-fit">
                Nueva colección
              </Badge>
            ) : null}
          </div>
        </Container>
      </section>

      {/* CTA final */}
      <section className="border-t border-line bg-black py-14 text-center md:py-20">
        <Container className="flex flex-col items-center gap-4">
          <SectionHeading
            title="Nuevos lanzamientos cada temporada"
            className="items-center text-center [&_h2]:text-white [&_p]:text-gray-400"
          />
          {firstProduct ? (
            <Link href={`/producto/${firstProduct.slug}`}>
              <Button variant="primary">Ver producto</Button>
            </Link>
          ) : null}
        </Container>
      </section>
    </>
  );
}
