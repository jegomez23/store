import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  INVENTORY_PAGE_SIZE,
  type InventoryFilter,
} from "@/lib/admin/inventory";
import { normalizeCatalogQuery } from "@/lib/data/admin/catalog";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Inventario transversal (Fase 9.5, Incremento 4).
 *
 * Hasta ahora el stock solo existía troceado dentro de cada ficha de producto:
 * reponer lo recibido obligaba a navegar catálogo → producto → variante, por
 * cada producto. Esta consulta lo pone todo junto.
 *
 * Paginada y filtrada en PostgreSQL desde el primer día (DEC-043): nada de
 * traerse el catálogo para filtrar en memoria.
 *
 * QUÉ INCLUYE: variantes de productos no borrados, **sea cual sea el estado del
 * producto**. Un borrador también se repone: se prepara el stock antes de
 * publicarlo.
 */

export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  productStatus: string;
  sku: string;
  colorName: string | null;
  sizeLabel: string | null;
  stock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isActive: boolean;
  price: number;
  /** Testigo para la corrección absoluta con bloqueo optimista. */
  updatedAt: string;
}

export interface InventoryResult {
  rows: InventoryRow[];
  count: number;
}

export interface InventoryParams {
  filter: InventoryFilter;
  query: string | null;
  page: number;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

export async function listInventory(
  market: ActiveMarket,
  params: InventoryParams,
): Promise<InventoryResult> {
  if (!(await requireAdmin())) return { rows: [], count: 0 };

  const supabase = await createClient();
  const from = (params.page - 1) * INVENTORY_PAGE_SIZE;

  let builder = supabase
    .from("product_variants")
    .select(
      `id, sku, stock, low_stock_threshold, is_low_stock, is_active, price, updated_at,
       color:colors(name), size:sizes(label),
       product:products!inner(id, name, status, market_id, deleted_at)`,
      { count: "exact" },
    )
    .eq("product.market_id", market.id)
    .is("product.deleted_at", null);

  // `is_low_stock` es columna GENERADA (migración 0024): PostgreSQL evalúa
  // `stock <= low_stock_threshold`, que PostgREST no sabe expresar.
  if (params.filter === "bajo") builder = builder.eq("is_low_stock", true);
  if (params.filter === "agotadas") builder = builder.eq("stock", 0);

  if (params.query) {
    // Busca por SKU o por nombre del producto. `normalizeCatalogQuery` ya quitó
    // los caracteres que cambiarían el significado del patrón `ilike`.
    builder = builder.or(
      `sku.ilike.%${params.query}%,product.name.ilike.%${params.query}%`,
    );
  }

  const { data, error, count } = await builder
    // Lo que menos stock tiene, primero: es lo que hay que reponer antes.
    .order("stock", { ascending: true })
    .order("sku", { ascending: true })
    .range(from, from + INVENTORY_PAGE_SIZE - 1);

  if (error) {
    throw new Error(`No se pudo cargar el inventario: ${error.message}`);
  }

  return {
    count: count ?? 0,
    rows: (data ?? []).map((v) => ({
      variantId: v.id,
      productId: v.product.id,
      productName: v.product.name,
      productStatus: v.product.status,
      sku: v.sku,
      colorName: v.color?.name ?? null,
      sizeLabel: v.size?.label ?? null,
      stock: v.stock,
      lowStockThreshold: v.low_stock_threshold,
      isLowStock: v.is_low_stock === true,
      isActive: v.is_active,
      price: toNumber(v.price),
      updatedAt: v.updated_at,
    })),
  };
}

export { normalizeCatalogQuery };
