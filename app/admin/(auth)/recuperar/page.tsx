import type { Metadata } from "next";
import { RecoverForm } from "@/components/admin/RecoverForm";

/**
 * `/admin/recuperar` — pedir el enlace de recuperación (incremento 18).
 *
 * Va en el grupo `(auth)`, fuera de `(panel)`: quien ha perdido la contraseña
 * no tiene sesión, y el guard de `(panel)` lo rechazaría. El proxy la deja
 * pasar porque está en `PUBLIC_ADMIN_PATHS`.
 *
 * NO comprueba si ya hay sesión ni redirige por ello: un administrador con la
 * sesión abierta puede querer cambiar su contraseña igualmente, y rebotarlo
 * aquí solo le quitaría la única salida que tiene.
 */

// Depende de cookies de sesión a través del cliente de Supabase: nunca se
// prerenderiza ni se cachea, igual que el login.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default function AdminRecoverPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* TODO(i18n) */}
          <h1 className="text-xl font-bold tracking-tight text-black">
            Recuperar contraseña
          </h1>
          <p className="mt-1 text-sm text-gray-700">
            Te enviamos un enlace para crear una nueva.
          </p>
        </div>

        <RecoverForm />
      </div>
    </main>
  );
}
