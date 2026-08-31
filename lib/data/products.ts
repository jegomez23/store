import { cache } from "react";
import { createClient } from "@/lib/supabase/static";
import type { ActiveMarket } from "@/lib/markets";

const IMAGES_BUCKET = "products";

interface RawImage {
  url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
}

interface RawVariant {
  id: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  is_active: boolean;
  // Sin Database types generados, postgrest-js no puede inferir la
  // cardinalidad real de estos embeds (many-to-one) y a veces los tipa como
  // array — normalizado en tiempo de ejecución vía `oneOrNull()`.
  colors: { name: string; hex_code: string } | { name: string; hex_code: string }[] | null;
  sizes: { label: string; size_group: string } | { label: string; size_group: string }[] | null;
}

/** Normaliza un embed de Supabase que puede llegar como objeto o array de 1. */
function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface CatalogProduct {
  slug: string;
  name: string;
  isNew: boolean;
  imageUrl: string | null;
  imageAlt: string;
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
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  materials: string | null;
  isNew: boolean;
  images: { url: string | null; alt: string }[];
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

function pickPrimaryImage(images: RawImage[]): RawImage | undefined {
  return (
    images.find((image) => image.is_primary) ??
    [...images].sort((a, b) => a.sort_order - b.sort_order)[0]
  );
}

function cheapestActiveVariant(variants: RawVariant[]): RawVariant | undefined {
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
      .select("slug")
      .eq("market_id", market.id)
      .eq("status", "active")
      .is("deleted_at", null);

    if (error) {
      throw new Error(`No se pudieron listar los productos: ${error.message}`);
    }

    return (data ?? []).map((row) => row.slug);
  },
);

/** Productos destacados de Home (docs/03-DATABASE.md idx_products_featured). */
export const getFeaturedProducts = cache(
  async (market: ActiveMarket, limit = 4): Promise<CatalogProduct[]> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      .select(
        "slug, name, is_new, product_images(url, alt_text, is_primary, sort_order), product_variants(id, price, compare_at_price, stock, is_active, colors(name, hex_code), sizes(label, size_group))",
      )
      .eq("market_id", market.id)
      .eq("status", "active")
      .eq("is_featured", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`No se pudieron cargar los productos destacados: ${error.message}`);
    }

    return (data ?? []).flatMap((product) => {
      const cheapest = cheapestActiveVariant(product.product_variants as RawVariant[]);
      if (!cheapest) return [];

      const primaryImage = pickPrimaryImage(product.product_images as RawImage[]);

      return [
        {
          slug: product.slug,
          name: product.name,
          isNew: product.is_new,
          imageUrl: resolveImageUrl(supabase, primaryImage?.url),
          imageAlt: primaryImage?.alt_text ?? product.name,
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

    const { data, error } = await supabase
      .from("products")
      .select(
        "slug, name, short_description, description, materials, is_new, product_images(url, alt_text, is_primary, sort_order), product_variants(id, price, compare_at_price, stock, is_active, colors(name, hex_code), sizes(label, size_group))",
      )
      .eq("market_id", market.id)
      .eq("slug", slug)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo cargar el producto "${slug}": ${error.message}`);
    }

    if (!data) return null;

    const rawVariants = data.product_variants as RawVariant[];
    const activeVariants = rawVariants.filter((variant) => variant.is_active);
    const cheapest = cheapestActiveVariant(rawVariants);

    if (activeVariants.length === 0 || !cheapest) return null;

    const images = (data.product_images as RawImage[])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => ({
        url: resolveImageUrl(supabase, image.url),
        alt: image.alt_text,
      }));

    return {
      slug: data.slug,
      name: data.name,
      shortDescription: data.short_description,
      description: data.description,
      materials: data.materials,
      isNew: data.is_new,
      images,
      variants: activeVariants.map((variant) => {
        const color = oneOrNull(variant.colors);
        const size = oneOrNull(variant.sizes);
        return {
          id: variant.id,
          colorName: color?.name ?? null,
          colorHex: color?.hex_code ?? null,
          sizeLabel: size?.label ?? null,
          price: variant.price,
          compareAtPrice: variant.compare_at_price,
          stock: variant.stock,
        };
      }),
      price: cheapest.price,
      compareAtPrice: cheapest.compare_at_price,
      currencyCode: market.currencyCode,
      locale: market.locale,
    };
  },
);
