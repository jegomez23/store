import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { isProductStatus, type ProductStatus } from "@/lib/admin/catalog";
import {
  CHANGE_FIELDS,
  CHANGE_SOURCES,
  type ChangeEntry,
  type ChangeField,
  type ChangeSource,
} from "@/lib/admin/timeline";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Capa de datos administrativa del catálogo y los ajustes (DEC-034).
 *
 * Cliente autenticado con la anon key + sesión: RLS decide qué filas ve el
 * admin. **Sin service role key.** Todas las lecturas y escrituras filtran por
 * `market_id`: el panel nunca mezcla ES y CO (DEC-008).
 *
 * Igual que en `orders.ts`, cada función lleva su propio `requireAdmin()`: el
 * guard del layout no impide que la página hermana se renderice en RSC (ver la
 * explicación completa en `lib/data/admin/orders.ts`).
 */

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

export interface AdminVariant {
  id: string;
  /** Testigo del bloqueo optimista de la correccion absoluta (Fase 9.5). */
  updatedAt: string;
  sku: string;
  colorName: string | null;
  sizeLabel: string | null;
  price: number;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  isFeatured: boolean;
  categoryName: string | null;
  variants: AdminVariant[];
}

export interface ProductListFilters {
  /** Búsqueda por nombre o slug, ya normalizada. */
  query?: string | null;
  status?: ProductStatus | null;
  /** 1-indexada. Sin paginar, el listado descargaba el catálogo entero. */
  page?: number;
}

export interface AdminProductListResult {
  products: AdminProduct[];
  /** Total que casa con el filtro, no los de esta página. */
  count: number;
}

/** Misma densidad que el listado de pedidos: 20 filas por página. */
export const CATALOG_PAGE_SIZE = 20;

/**
 * Limpia el término de búsqueda: se quitan los caracteres que cambiarían el
 * significado del patrón `ilike` de PostgREST (`%`, `_`, `,`, `*`).
 */
export function normalizeCatalogQuery(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[%_,*()]/g, "").slice(0, 60);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Listado paginado del catálogo (Fase 9.5).
 *
 * ANTES: sin `limit` ni `range`. Traía TODOS los productos vivos del mercado,
 * cada uno con todas sus variantes y sus embeds de color y talla. Con 300
 * productos de 8 variantes son ~2.400 filas embebidas en cada carga, y el
 * listado solo pinta un resumen de cada producto: casi todo lo que viajaba no
 * se usaba.
 *
 * AHORA: `range()` + `count: "exact"`, el mismo patrón que `listOrders` ya
 * usaba desde la Fase 7. El desglose completo de variantes sigue estando en la
 * ficha del producto, que es donde se necesita.
 */
export async function listProductsForAdmin(
  market: ActiveMarket,
  filters: ProductListFilters = {},
): Promise<AdminProductListResult> {
  if (!(await requireAdmin())) return { products: [], count: 0 };

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const from = (page - 1) * CATALOG_PAGE_SIZE;

  const supabase = await createClient();

  let builder = supabase
    .from("products")
    .select(
      `id, name, slug, status, is_featured,
       category:categories(name),
       product_variants(id, sku, price, stock, low_stock_threshold, is_active, updated_at,
                        color:colors(name), size:sizes(label))`,
      { count: "exact" },
    )
    .eq("market_id", market.id)
    // Los borrados lógicos no se listan: el panel no los restaura.
    .is("deleted_at", null);

  if (filters.status) builder = builder.eq("status", filters.status);
  if (filters.query) {
    builder = builder.or(`name.ilike.%${filters.query}%,slug.ilike.%${filters.query}%`);
  }

  const { data, error, count } = await builder
    .order("name")
    .range(from, from + CATALOG_PAGE_SIZE - 1);

  if (error) {
    throw new Error(`No se pudo cargar el catálogo: ${error.message}`);
  }

  const products = (data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: isProductStatus(product.status) ? product.status : "draft",
    isFeatured: product.is_featured,
    categoryName: product.category?.name ?? null,
    variants: product.product_variants
      .map((variant) => ({
        id: variant.id,
        updatedAt: variant.updated_at,
        sku: variant.sku,
        colorName: variant.color?.name ?? null,
        sizeLabel: variant.size?.label ?? null,
        price: toNumber(variant.price),
        stock: variant.stock,
        lowStockThreshold: variant.low_stock_threshold,
        isActive: variant.is_active,
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  }));

  return { products, count: count ?? 0 };
}

/**
 * Comprueba que una variante pertenece al mercado activo ANTES de dejar que una
 * action la modifique. Sin esto, un `variantId` de otro mercado enviado a mano
 * pasaría (RLS de admin no filtra por mercado — un admin puede verlo todo).
 */
export async function variantBelongsToMarket(
  market: ActiveMarket,
  variantId: string,
): Promise<boolean> {
  if (!(await requireAdmin())) return false;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product:products!inner(market_id)")
    .eq("id", variantId)
    .eq("product.market_id", market.id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo verificar la variante: ${error.message}`);
  }
  return data !== null;
}

export interface AdminSettings {
  storeName: string;
  whatsappNumber: string;
  contactEmail: string | null;
}

export async function getSettingsForAdmin(
  market: ActiveMarket,
): Promise<AdminSettings | null> {
  if (!(await requireAdmin())) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settings")
    .select("store_name, whatsapp_number, contact_email")
    .eq("market_id", market.id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la configuración: ${error.message}`);
  }
  if (!data) return null;

  return {
    storeName: data.store_name,
    whatsappNumber: data.whatsapp_number,
    contactEmail: data.contact_email,
  };
}

export interface LowStockVariant {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  colorName: string | null;
  sizeLabel: string | null;
  stock: number;
  lowStockThreshold: number;
}

/**
 * Variantes en su umbral o por debajo (Fase 9.5).
 *
 * ANTES: llamaba a `listProductsForAdmin()` —es decir, **descargaba el catálogo
 * entero con todas sus variantes**— y filtraba en memoria, para pintar diez
 * líneas en el dashboard. Heredaba el problema del listado y lo empeoraba.
 *
 * AHORA: consulta propia sobre `product_variants`, con el filtro
 * `stock <= low_stock_threshold` resuelto en PostgreSQL, orden por stock
 * ascendente y `limit` explícito. El TOTAL de variantes afectadas viene de
 * `admin_operations_summary`, así que se puede decir "10 de 34" sin traer 34.
 *
 * El `!inner` en el join es lo que permite filtrar por el mercado y el estado
 * del producto padre sin traerse los productos que no cumplen.
 */
export async function listLowStockVariants(
  market: ActiveMarket,
  limit = 10,
): Promise<LowStockVariant[]> {
  if (!(await requireAdmin())) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      `id, sku, stock, low_stock_threshold,
       color:colors(name), size:sizes(label),
       product:products!inner(id, name, market_id, status, deleted_at)`,
    )
    .eq("product.market_id", market.id)
    .eq("product.status", "active")
    .is("product.deleted_at", null)
    .eq("is_active", true)
    // `is_low_stock` es una columna GENERADA (migración 0024): PostgreSQL
    // evalúa `stock <= low_stock_threshold`, que PostgREST no sabe expresar.
    // Ni una fila de más cruza la red.
    .eq("is_low_stock", true)
    .order("stock", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`No se pudo cargar el stock bajo: ${error.message}`);
  }

  return (data ?? []).map((v) => ({
      variantId: v.id,
      productId: v.product.id,
      sku: v.sku,
      productName: v.product.name,
      colorName: v.color?.name ?? null,
      sizeLabel: v.size?.label ?? null,
      stock: v.stock,
      lowStockThreshold: v.low_stock_threshold,
    }));
}

/** Los dos motivos por los que un producto publicado no se puede comprar. */
export type UnsellableReason = "sin_variante_activa" | "agotado";

export interface UnsellableProduct {
  id: string;
  name: string;
  slug: string;
  reason: UnsellableReason;
}

/**
 * Los productos que cuenta `unsellable_products` en el resumen (Fase 9.5, 5B).
 *
 * ANTES la alerta decía "3 productos están publicados sin stock" y enlazaba a
 * `/admin/catalogo?estado=active`, es decir, a la lista de TODOS los activos.
 * Con cuarenta productos, el aviso dejaba al administrador delante de cuarenta
 * filas sin marcar cuáles eran las tres: le obligaba a repetir a mano el
 * trabajo que el resumen ya había hecho en SQL.
 *
 * AHORA lo resuelve `admin_unsellable_products` (migración 0029), que usa
 * EXACTAMENTE el mismo predicado que los contó —`product_is_sellable`— para
 * que la lista y el número no puedan discrepar. PostgREST no sabe expresar un
 * `NOT EXISTS`, así que la función SQL no es un capricho: es la única forma de
 * resolverlo sin traerse el catálogo entero y filtrar en JavaScript.
 *
 * Separa además los dos motivos, porque se arreglan de forma distinta:
 * `sin_variante_activa` da 404 y `agotado` se muestra como "Agotado".
 */
export async function listUnsellableProducts(
  market: ActiveMarket,
  limit = 50,
): Promise<UnsellableProduct[]> {
  if (!(await requireAdmin())) return [];

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_unsellable_products", {
    p_market_id: market.id,
    p_limit: limit,
  });

  if (error) {
    console.error("[admin] admin_unsellable_products falló", {
      marketId: market.id,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    reason: row.reason === "sin_variante_activa" ? "sin_variante_activa" : "agotado",
  }));
}

/**
 * Historial de decisiones sobre un producto (Fase 9.5, 5C, migración 0032).
 *
 * PATRÓN DE ACCESO, y es el único: "las últimas N decisiones de ESTE producto".
 * Se apoya en `idx_admin_change_log_product (product_id, created_at desc)`, que
 * sirve al filtro y al orden a la vez. Medido con 30.000 registros: Index Scan
 * con 5 buffers y 0,17 ms; sin el índice, Seq Scan de 30.000 filas más un
 * top-N heapsort, 406 buffers y 4,09 ms.
 *
 * NO es un libro mayor de stock: las ventas no aparecen —`auth.uid()` es NULL
 * en el checkout— y las cancelaciones tampoco, porque `order_events` ya las
 * cubre. La interfaz lo llama "Historial de cambios", no "movimientos".
 *
 * El mercado no se filtra aquí porque no se guarda: se deriva del producto, y
 * quien llama ya lo ha resuelto contra el mercado activo.
 */
export async function listProductChanges(
  productId: string,
  limit = 20,
): Promise<ChangeEntry[]> {
  if (!(await requireAdmin())) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_change_log")
    .select(
      "id, field_name, old_value, new_value, source, sku, created_at, author:profiles(full_name)",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`No se pudo cargar el historial: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    // El CHECK de la tabla ya garantiza los valores; esto estrecha el tipo sin
    // un `as`, y descarta la fila si algún día se añadiera un campo nuevo.
    if (!isChangeField(row.field_name) || !isChangeSource(row.source)) return [];
    return [
      {
        id: row.id,
        field: row.field_name,
        oldValue: row.old_value,
        newValue: row.new_value,
        source: row.source,
        sku: row.sku,
        authorName: row.author?.full_name ?? null,
        createdAt: row.created_at,
      },
    ];
  });
}

function isChangeField(value: string): value is ChangeField {
  return (CHANGE_FIELDS as readonly string[]).includes(value);
}

function isChangeSource(value: string): value is ChangeSource {
  return (CHANGE_SOURCES as readonly string[]).includes(value);
}
