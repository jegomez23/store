import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getAdminAccess } from "@/lib/admin/auth";

/**
 * Guard REAL del panel (capa 2 de docs/08-SECURITY.md §3).
 *
 * A diferencia de `proxy.ts` —que solo mantiene viva la sesión y redirige por
 * cortesía—, aquí sí se comprueba `is_admin()`. Aun así tampoco es la última
 * barrera: cada Server Action re-verifica y RLS filtra en PostgreSQL.
 *
 * POR QUÉ UN ROUTE GROUP: `docs/05-ADMIN.md` §2 situaba el guard en
 * `app/admin/layout.tsx`, pero ese layout envolvería también a `/admin/login`
 * y el guard se redirigiría a sí mismo en bucle. Los route groups `(panel)` y
 * `(auth)` separan lo protegido de lo público sin cambiar ninguna URL.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Panel", template: "%s · Panel YI" },
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({
  children,
}: LayoutProps<"/admin">) {
  const access = await getAdminAccess();

  if (access.status === "anonymous") {
    redirect("/admin/login");
  }

  if (access.status === "forbidden") {
    // No se redirige al login: con una sesión válida pero sin rol, redirigir
    // provocaría un ping-pong con la propia página de login. Se muestra el
    // rechazo y la salida.
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream px-4 text-center">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black">
          Acceso denegado
        </h1>
        <p className="max-w-sm text-sm text-gray-700">
          Tu cuenta{access.email ? ` (${access.email})` : ""} no tiene permisos
          de administración.
        </p>
        <LogoutButton />
      </main>
    );
  }

  return <AdminShell email={access.identity.email}>{children}</AdminShell>;
}
