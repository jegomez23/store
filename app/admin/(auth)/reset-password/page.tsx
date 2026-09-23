import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";
import { createClient } from "@/lib/supabase/server";

/**
 * `/admin/reset-password` — establecer la contraseña nueva (incremento 18).
 *
 * Va en el grupo `(auth)`, NO en `(panel)`: quien llega aquí puede no ser
 * admin —cualquier cuenta de Supabase Auth puede recuperar su contraseña— y el
 * guard de `(panel)` le enseñaría «Acceso denegado» en vez de dejarle terminar.
 * Recuperar el acceso a una cuenta y tener permisos de administración son dos
 * cosas distintas, y esta pantalla solo hace la primera.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ENTRAR AQUÍ A PELO NO SIRVE DE NADA
 * ─────────────────────────────────────────────────────────────────────────
 * Sin sesión no se pinta el formulario, y aunque alguien lo enviara por POST,
 * `setNewPasswordAction` empieza comprobando `getUser()` contra Supabase. La
 * sesión solo puede venir de haber canjeado el enlace del email.
 *
 * `getUser()` valida el JWT contra Supabase; NO se usa `getSession()`, que se
 * cree la cookie sin preguntar.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  robots: { index: false, follow: false },
};

export default async function AdminResetPasswordPage(
  props: PageProps<"/admin/reset-password">,
) {
  const searchParams = await props.searchParams;
  const rawError = searchParams.error;
  const linkError =
    (Array.isArray(rawError) ? rawError[0] : rawError) === "invalid";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* TODO(i18n) */}
          <h1 className="text-xl font-bold tracking-tight text-black">
            Nueva contraseña
          </h1>
          <p className="mt-1 text-sm text-gray-700">
            Después tendrás que entrar con ella.
          </p>
        </div>

        <ResetPasswordForm
          hasSession={user !== null}
          email={user?.email ?? null}
          linkError={linkError}
        />
      </div>
    </main>
  );
}
