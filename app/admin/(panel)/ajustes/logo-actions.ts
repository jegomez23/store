"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { discardLogoObject, uploadLogo } from "@/lib/storage/logo";
import { getActiveMarket } from "@/lib/markets";
import { createClient } from "@/lib/supabase/server";
import type { SettingsActionState } from "./actions";

/**
 * Logo de la tienda (incremento 17).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STORAGE Y POSTGRESQL NO COMPARTEN TRANSACCIÓN. EL ORDEN ES LA GARANTÍA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sustituir un logo toca dos sistemas que no se pueden confirmar a la vez. El
 * orden elegido es el que hace que **el fallo posible sea el barato**:
 *
 *   1. Subir el objeto NUEVO (uuid nuevo, no sobrescribe nada).
 *   2. Escribir `settings.logo_url` apuntando al nuevo.
 *   3. Borrar el objeto ANTERIOR, best-effort.
 *
 * · Si (2) falla → se descarta el objeto nuevo y **el logo anterior sigue
 *   funcionando**. La tienda no se queda sin logo por un error de escritura.
 * · Si (3) falla → queda un objeto sin dueño. Molesto, inofensivo, y el logo
 *   correcto ya está publicado.
 *
 * El orden contrario —borrar primero— tendría el fallo caro: una ventana en la
 * que `logo_url` apunta a un objeto que ya no existe, es decir, la tienda
 * entera con la imagen rota.
 *
 * ⚠️ **VENTANA DE FALLO QUE NO SE PUEDE CERRAR, y no se disimula:** si el
 * proceso muere entre (2) y (3), el objeto viejo se queda huérfano para
 * siempre. No hay transacción entre Storage y PostgreSQL, y fingir una con un
 * `try/finally` no la crearía. Se documenta como riesgo residual —igual que en
 * las imágenes de catálogo (DEC-036)— en vez de taparse. El coste real es de
 * kilobytes, y solo lo paga una sustitución interrumpida.
 *
 * NADA DE `service_role`: escribe la sesión del admin y autoriza la policy
 * `admin_write_content_bucket` (migración 0015).
 */

// TODO(i18n)
const FORBIDDEN = "No tienes permisos para hacer esto.";
const GENERIC = "No se pudo guardar el logo. Inténtalo de nuevo.";
const NO_SETTINGS = "Este mercado todavía no tiene configuración creada.";

/**
 * Escribe `logo_url` y devuelve el valor ANTERIOR, en una sola ida y vuelta.
 *
 * `select("logo_url")` sobre un UPDATE de PostgREST devuelve la fila **ya
 * actualizada**, no la de antes, así que el valor anterior se lee aparte. Es
 * una consulta más, y es la que permite borrar el objeto viejo: sin ella cada
 * sustitución dejaría un huérfano garantizado, no solo ante un fallo.
 */
async function writeLogoUrl(
  marketId: string,
  value: string | null,
): Promise<{ ok: true; previous: string | null } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: before, error: readError } = await supabase
    .from("settings")
    .select("logo_url")
    .eq("market_id", marketId)
    .maybeSingle();

  if (readError) {
    console.error("[admin] no se pudo leer el logo anterior", {
      marketId,
      code: readError.code,
      message: readError.message,
    });
    return { ok: false, error: GENERIC };
  }
  if (!before) return { ok: false, error: NO_SETTINGS };

  // Solo esta columna, y filtrando por el mercado activo: `market_id` es la PK
  // de `settings` y nunca viaja en el payload (DEC-035).
  const { data, error } = await supabase
    .from("settings")
    .update({ logo_url: value })
    .eq("market_id", marketId)
    .select("market_id");

  if (error) {
    console.error("[admin] no se pudo escribir logo_url", {
      marketId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: GENERIC };
  }
  if (data.length === 0) return { ok: false, error: NO_SETTINGS };

  return { ok: true, previous: before.logo_url };
}

/**
 * El logo entra en el chrome de TODAS las páginas (cabecera) y en la tarjeta de
 * Open Graph, así que se invalida la tienda entera. Es el mismo alcance que el
 * nombre y la frase (DEC-071): lo que cambia no es una ficha, es la marca.
 */
function revalidateAfterLogoChange(): void {
  revalidateStorefront();
  revalidatePath("/admin/ajustes");
}

export async function updateLogoAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elige una imagen para subirla.", success: null };
  }

  const market = await getActiveMarket();

  // 1. Objeto nuevo.
  const uploaded = await uploadLogo(file, market.id);
  if (!uploaded.ok) return { error: uploaded.error, success: null };

  // 2. Referencia en la base de datos.
  const written = await writeLogoUrl(market.id, uploaded.path);
  if (!written.ok) {
    // El logo ANTERIOR sigue publicado y funcionando: se tira el nuevo.
    await discardLogoObject(uploaded.path, market.id);
    return { error: written.error, success: null };
  }

  // 3. El anterior ya no lo referencia nadie.
  if (written.previous && written.previous !== uploaded.path) {
    await discardLogoObject(written.previous, market.id);
  }

  revalidateAfterLogoChange();

  const kb = Math.max(1, Math.round(uploaded.bytes / 1024));
  return {
    error: null,
    // TODO(i18n)
    success: `Logo actualizado (${uploaded.width}×${uploaded.height}, ${kb} KB).`,
  };
}

/**
 * Quita el logo y vuelve al nombre escrito.
 *
 * No es una floritura: sin esto, subir el archivo equivocado deja la tienda con
 * él puesto y sin salida desde el panel. Aquí el orden se invierte a propósito
 * —primero la fila, después el objeto—, porque el estado final deseado es «sin
 * logo»: si el borrado del objeto falla, el resultado visible ya es correcto.
 */
/*
  SIN PARÁMETROS a propósito. `useActionState` los pasa —estado anterior y
  FormData—, pero quitar el logo no lleva datos de formulario ni depende del
  estado previo, y una función de aridad menor es asignable a esa firma. Así no
  hay argumentos ignorados que silenciar con un `eslint-disable`.
*/
export async function removeLogoAction(): Promise<SettingsActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const market = await getActiveMarket();

  const written = await writeLogoUrl(market.id, null);
  if (!written.ok) return { error: written.error, success: null };

  if (written.previous) {
    await discardLogoObject(written.previous, market.id);
  }

  revalidateAfterLogoChange();
  // TODO(i18n)
  return { error: null, success: "Logo quitado. La tienda vuelve a usar el nombre." };
}
