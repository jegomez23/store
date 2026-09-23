import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Canje del token del email de recuperación (incremento 18).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ UN ROUTE HANDLER Y NO UNA PÁGINA
 * ═══════════════════════════════════════════════════════════════════════════
 * Canjear el token ESCRIBE las cookies de sesión, y un Server Component no
 * puede escribir cookies. Solo una Server Action o un Route Handler pueden, y
 * aquí el que llega es el navegador siguiendo un enlace: un GET, no un envío
 * de formulario.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ FORMA TIENE EL ENLACE, Y POR QUÉ ESTA RUTA PUEDE QUEDARSE SIN VISITAS
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIDO contra el proyecto real:
 *
 *   · Con la plantilla de email POR DEFECTO (`{{ .ConfirmationURL }}`), el
 *     enlace pasa por `/auth/v1/verify` y Supabase responde **303 hacia
 *     `<redirect_to>#access_token=…&refresh_token=…&type=recovery`**. El token
 *     viaja en el FRAGMENTO, que el navegador **no envía al servidor**: esta
 *     ruta no lo vería ni aunque la visitara. Ese caso lo recoge
 *     `RecoveryBootstrap` en `/admin/reset-password`.
 *   · Con una plantilla que use `{{ .TokenHash }}`, el enlace apunta AQUÍ con
 *     `?token_hash=…&type=recovery` y todo se resuelve en servidor, sin que el
 *     token pase nunca por JavaScript. **Es la forma preferible**, y es
 *     configuración del panel de Supabase (Authentication → Email Templates),
 *     no código: por eso se admiten las dos.
 *
 * `verifyOtp` con `token_hash` está verificado contra el proyecto real: 200 y
 * devuelve sesión, y el mismo token **reutilizado devuelve 403 · otp_expired**.
 * El token es de un solo uso y lo controla Supabase, no este código.
 *
 * NADA de `service_role`: se usa la anon key y la sesión resultante.
 */

const RESET_PATH = "/admin/reset-password";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const failure = new URL(RESET_PATH, origin);

  // Solo `recovery`. Esta ruta no es un confirmador genérico de OTP: aceptar
  // `signup` o `email_change` aquí convertiría la pantalla de contraseña en el
  // final de flujos que no le corresponden.
  if (!tokenHash || type !== "recovery") {
    failure.searchParams.set("error", "invalid");
    return NextResponse.redirect(failure);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });

  if (error) {
    // Enlace caducado, ya usado o manipulado: los tres acaban igual, y el
    // detalle solo al log. Distinguirlos en pantalla no ayuda a quien lo ha
    // recibido y sí a quien lo está probando.
    console.error("[admin] verifyOtp de recuperación falló", {
      status: error.status,
      code: error.code,
    });
    failure.searchParams.set("error", "invalid");
    return NextResponse.redirect(failure);
  }

  // Sesión de recuperación establecida en cookies httpOnly. Se va a la
  // pantalla de contraseña SIN el token en la URL: así no queda en el
  // historial del navegador ni en un `Referer`.
  return NextResponse.redirect(new URL(RESET_PATH, origin));
}
