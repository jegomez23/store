import { cache } from "react";
import type { QueryData } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/static";
import type { ActiveMarket } from "@/lib/markets";

const IMAGES_BUCKET = "products";

/**
 * Selects declarados una sola vez: `QueryData<typeof query>` deriva los tipos
 * de fila del esquema real (`types/database.types.ts`, generado con
 * `npm run db:types`). No se declaran interfaces "Raw*" a mano — la
 * cardinalidad de los embeds (array vs objeto|null) la infiere postgrest-js
 * a partir de las FKs, que es justo lo que se quiere representar.
 */
const LIST_SELECT =
  "slug, name, is_new, product_images(url, alt_text, is_primary, sort_order, blur_data_url), product_variants(id, price, compare_at_price, stock, is_active, colors(name, hex_code), sizes(label, size_group))";

const DETAIL_SELECT =
  "id, slug, name, short_description, description, materials, is_new, meta_title, meta_description, product_images(url, alt_text, is_primary, sort_order, blur_data_url), product_variants(id, price, compare_at_price, stock, is_active, colors(name, hex_code), sizes(label, size_group))";

function listQuery(supabase: ReturnType<typeof createClient>, marketId: string) {
  return supabase
    .from("products")
    .select(LIST_SELECT)
    .eq("market_id", marketId)
    .eq("status", "active")
    .is("deleted_at", null);
}

function detailQuery(
  supabase: ReturnType<typeof createClient>,
  marketId: string,
  slug: string,
) {
  return supabase
    .from("products")
    .select(DETAIL_SELECT)
    .eq("market_id", marketId)
    .eq("slug", slug)
    .eq("status", "active")
    .is("deleted_at", null);
}

type ProductListRow = QueryData<ReturnType<typeof listQuery>>[number];
type ProductDetailRow = QueryData<ReturnType<typeof detailQuery>>[number];
type ImageRow = ProductListRow["product_images"][number];
type VariantRow = ProductListRow["product_variants"][number];

export interface CatalogProduct {
  slug: string;
  name: string;
  isNew: boolean;
  imageUrl: string | null;
  imageAlt: string;
  /** Placeholder blur del servidor (Fase 9); `null` si la imagen es anterior. */
  imageBlurDataUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  currencyCode: string;
  locale: string;
}

export interface ProductVariantOption {
  id: string;
  colorName: string | null;
  colorHex: string | null;
  sizeLabel: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
}

export interface CatalogProductDetail {
  /** `products.id` — necesario para las líneas del carrito (Fase 5). */
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  materials: string | null;
  isNew: boolean;
  /** `products.meta_title` — fallback a `name` lo hace la página. */
  metaTitle: string | null;
  /** `products.meta_description` — fallback en la página. */
  metaDescription: string | null;
  images: { url: string | null; alt: string; blurDataUrl: string | null }[];
  variants: ProductVariantOption[];
  price: number;
  compareAtPrice: number | null;
  currencyCode: string;
  locale: string;
}

function resolveImageUrl(
  supabase: ReturnType<typeof createClient>,
  path: string | undefined,
): string | null {
  if (!path) return null;
  return supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

function pickPrimaryImage(images: ImageRow[]): ImageRow | undefined {
  return (
    images.find((image) => image.is_primary) ??
    [...images].sort((a, b) => a.sort_order - b.sort_order)[0]
  );
}

function cheapestActiveVariant(variants: VariantRow[]): VariantRow | undefined {
  return variants
    .filter((variant) => variant.is_active)
    .sort((a, b) => a.price - b.price)[0];
}

/** Slugs de productos publicados del mercado, para generateStaticParams. */
export const getAllProductSlugs = cache(
  async (market: ActiveMarket): Promise<string[]> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      // `product_variants!inner` + `is_active`: exige que exista AL MENOS UNA
      // variante activa. Sin esto se prerenderizaban fichas que devuelven 404,
      // porque `getProductBySlug` retorna null en ese caso (Fase 9.5, 5B).
      .select("slug, product_variants!inner(id)")
      .eq("market_id", market.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("product_variants.is_active", true);

    if (error) {
      throw new Error(`No se pudieron listar los productos: ${error.message}`);
    }

    return (data ?? []).map((row) => row.slug);
  },
);

export interface SitemapProduct {
  slug: string;
  lastModified: string;
}

/**
 * Entradas de producto del sitemap (Fase 9).
 *
 * Los MISMOS filtros que la ficha pública: mercado, `status = 'active'`,
 * `deleted_at is null` **y al menos una variante activa**. Además RLS (DEC-022)
 * ya exige mercado activo, así que hay dos barreras, no una.
 *
 * ⚠️ CORRECCIÓN DE FASE 9.5 (5B): esta última condición faltaba, y el comentario
 * afirmaba "los mismos filtros que la ficha pública" cuando no lo eran. La
 * ficha devuelve 404 sin variantes activas (`getProductBySlug` retorna null),
 * así que el sitemap estaba mandando a Google exactamente al 404 que este
 * comentario decía evitar. Reproducido sobre el build servido: **2 de 8 URLs
 * del sitemap respondían 404**. El stock NO entra aquí: un producto agotado se
 * muestra como "Agotado" y su ficha responde 200, que es lo previsto.
 *
 * No se listan variantes ni categorías: `/categoria/[slug]` no existe todavía
 * como ruta (`docs/09-SEO-PERFORMANCE.md` §1 la describe, `app/` no la
 * implementa).
 */
export const getSitemapProducts = cache(
  async (market: ActiveMarket): Promise<SitemapProduct[]> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      .select("slug, updated_at, product_variants!inner(id)")
      .eq("market_id", market.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("product_variants.is_active", true)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`No se pudo generar el sitemap: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      slug: row.slug,
      lastModified: row.updated_at,
    }));
  },
);

/** Productos destacados de Home (docs/03-DATABASE.md idx_products_featured). */
export const getFeaturedProducts = cache(
  async (market: ActiveMarket, limit = 4): Promise<CatalogProduct[]> => {
    const supabase = createClient();

    const { data, error } = await listQuery(supabase, market.id)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`No se pudieron cargar los productos destacados: ${error.message}`);
    }

    return (data ?? []).flatMap((product) => {
      const cheapest = cheapestActiveVariant(product.product_variants);
      if (!cheapest) return [];

      const primaryImage = pickPrimaryImage(product.product_images);

      return [
        {
          slug: product.slug,
          name: product.name,
          isNew: product.is_new,
          imageUrl: resolveImageUrl(supabase, primaryImage?.url),
          imageAlt: primaryImage?.alt_text ?? product.name,
          imageBlurDataUrl: primaryImage?.blur_data_url ?? null,
          price: cheapest.price,
          compareAtPrice: cheapest.compare_at_price,
          currencyCode: market.currencyCode,
          locale: market.locale,
        },
      ];
    });
  },
);

/**
 * Ficha de producto por slug. Devuelve `null` si no existe, está eliminado,
 * no publicado o no pertenece al mercado — RLS ya filtra estos casos junto
 * con `status`/`deleted_at` explícitos aquí (docs/rules/backend.md #7).
 */
export const getProductBySlug = cache(
  async (market: ActiveMarket, slug: string): Promise<CatalogProductDetail | null> => {
    const supabase = createClient();

    const { data, error } = await detailQuery(supabase, market.id, slug).maybeSingle();

    if (error) {
      throw new Error(`No se pudo cargar el producto "${slug}": ${error.message}`);
    }

    if (!data) return null;

    const product: ProductDetailRow = data;
    const activeVariants = product.product_variants.filter((variant) => variant.is_active);
    const cheapest = cheapestActiveVariant(product.product_variants);

    if (activeVariants.length === 0 || !cheapest) return null;

    const images = [...product.product_images]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => ({
        url: resolveImageUrl(supabase, image.url),
        alt: image.alt_text,
        blurDataUrl: image.blur_data_url,
      }));

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.short_description,
      description: product.description,
      materials: product.materials,
      isNew: product.is_new,
      metaTitle: product.meta_title,
      metaDescription: product.meta_description,
      images,
      variants: activeVariants.map((variant) => ({
        id: variant.id,
        colorName: variant.colors?.name ?? null,
        colorHex: variant.colors?.hex_code ?? null,
        sizeLabel: variant.sizes?.label ?? null,
        price: variant.price,
        compareAtPrice: variant.compare_at_price,
        stock: variant.stock,
      })),
      price: cheapest.price,
      compareAtPrice: cheapest.compare_at_price,
      currencyCode: market.currencyCode,
      locale: market.locale,
    };
  },
);
