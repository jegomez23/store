"use server";

import { headers } from "next/headers";
import { looksLikeEmail } from "@/lib/admin/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Solicitud de recuperación de contraseña (incremento 18).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA RECUPERACIÓN ES DE SUPABASE AUTH. AQUÍ NO SE INVENTA NINGUNA
 * ═══════════════════════════════════════════════════════════════════════════
 * No se generan tokens propios, no se guardan en ninguna tabla, no se toca
 * `profiles` y **no se usa la service role key**. Todo lo que hace esta action
 * es pedirle a Supabase que mande su email: quien emite, valida y caduca el
 * token es Supabase.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPUESTA IDÉNTICA EXISTA O NO LA CUENTA
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIDO contra el proyecto real: `POST /auth/v1/recover` con un email que no
 * existe devuelve **200 y cuerpo vacío**, igual que con uno que sí. Supabase ya
 * no enumera, y esta action tampoco puede hacerlo por su cuenta:
 *
 *   · Un email con formato inválido → mismo mensaje de éxito. Decir «formato
 *     inválido» no filtraría nada, pero sí enseña al que prueba en qué punto
 *     está fallando; con un solo mensaje no hay señal que leer.
 *   · Un error de Supabase → mismo mensaje de éxito, y el detalle al log.
 *     Incluido el límite de envío: distinguir «te lo he mandado» de «ya has
 *     pedido demasiados» diría que la cuenta existe.
 *
 * Por eso esta función **siempre devuelve `sent: true`**. No es pereza: es la
 * propiedad que se quiere, y hay un test que falla si alguna rama deja de
 * cumplirla.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROTECCIÓN CONTRA ABUSO: LA PONE SUPABASE, Y ESTÁ MEDIDA
 * ═══════════════════════════════════════════════════════════════════════════
 * Durante la auditoría de este incremento el propio proyecto respondió
 * `429 · over_email_send_rate_limit`. No se añade aquí un contador propio:
 * sería un segundo límite peor —en memoria de un proceso, sin coordinación
 * entre instancias— delante del que ya funciona en el servicio que manda los
 * correos.
 */

export interface RecoverState {
  /** `true` cuando ya se ha procesado la solicitud. Siempre acaba en `true`. */
  sent: boolean;
  /** Solo para errores de FORMA del formulario, nunca sobre la cuenta. */
  error: string | null;
}

/**
 * A dónde vuelve el usuario desde el email.
 *
 * Se construye desde el origen REAL de la petición y no desde
 * `NEXT_PUBLIC_SITE_URL` a secas, para que funcione igual en local y en el
 * dominio de producción sin tocar código. El destino es siempre una ruta
 * interna fija: nunca viene del formulario, así que no hay open redirect que
 * valga.
 */
async function recoveryRedirectUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && configured.startsWith("http")) {
    return new URL("/admin/reset-password", configured).toString();
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}/admin/reset-password`;
}

export async function requestPasswordResetAction(
  _prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim() : "";

  /*
    Ni siquiera el formato se comunica como error: se descarta en silencio y se
    responde lo mismo. Ver la cabecera de este archivo.
  */
  if (!looksLikeEmail(email)) {
    if (email.length === 0) {
      // Un campo vacío SÍ es un error de forma: no es información sobre
      // ninguna cuenta, y sin él la pantalla diría "revisa tu correo" cuando
      // no se ha escrito nada.
      // TODO(i18n)
      return { sent: false, error: "Escribe tu email." };
    }
    return { sent: true, error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await recoveryRedirectUrl(),
  });

  if (error) {
    // Sin el email en el log (docs/rules/backend.md #16): identificaría a una
    // persona en un archivo que puede acabar en cualquier sitio.
    console.error("[admin] resetPasswordForEmail falló", {
      status: error.status,
      code: error.code,
    });
  }

  return { sent: true, error: null };
}
