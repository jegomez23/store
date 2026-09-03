"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeAdminRedirect } from "@/lib/admin/redirect";

/**
 * Autenticación del administrador (DEC-031).
 *
 * SEGURIDAD:
 * - Los mensajes de error son deliberadamente genéricos: no distinguen "email
 *   no existe" de "contraseña incorrecta", para no permitir enumerar cuentas
 *   (docs/rules/security.md #10).
 * - Autenticarse NO es autorizarse. Tras el login se comprueba `is_admin()`; si
 *   la cuenta no es admin se cierra la sesión inmediatamente, así no queda una
 *   cookie válida rondando por el panel.
 * - No existe registro público: esta action solo inicia sesión, nunca crea
 *   usuarios ni roles (DEC-020).
 */

export interface LoginState {
  error: string | null;
}

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
const GENERIC_ERROR = "Email o contraseña incorrectos.";
const NOT_ADMIN_ERROR = "Esta cuenta no tiene acceso al panel.";
const UNEXPECTED_ERROR = "No se pudo iniciar sesión. Inténtalo de nuevo.";

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = readField(formData, "email");
  const password = formData.get("password");
  const next = safeAdminRedirect(readField(formData, "next"));

  // Validación de forma antes de tocar la red. Los límites evitan mandar
  // payloads absurdos a Supabase Auth.
  if (
    email.length < 3 ||
    email.length > 254 ||
    !email.includes("@") ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 200
  ) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Sin datos personales en el log (docs/rules/backend.md #16).
    console.error("[admin] login fallido", {
      status: error.status,
      code: error.code,
    });
    return { error: GENERIC_ERROR };
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");

  if (roleError || isAdmin !== true) {
    await supabase.auth.signOut();
    if (roleError) {
      console.error("[admin] is_admin() falló tras el login", {
        code: roleError.code,
        message: roleError.message,
      });
      return { error: UNEXPECTED_ERROR };
    }
    return { error: NOT_ADMIN_ERROR };
  }

  // `redirect()` funciona lanzando una excepción de control de Next: debe
  // quedar FUERA de cualquier try/catch para que no se trague la navegación.
  redirect(next);
}

/**
 * Cierre de sesión. Revoca la sesión en Supabase y limpia las cookies (las
 * escribe `@supabase/ssr` a través del cliente de servidor, algo que solo es
 * posible dentro de una Server Action o Route Handler).
 */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
