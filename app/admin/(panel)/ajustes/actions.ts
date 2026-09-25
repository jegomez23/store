"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { parseWhatsAppNumber } from "@/lib/admin/catalog";
import { validateSettingsInput } from "@/lib/admin/content";
import { isUuid } from "@/lib/admin/products";
import {
  shippingErrorMessage,
  validateShippingMethodInput,
} from "@/lib/admin/shipping";
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
    tagline: read("tagline"),
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
      tagline: parsed.input.tagline,
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

  /*
    INCREMENTO 16: esta invalidación dejó de ser preventiva del todo.
    `store_name` y `tagline` se pintan ahora en el `<title>` de TODAS las
    páginas de la tienda, en el logo del Header, en el Footer, en el Open Graph
    de la home y de cada ficha, y en la imagen de portada (`opengraph-image`,
    que desde este incremento es ISR de 5 min y cae bajo el layout raíz).
    `revalidateStorefront()` es `revalidatePath("/", "layout")`: el martillo
    correcto, porque lo que ha cambiado es el chrome de la tienda entera.
  */
  revalidateStorefront();
  revalidatePath("/admin/ajustes");

  return { error: null, success: "Ajustes guardados." };
}

/* ─────────────────── Métodos de entrega (incremento 9) ───────────────────
 *
 * LO QUE SE ESCRIBE AQUÍ DECIDE LO QUE COBRA LA TIENDA (DEC-064). Desde DEC-063 el
 * precio y el umbral de un método entran en el total del pedido, así que una
 * errata no rompe una pantalla: cambia el importe de todas las compras
 * siguientes. De ahí que las tres reglas que importan estén ADEMÁS en la BD
 * (migración 0036) y no solo en la validación de arriba.
 *
 * `market_id` sale SIEMPRE de `getActiveMarket()` y jamás del formulario
 * (DEC-035). Comprobado contra el proyecto real: un admin ni siquiera puede
 * crear o mover un método a un mercado inactivo — RLS lo rechaza con 42501.
 *
 * ⚠️ **SÍ SE INVALIDA LA TIENDA DESDE EL INCREMENTO 19**, y el comentario que
 * había aquí —«no hace falta, `/checkout` es dinámica»— dejó de ser cierto en
 * cuanto la FICHA y el CARRITO empezaron a decir cuánto cuesta el envío. Esas
 * dos son estáticas con ISR: sin invalidar, el administrador cambiaría 4,90 €
 * por 6,90 € y el cliente seguiría leyendo 4,90 € en la ficha hasta cinco
 * minutos después, mientras `create_order` le cobraba 6,90 €. Justo la
 * contradicción que el incremento 19 venía a quitar.
 *
 * `/checkout` sigue sin necesitarlo por ser `force-dynamic`; quienes lo
 * necesitan son `/producto/[slug]` y `/carrito`.
 */

export interface ShippingActionState {
  error: string | null;
  success: string | null;
}

// TODO(i18n)
const INVALID = "Los datos enviados no son válidos.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readShippingForm(formData: FormData) {
  return validateShippingMethodInput({
    name: readString(formData, "name"),
    description: readString(formData, "description"),
    price: readString(formData, "price"),
    freeShippingThreshold: readString(formData, "freeShippingThreshold"),
    sortOrder: readString(formData, "sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
}

/** Fila lista para la BD. `market_id` lo pone quien llama, no esto. */
function toRow(input: ReturnType<typeof validateShippingMethodInput>) {
  if (!input.ok) throw new Error("toRow con input inválido");
  return {
    name: input.input.name,
    description: input.input.description,
    price: input.input.price,
    free_shipping_threshold: input.input.freeShippingThreshold,
    sort_order: input.input.sortOrder,
    is_active: input.input.isActive,
  };
}

export async function createShippingMethodAction(
  _prev: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const parsed = readShippingForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { error } = await supabase
    .from("shipping_methods")
    .insert({ ...toRow(parsed), market_id: market.id });

  if (error) {
    console.error("[admin] createShippingMethod falló", { code: error.code });
    return { error: shippingErrorMessage(error.code, GENERIC), success: null };
  }

  // La ficha y el carrito publican el coste del envío (incremento 19).
  revalidateStorefront();
  revalidatePath("/admin/ajustes");
  return { error: null, success: `Método «${parsed.input.name}» creado.` };
}

export async function updateShippingMethodAction(
  _prev: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const methodId = readString(formData, "methodId");
  if (!isUuid(methodId)) return { error: INVALID, success: null };

  const parsed = readShippingForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  // Se filtra también por mercado: un id de otro mercado afecta a 0 filas en
  // vez de escribir donde no debe. RLS ya lo impediría; esto es la primera
  // barrera y da un mensaje entendible.
  const { data, error } = await supabase
    .from("shipping_methods")
    .update(toRow(parsed))
    .eq("id", methodId)
    .eq("market_id", market.id)
    .select("id");

  if (error) {
    console.error("[admin] updateShippingMethod falló", { methodId, code: error.code });
    return { error: shippingErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) {
    return { error: "El método no existe en este mercado.", success: null };
  }

  // La ficha y el carrito publican el coste del envío (incremento 19).
  revalidateStorefront();
  revalidatePath("/admin/ajustes");
  return { error: null, success: "Método actualizado." };
}

/**
 * Elimina un método.
 *
 * BORRAR AQUÍ NO REESCRIBE NINGÚN PEDIDO, y está comprobado contra el proyecto
 * real: `orders.shipping_method_id` es `ON DELETE SET NULL` (migración 0035),
 * así que el pedido conserva su `shipping_method_name`, su `shipping_total` y
 * su `total`; solo pierde el enlace. Por eso no se bloquea el borrado como en
 * colores y tallas, donde la FK sí lo impide: allí perder la referencia rompía
 * la variante, aquí no rompe nada.
 *
 * Aun así el panel avisa de cuántos pedidos lo usaron antes de ofrecerlo:
 * borrar es correcto, pero desactivar suele ser lo que el administrador quiere.
 */
export async function deleteShippingMethodAction(
  _prev: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  const methodId = readString(formData, "methodId");
  if (!isUuid(methodId)) return { error: INVALID, success: null };

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shipping_methods")
    .delete()
    .eq("id", methodId)
    .eq("market_id", market.id)
    .select("id");

  if (error) {
    console.error("[admin] deleteShippingMethod falló", { methodId, code: error.code });
    return { error: shippingErrorMessage(error.code, GENERIC), success: null };
  }
  if (data.length === 0) {
    return { error: "El método no existe en este mercado.", success: null };
  }

  // La ficha y el carrito publican el coste del envío (incremento 19).
  revalidateStorefront();
  revalidatePath("/admin/ajustes");
  return { error: null, success: "Método eliminado. Los pedidos anteriores lo conservan." };
}

/**
 * Enciende o apaga la ayuda con IA del alta de producto (incremento 21, 0045).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ES UN INTERRUPTOR, NO UNA CONFIGURACIÓN DE PROVEEDOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Aquí NO se guarda ninguna clave de API: la del proveedor vive en el entorno
 * del servidor y no se administra desde el panel. Lo que se guarda es si Juan
 * quiere que se use, que es una decisión suya y hasta ahora solo se podía
 * tomar desplegando.
 *
 * `market_id` lo pone `getActiveMarket()`, nunca el formulario (DEC-035).
 *
 * NO se revalida el escaparate: esto no cambia ni una línea de la tienda
 * pública, que ni siquiera puede leer la columna (nace privada, 0041).
 */
export async function updateAiAssistAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  if (!(await requireAdmin())) return { error: FORBIDDEN, success: null };

  /*
    Un checkbox no envía nada cuando está desmarcado, así que el valor NO se
    lee del checkbox: se lee del botón que se ha pulsado. Así el formulario
    dice explícitamente qué quiere («activar» o «desactivar») y no hay forma de
    apagar la IA sin querer por un campo que no viajó.
  */
  const intent = formData.get("intent");
  if (intent !== "enable" && intent !== "disable") {
    return { error: INVALID, success: null };
  }
  const enabled = intent === "enable";

  const market = await getActiveMarket();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settings")
    .update({ ai_assist_enabled: enabled })
    .eq("market_id", market.id)
    .select("market_id");

  if (error) {
    console.error("[admin] updateAiAssist falló", {
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

  // Las dos pantallas que dependen del interruptor. `/admin/catalogo/nuevo` es
  // `force-dynamic`, así que esto es red de seguridad, no el mecanismo.
  revalidatePath("/admin/ajustes");
  revalidatePath("/admin/catalogo/nuevo");

  return {
    error: null,
    success: enabled
      ? "Ayuda con IA activada."
      : "Ayuda con IA desactivada. El alta de producto funciona igual.",
  };
}
