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

/**
 * LA IDENTIDAD PÚBLICA DE LA TIENDA (Incremento 15, ampliada en el 16).
 *
 * Consulta aparte y columnas explícitas a propósito: `settings` guarda también
 * cosas que el cliente no tiene por qué recibir (hoy `logo_url` y `policies`),
 * y devolver la fila entera al navegador sería mandar configuración
 * administrativa a la tienda pública (docs/rules/security.md). Desde la 0041
 * `anon` ni siquiera tiene GRANT para hacerlo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA FUNCIÓN SIRVE TAMBIÉN A LA METADATA (incremento 16)
 * ─────────────────────────────────────────────────────────────────────────
 * Antes se llamaba `getFooterSettings` porque el footer era su único
 * consumidor. Ahora la usan además `generateMetadata` del layout de `(store)`,
 * la home, la ficha de producto y la imagen de Open Graph: `store_name` y
 * `tagline` son la identidad de la tienda, no decoración del pie.
 *
 * NO añade consultas: es `cache()` de React, así que dentro de una misma
 * petición `generateMetadata` y el render del layout comparten el resultado
 * (medido en el incremento 16: la landing sigue haciendo la misma consulta que
 * antes).
 *
 * El número de WhatsApp NO está aquí: solo lo necesita el checkout, y lo pide
 * `getSettings`.
 */
export interface StorefrontSettings {
  storeName: string;
  /**
   * Frase de la tienda. `null` = la tienda NO publica descripción, y entonces
   * no se pinta ninguna: nunca se sustituye por un texto por defecto escrito
   * en el código (regla #9 de CLAUDE.md).
   */
  tagline: string | null;
  /**
   * URL PÚBLICA del logo, ya resuelta (incremento 17). `null` = la tienda no
   * tiene logo y la cabecera pinta el nombre escrito.
   *
   * En la base de datos `logo_url` guarda la RUTA dentro del bucket `content`,
   * igual que `product_images.url` guarda la suya: así el identificador del
   * proyecto de Supabase no queda escrito en las filas y mover el proyecto no
   * obliga a reescribirlas. `getPublicUrl` es una operación de cadena, sin red:
   * resolverla aquí no cuesta ninguna petición.
   */
  logoUrl: string | null;
  contactEmail: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  facebookUrl: string | null;
}

export const getStorefrontSettings = cache(
  async (market: ActiveMarket): Promise<StorefrontSettings | null> => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("settings")
      .select(
        "store_name, tagline, logo_url, contact_email, instagram_url, tiktok_url, facebook_url",
      )
      .eq("market_id", market.id)
      .maybeSingle();

    if (error) {
      // Ni el pie de página ni la metadata pueden tumbar la tienda: sin datos
      // se pinta lo mínimo, que es exactamente lo que había antes.
      console.error("[store] no se pudo cargar la identidad de la tienda", {
        marketId: market.id,
        code: error.code,
        message: error.message,
      });
      return null;
    }
    if (!data) return null;

    return {
      storeName: data.store_name,
      tagline: data.tagline,
      logoUrl: data.logo_url
        ? supabase.storage.from("content").getPublicUrl(data.logo_url).data.publicUrl
        : null,
      contactEmail: data.contact_email,
      instagramUrl: data.instagram_url,
      tiktokUrl: data.tiktok_url,
      facebookUrl: data.facebook_url,
    };
  },
);
