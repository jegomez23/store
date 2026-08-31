import { cache } from "react";
import { createClient } from "@/lib/supabase/static";

/**
 * Resolución del mercado activo (docs/07-MULTI-MARKET.md §4): se define por
 * NEXT_PUBLIC_MARKET y se valida contra la tabla `markets`. `cache()` la
 * deduplica dentro de la misma request (llamada desde layout + page).
 */

export interface ActiveMarket {
  id: string;
  name: string;
  currencyCode: string;
  locale: string;
}

const FALLBACK_MARKET_ID = "ES";

export class MarketResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketResolutionError";
  }
}

export const getActiveMarket = cache(async (): Promise<ActiveMarket> => {
  const marketId = process.env.NEXT_PUBLIC_MARKET || FALLBACK_MARKET_ID;
  const supabase = createClient();

  const { data, error } = await supabase
    .from("markets")
    .select("id, name, currency_code, locale")
    .eq("id", marketId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new MarketResolutionError(
      `No se pudo resolver el mercado activo (${marketId}): ${error.message}`,
    );
  }

  if (!data) {
    throw new MarketResolutionError(
      `El mercado "${marketId}" no existe o no está activo.`,
    );
  }

  return {
    id: data.id,
    name: data.name,
    currencyCode: data.currency_code,
    locale: data.locale,
  };
});
