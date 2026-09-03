"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { parseWhatsAppNumber } from "@/lib/admin/catalog";
import { validateSettingsInput } from "@/lib/admin/content";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";

/**
 * Ajustes del mercado activo (Fase 7).
 *
 * Cubre el criterio de aceptación del roadmap "ajustes cambian WhatsApp sin
 * deploy": el número vive en `settings` y es la ÚNICA fuente
 * (docs/rules/backend.md #15, KNOWN-CONSTRAINTS). Cambiarlo aquí cambia el
 * enlace `wa.me` del checkout sin tocar código.
 *
 * `moneda` y `locale` NO se editan desde el panel: viven en `markets` y
 * cambiarlos es una operación deliberada fuera de banda (docs/05-ADMIN.md §4.6).
 */

export interface SettingsActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const GENERIC = "No se pudo guardar la configuración. Inténtalo de nuevo.";

export async function updateWhatsAppNumberAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const raw = formData.get("whatsappNumber");
  if (typeof raw !== "string" || raw.length > 40) {
    return { error: "Número no válido.", success: null };
  }

  const parsed = parseWhatsAppNumber(raw);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // Solo esta columna, y filtrando por el mercado activo: `market_id` es la PK
  // de `settings` y nunca se envía en el payload.
  const { data, error } = await supabase
    .from("settings")
    .update({ whatsapp_number: parsed.value })
    .eq("market_id", market.id)
    .select("market_id");

  if (error) {
    console.error("[admin] updateWhatsAppNumber falló", {
      marketId: market.id,
      code: error.code,
      message: error.message,
    });
    return { error: GENERIC, success: null };
  }
  if (data.length === 0) {
    return {
      error: "Este mercado todavía no tiene configuración creada.",
      success: null,
    };
  }

  // CORRECCIÓN DE FASE 9: aquí ponía que "el número se lee en el checkout".
  // Medido sobre el build servido: el número **no aparece en ningún HTML**.
  // `getCheckoutChannel()` lo lee dentro de la Server Action del checkout, y
  // las Server Actions no se cachean — así que un cambio de número surte
  // efecto en el pedido siguiente sin depender de ninguna invalidación.
  // La llamada se mantiene como red de seguridad por si algún día la página
  // llegara a pintarlo, pero NO es lo que hace que el cambio funcione.
  revalidatePath("/checkout");
  revalidatePath("/admin/ajustes");

  return { error: null, success: `Número actualizado a ${parsed.value}.` };
}

/**
 * Resto de ajustes del mercado activo (Fase 8): nombre de tienda, email de
 * contacto y redes.
 *
 * El número de WhatsApp NO se toca aquí: sigue teniendo un único camino de
 * escritura (`updateWhatsAppNumberAction`) y una única fuente de verdad
 * (`settings.whatsapp_number`), como exige `rules/backend.md` #15.
 *
 * `logo_url` tampoco: subir el logo usaría el bucket `content` y eso queda
 * fuera del alcance acordado de esta fase.
 */
export async function updateStoreSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  const parsed = validateSettingsInput({
    storeName: read("storeName"),
    contactEmail: read("contactEmail"),
    instagramUrl: read("instagramUrl"),
    tiktokUrl: read("tiktokUrl"),
    facebookUrl: read("facebookUrl"),
  });
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // Columnas concretas y filtro por mercado. `market_id` es la PK de `settings`
  // y nunca viaja en el payload.
  const { data, error } = await supabase
    .from("settings")
    .update({
      store_name: parsed.input.storeName,
      contact_email: parsed.input.contactEmail,
      instagram_url: parsed.input.instagramUrl,
      tiktok_url: parsed.input.tiktokUrl,
      facebook_url: parsed.input.facebookUrl,
    })
    .eq("market_id", market.id)
    .select("market_id");

  if (error) {
    console.error("[admin] updateStoreSettings falló", {
      marketId: market.id,
      code: error.code,
      message: error.message,
    });
    return { error: GENERIC, success: null };
  }
  if (data.length === 0) {
    return { error: "Este mercado todavía no tiene configuración creada.", success: null };
  }

  // Corrección de Fase 9: el Footer y el logo del Header son texto FIJO, así
  // que hoy `store_name`, `contact_email` y las redes no se pintan en ninguna
  // página pública. Se invalida igualmente para que el día que el Footer los
  // lea no aparezca un desfase silencioso de hasta 5 minutos.
  revalidateStorefront();
  revalidatePath("/admin/ajustes");

  return { error: null, success: "Ajustes guardados." };
}
