"use server";

import { redirect } from "next/navigation";
import {
  passwordErrorMessage,
  validateNewPassword,
} from "@/lib/admin/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Establecer la contraseña nueva (incremento 18).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NO SE PUEDE CAMBIAR LA CONTRASEÑA SIN UN TOKEN VÁLIDO
 * ═══════════════════════════════════════════════════════════════════════════
 * Esta action no recibe ningún token ni ningún email: cambia la contraseña de
 * **quien demuestre tener una sesión**, y esa sesión solo puede venir de haber
 * canjeado el enlace del email. `updateUser` va contra Supabase con esa sesión;
 * sin ella responde 401 y aquí no se escribe nada.
 *
 * Una Server Action es un endpoint POST público: por eso lo primero que hace
 * es `getUser()`, que **valida el JWT contra Supabase** en vez de creerse la
 * cookie (docs/rules/security.md; mismo criterio que `getAdminAccess`).
 *
 * ⚠️ **Autenticación ≠ autorización, y aquí se nota.** Esta pantalla es para
 * cualquier cuenta de Supabase Auth que haya recuperado su acceso, sea admin o
 * no. Cambiar la contraseña **no concede nada**: para entrar al panel sigue
 * haciendo falta `is_admin()`, que comprueba el layout de `(panel)` y cada
 * `requireAdmin()`. Por eso aquí NO se consulta el rol: no es asunto de esta
 * pantalla, y consultarlo invitaría a tomar decisiones de acceso en el sitio
 * equivocado.
 *
 * NADA de `service_role`.
 */

export interface ResetPasswordState {
  error: string | null;
}

// TODO(i18n)
const NO_SESSION =
  "El enlace ya no es válido o ha caducado. Pide uno nuevo desde la pantalla de acceso.";

export async function setNewPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NO_SESSION };

  const parsed = validateNewPassword(
    formData.get("password"),
    formData.get("confirmation"),
  );
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.auth.updateUser({ password: parsed.password });

  if (error) {
    console.error("[admin] updateUser(password) falló", {
      status: error.status,
      code: error.code,
    });
    return { error: passwordErrorMessage(error.code, error.message) };
  }

  /*
    SE CIERRA LA SESIÓN DE RECUPERACIÓN A PROPÓSITO.

    Tras cambiar la contraseña, esa sesión ya ha hecho su trabajo. Cerrarla y
    obligar a entrar con la contraseña nueva:

      · confirma que la contraseña nueva es la que el usuario cree que es —si
        se equivocó al escribirla dos veces igual, se entera aquí y no mañana—;
      · no deja abierta una sesión que nació de un enlace de un correo, que es
        el material que alguien podría haber visto por encima del hombro;
      · hace que el acceso al panel vuelva a pasar por `loginAction`, que es
        donde se comprueba `is_admin()` y donde una cuenta sin permisos recibe
        su mensaje.

    `signOut()` revoca la sesión en Supabase y limpia las cookies.
  */
  await supabase.auth.signOut();

  // `redirect()` lanza una excepción de control de Next: fuera de try/catch.
  redirect("/admin/login?password=cambiada");
}
