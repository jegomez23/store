import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  INVENTORY_PAGE_SIZE,
  type InventoryFilter,
} from "@/lib/admin/inventory";
import { normalizeCatalogQuery } from "@/lib/data/admin/catalog";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Inventario agrupado por PRODUCTO (Incremento 12).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ POR PRODUCTO Y NO POR VARIANTE SUELTA
 * ─────────────────────────────────────────────────────────────────────────
 * La información externa llega agrupada —"negra M 4, negra L 0, blanca M 7"—
 * y hasta el incremento 12 esta pantalla listaba variantes planas, así que el
 * mismo producto aparecía tres veces y el administrador tenía que reconstruir
 * la agrupación a ojo. Se pagina por PRODUCTO para que un producto no pueda
 * partirse entre dos páginas: un grupo partido es un lote partido.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BÚSQUEDA VA EN DOS CONSULTAS, Y NO POR GUSTO
 * ─────────────────────────────────────────────────────────────────────────
 * La versión anterior metía una columna EMBEBIDA dentro de un `or`:
 *
 *     or=(sku.ilike.*x*,product.name.ilike.*x*)
 *     → 400 PGRST100 · failed to parse logic tree
 *
 * Reproducido contra el proyecto real y VISTO en el navegador: CUALQUIER
 * búsqueda en /admin/inventario —también por SKU— caía en la pantalla "Algo ha
 * fallado". Es el mismo límite de PostgREST que P3 ya midió para los pedidos,
 * y la solución es la misma: resolver primero los ids con una consulta y
 * usarlos después con `in.()`, que sí son columnas reales.
 *
 * Paginación y filtrado siguen en PostgreSQL (DEC-043): aquí no se descarga
 * nada para filtrarlo en memoria.
 */

export interface InventoryVariant {
  variantId: string;
  sku: string;
  /** Referencia del proveedor para esta variante (incremento 13). */
  supplierRef: string | null;
  colorName: string | null;
  sizeLabel: string | null;
  stock: number;
  isLowStock: boolean;
  isActive: boolean;
  /** Testigo del bloqueo optimista: viaja al formulario y vuelve. */
  updatedAt: string;
}

export interface InventoryProduct {
  productId: string;
  productName: string;
  productStatus: string;
  slug: string;
  /** De dónde viene el artículo (incremento 13). */
  supplier: string | null;
  variants: InventoryVariant[];
}

export interface InventoryResult {
  products: InventoryProduct[];
  /** Productos que cumplen el filtro, no variantes. */
  count: number;
}

export interface InventoryParams {
  filter: InventoryFilter;
  query: string | null;
  page: number;
}

/**
 * Ids de los productos con alguna variante cuyo SKU **o referencia externa**
 * coincide.
 *
 * Es la primera de las dos consultas de la búsqueda, y desde el incremento 13
 * mira también `supplier_ref`: al administrador le llega «Proveedor A ·
 * ABC-123» y eso es lo que teclea. El `or` es entre columnas REALES de
 * `product_variants`, no embebidas, así que PostgREST sí lo admite.
 *
 * Sigue siendo UNA consulta: buscar por referencia no añade ni un viaje.
 */
async function productIdsByVariantMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  marketId: string,
  query: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("product_id, products!inner(market_id, deleted_at)")
    .or(`sku.ilike.%${query}%,supplier_ref.ilike.%${query}%`)
    .eq("products.market_id", marketId)
    .is("products.deleted_at", null)
    .limit(200);

  if (error) {
    throw new Error(`No se pudo buscar por SKU o referencia: ${error.message}`);
  }
  return [...new Set((data ?? []).map((row) => row.product_id))];
}

export async function listInventory(
  market: ActiveMarket,
  params: InventoryParams,
): Promise<InventoryResult> {
  if (!(await requireAdmin())) return { products: [], count: 0 };

  const supabase = await createClient();
  const from = (params.page - 1) * INVENTORY_PAGE_SIZE;

  let builder = supabase
    .from("products")
    .select(
      `id, name, slug, status, supplier,
       product_variants!inner(id, sku, supplier_ref, stock, is_low_stock, is_active, updated_at,
                              color:colors(name, sort_order),
                              size:sizes(label, sort_order))`,
      { count: "exact" },
    )
    .eq("market_id", market.id)
    // Un producto borrado no se repone: ya no existe para el panel.
    .is("deleted_at", null);

  /*
    Con `!inner`, un filtro sobre la tabla embebida acota DOS cosas a la vez:
    qué productos salen (los que tienen al menos una variante que cumple) y
    qué variantes se pintan dentro de cada uno. Es justo lo que quiere la
    vista "Agotadas": enseñar solo lo agotado, no el producto entero.

    `is_low_stock` es columna GENERADA (0024): PostgreSQL evalúa
    `stock <= low_stock_threshold`, que PostgREST no sabría expresar.
  */
  if (params.filter === "bajo") builder = builder.eq("product_variants.is_low_stock", true);
  if (params.filter === "agotadas") builder = builder.eq("product_variants.stock", 0);

  if (params.query) {
    const ids = await productIdsByVariantMatch(supabase, market.id, params.query);
    // `normalizeCatalogQuery` ya quitó los caracteres que cambiarían el
    // significado del patrón `ilike`. `supplier` es columna de `products`, así
    // que va en el mismo `or` sin coste añadido.
    const clauses = [
      `name.ilike.%${params.query}%`,
      `slug.ilike.%${params.query}%`,
      `supplier.ilike.%${params.query}%`,
    ];
    if (ids.length > 0) clauses.push(`id.in.(${ids.join(",")})`);
    builder = builder.or(clauses.join(","));
  }

  const { data, error, count } = await builder
    .order("name")
    .range(from, from + INVENTORY_PAGE_SIZE - 1);

  if (error) {
    throw new Error(`No se pudo cargar el inventario: ${error.message}`);
  }

  const products = (data ?? []).map((product) => ({
    productId: product.id,
    productName: product.name,
    productStatus: product.status,
    slug: product.slug,
    supplier: product.supplier,
    /*
      Orden estable y con sentido humano: primero el color tal y como está
      ordenado en /admin/atributos, luego la talla por su `sort_order` (S, M,
      L… no alfabético), y el SKU como desempate para que dos variantes
      idénticas en color y talla no bailen entre recargas.
    */
    variants: [...product.product_variants]
      .sort(
        (a, b) =>
          (a.color?.sort_order ?? 0) - (b.color?.sort_order ?? 0) ||
          (a.color?.name ?? "").localeCompare(b.color?.name ?? "") ||
          (a.size?.sort_order ?? 0) - (b.size?.sort_order ?? 0) ||
          a.sku.localeCompare(b.sku),
      )
      .map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        supplierRef: variant.supplier_ref,
        colorName: variant.color?.name ?? null,
        sizeLabel: variant.size?.label ?? null,
        stock: variant.stock,
        isLowStock: variant.is_low_stock === true,
        isActive: variant.is_active,
        updatedAt: variant.updated_at,
      })),
  }));

  return { products, count: count ?? 0 };
}

export { normalizeCatalogQuery };
