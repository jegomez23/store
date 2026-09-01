import { cache } from "react";
import { createClient } from "@/lib/supabase/static";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Configuración comercial del mercado activo (docs/03-DATABASE.md §2.16).
 *
 * Es la ÚNICA fuente del número de WhatsApp: prohibido hardcodearlo en
 * componentes o variables de entorno (KNOWN-CONSTRAINTS, docs/rules/backend.md #15).
 */

export interface StoreSettings {
  storeName: string;
  /** Tal cual está en BD (E.164 sin '+'); normalizar con `lib/whatsapp/phone`. */
  whatsappNumber: string;
  contactEmail: string | null;
}

export const getSettings = cache(
  async (market: ActiveMarket): Promise<StoreSettings | null> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("settings")
      .select("store_name, whatsapp_number, contact_email")
      .eq("market_id", market.id)
      .maybeSingle();

    if (error) {
      throw new Error(
        `No se pudo cargar la configuración de la tienda: ${error.message}`,
      );
    }

    if (!data) return null;

    return {
      storeName: data.store_name,
      whatsappNumber: data.whatsapp_number,
      contactEmail: data.contact_email,
    };
  },
);
