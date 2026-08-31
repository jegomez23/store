import { cache } from "react";
import { createClient } from "@/lib/supabase/static";
import type { ActiveMarket } from "@/lib/markets";

export interface HomeHero {
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string | null;
}

/**
 * Bloque hero de Home (docs/03-DATABASE.md §2.17). Solo `section='hero'` —
 * banner/strip_promo no se renderizan todavía en Home (Fase 2 no los usa).
 */
export const getHomeHero = cache(
  async (market: ActiveMarket): Promise<HomeHero | null> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("home_content")
      .select("title, subtitle, cta_label, cta_href, image_url")
      .eq("market_id", market.id)
      .eq("section", "hero")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo cargar el contenido de Home: ${error.message}`);
    }

    if (!data) return null;

    return {
      title: data.title,
      subtitle: data.subtitle,
      ctaLabel: data.cta_label,
      ctaHref: data.cta_href,
      imageUrl: data.image_url,
    };
  },
);
