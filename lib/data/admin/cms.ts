import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { isProductStatus, type ProductStatus } from "@/lib/admin/catalog";
import { isHomeSection, type HomeSection } from "@/lib/admin/content";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Capa de datos del CMS de catálogo (Fase 8). Misma doctrina que
 * `lib/data/admin/{orders,catalog}.ts` (DEC-034):
 *
 * - Cliente autenticado con anon key + sesión. **Sin service role.**
 * - `requireAdmin()` en CADA función: en RSC el layout no impide que la página
 *   hermana se renderice.
 * - Filtro explícito por `market_id`. Desde la migración 0020 RLS también lo
 *   exige (solo mercados activos), así que aquí hay dos barreras, no una.
 * - `select` explícito por caso de uso.
 */

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

// ────────────────────────────────────────────────────── Lookups compartidos

export interface ColorOption {
  id: string;
  name: string;
  slug: string;
  hexCode: string;
}

export interface SizeOption {
  id: string;
  label: string;
  sizeGroup: string;
}

/** `colors` y `sizes` son globales: no llevan `market_id` (migración 0004). */
export async function listColors(): Promise<ColorOption[]> {
  if (!(await requireAdmin())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("colors")
    .select("id, name, slug, hex_code")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`No se pudieron cargar los colores: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    hexCode: c.hex_code,
  }));
}

export async function listSizes(): Promise<SizeOption[]> {
  if (!(await requireAdmin())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sizes")
    .select("id, label, size_group")
    .eq("is_active", true)
    .order("size_group")
    .order("sort_order");
  if (error) throw new Error(`No se pudieron cargar las tallas: ${error.message}`);
  return (data ?? []).map((s) => ({ id: s.id, label: s.label, sizeGroup: s.size_group }));
}

// ───────────────────────────────────────────────────────────── Categorías

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Productos NO borrados que la referencian. Decide si se puede eliminar. */
  productCount: number;
  childCount: number;
}

export async function listCategoriesForAdmin(
  market: ActiveMarket,
): Promise<AdminCategory[]> {
  if (!(await requireAdmin())) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, name, slug, description, parent_id, sort_order, is_active, products(id, deleted_at)",
    )
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);

  const rows = data ?? [];
  const childCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.parent_id) {
      childCounts.set(row.parent_id, (childCounts.get(row.parent_id) ?? 0) + 1);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    productCount: row.products.filter((p) => p.deleted_at === null).length,
    childCount: childCounts.get(row.id) ?? 0,
  }));
}

// ───────────────────────────────────────────────────────────── Productos

export interface AdminProductVariantRow {
  id: string;
  sku: string;
  colorId: string | null;
  sizeId: string | null;
  colorName: string | null;
  sizeLabel: string | null;
  price: number;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  /** Testigo del bloqueo optimista de la correccion absoluta (Fase 9.5). */
  updatedAt: string;
}

export interface AdminProductImageRow {
  id: string;
  /** Ruta relativa al bucket, sin `products/` delante (rules/database.md #19). */
  path: string;
  /** URL pública ya resuelta: `getPublicUrl()` antepone el bucket por su cuenta. */
  publicUrl: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  categoryId: string;
  shortDescription: string | null;
  description: string | null;
  materials: string | null;
  careInstructions: string | null;
  shippingInfoOverride: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  isFeatured: boolean;
  isNew: boolean;
  variants: AdminProductVariantRow[];
  images: AdminProductImageRow[];
}

export async function getProductForAdmin(
  market: ActiveMarket,
  productId: string,
): Promise<AdminProductDetail | null> {
  if (!(await requireAdmin())) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, status, category_id, short_description, description, materials,
       care_instructions, shipping_info_override, meta_title, meta_description,
       is_featured, is_new,
       product_variants(id, sku, color_id, size_id, price, stock, low_stock_threshold, is_active, updated_at,
                        color:colors(name), size:sizes(label)),
       product_images(id, url, alt_text, sort_order, is_primary)`,
    )
    .eq("id", productId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar el producto: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    status: isProductStatus(data.status) ? data.status : "draft",
    categoryId: data.category_id,
    shortDescription: data.short_description,
    description: data.description,
    materials: data.materials,
    careInstructions: data.care_instructions,
    shippingInfoOverride: data.shipping_info_override,
    metaTitle: data.meta_title,
    metaDescription: data.meta_description,
    isFeatured: data.is_featured,
    isNew: data.is_new,
    variants: data.product_variants
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        colorId: v.color_id,
        sizeId: v.size_id,
        colorName: v.color?.name ?? null,
        sizeLabel: v.size?.label ?? null,
        price: toNumber(v.price),
        stock: v.stock,
        lowStockThreshold: v.low_stock_threshold,
        isActive: v.is_active,
        updatedAt: v.updated_at,
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    images: data.product_images
      .map((i) => ({
        id: i.id,
        path: i.url,
        publicUrl: supabase.storage.from("products").getPublicUrl(i.url).data.publicUrl,
        altText: i.alt_text,
        sortOrder: i.sort_order,
        isPrimary: i.is_primary,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/**
 * Slug de un producto, comprobando pertenencia al mercado. Lo usan las acciones
 * de imágenes: la ruta del objeto se deriva del slug REAL de la BD, nunca del
 * que venga en el formulario.
 */
export async function getProductSlugForAdmin(
  market: ActiveMarket,
  productId: string,
): Promise<string | null> {
  if (!(await requireAdmin())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .eq("market_id", market.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`No se pudo verificar el producto: ${error.message}`);
  return data?.slug ?? null;
}

// ─────────────────────────────────────────────────────────────── Home

export interface AdminHomeBlock {
  id: string;
  section: HomeSection;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export async function listHomeBlocksForAdmin(
  market: ActiveMarket,
): Promise<AdminHomeBlock[]> {
  if (!(await requireAdmin())) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("home_content")
    .select("id, section, title, subtitle, cta_label, cta_href, image_url, sort_order, is_active")
    .eq("market_id", market.id)
    .order("sort_order")
    .order("section");

  if (error) throw new Error(`No se pudo cargar el contenido de la home: ${error.message}`);

  return (data ?? [])
    .filter((row) => isHomeSection(row.section))
    .map((row) => ({
      id: row.id,
      section: row.section as HomeSection,
      title: row.title,
      subtitle: row.subtitle,
      ctaLabel: row.cta_label,
      ctaHref: row.cta_href,
      imageUrl: row.image_url,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }));
}

// ────────────────────────────────────────────────────────────── Ajustes

export interface AdminSettingsFull {
  storeName: string;
  whatsappNumber: string;
  contactEmail: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  facebookUrl: string | null;
  logoUrl: string | null;
}

export async function getFullSettingsForAdmin(
  market: ActiveMarket,
): Promise<AdminSettingsFull | null> {
  if (!(await requireAdmin())) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settings")
    .select("store_name, whatsapp_number, contact_email, instagram_url, tiktok_url, facebook_url, logo_url")
    .eq("market_id", market.id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo cargar la configuración: ${error.message}`);
  if (!data) return null;

  return {
    storeName: data.store_name,
    whatsappNumber: data.whatsapp_number,
    contactEmail: data.contact_email,
    instagramUrl: data.instagram_url,
    tiktokUrl: data.tiktok_url,
    facebookUrl: data.facebook_url,
    logoUrl: data.logo_url,
  };
}
