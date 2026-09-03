import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdminAccess } from "@/lib/admin/auth";
import { safeAdminRedirect } from "@/lib/admin/redirect";

// El login depende de cookies de sesión: nunca se prerenderiza ni se cachea.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso",
  // El panel no se indexa (docs/rules/security.md #13; robots.ts llega en Fase 8).
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage(
  props: PageProps<"/admin/login">,
) {
  const searchParams = await props.searchParams;
  const rawNext = searchParams.next;
  const next = safeAdminRedirect(
    Array.isArray(rawNext) ? rawNext[0] : rawNext,
  );

  // Si ya hay una sesión de admin válida no tiene sentido pedir credenciales.
  // Solo se redirige cuando es admin de verdad: hacerlo con cualquier sesión
  // provocaría el bucle login → /admin → login con una cuenta sin permisos.
  const access = await getAdminAccess();
  if (access.status === "admin") {
    redirect(next);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-bold tracking-tight text-black">YI</p>
          {/* TODO(i18n) */}
          <p className="mt-1 text-sm text-gray-700">Panel de administración</p>
        </div>

        {access.status === "forbidden" ? (
          <p
            role="status"
            className="mb-4 rounded-md border border-line bg-white px-4 py-3 text-sm text-gray-700"
          >
            {/* TODO(i18n) */}
            La sesión activa
            {access.email ? ` (${access.email})` : ""} no tiene permisos de
            administración. Inicia sesión con una cuenta autorizada.
          </p>
        ) : null}

        <LoginForm next={next} />
      </div>
    </main>
  );
}
