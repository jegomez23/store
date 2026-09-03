import { cache } from "react";
import { createClient } from "@/lib/supabase/static";
import type { ActiveMarket } from "@/lib/markets";

export interface CatalogCategory {
  slug: string;
  name: string;
  imageUrl: string | null;
}

/** Categorías raíz activas del mercado (docs/rules/backend.md #5-7). */
export const getCategories = cache(
  async (market: ActiveMarket): Promise<CatalogCategory[]> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("categories")
      .select("slug, name, image_url")
      .eq("market_id", market.id)
      .is("parent_id", null)
      // `is_active` y `deleted_at` ya los filtra la policy
      // `public_read_active_categories` (migración 0005), pero se repiten aquí
      // a propósito: es la misma defensa en profundidad que aplica
      // `lib/data/products.ts`, y deja el filtro visible en el código en vez de
      // depender de que nadie relaje la policy algún día.
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
    }));
  },
);
