import { NextResponse, type NextRequest } from "next/server";
import { refreshSession, withSessionCookies } from "@/lib/supabase/proxy";

/**
 * Proxy de Next.js 16 (sustituye a `middleware.ts`; runtime Node.js).
 *
 * DEC-031 — reparto de responsabilidades. Este archivo hace DOS cosas y
 * ninguna más:
 *
 *   1. MANTENER LA SESIÓN VIVA. Renueva el access token de Supabase y escribe
 *      las cookies resultantes en la respuesta. Es el único punto del request
 *      donde eso es posible (un Server Component no puede escribir cookies).
 *   2. GUARD OPTIMISTA DE UX. Sin sesión válida → al login, para no renderizar
 *      un panel que igualmente sería rechazado más abajo.
 *
 * LO QUE ESTE ARCHIVO NO HACE, A PROPÓSITO: comprobar si el usuario es admin.
 * `is_admin()` no se consulta aquí. Borrar este archivo entero NO daría acceso
 * a un solo dato administrativo:
 *
 *   proxy         → mantiene la sesión viva + redirección de cortesía
 *   layout /admin → getUser() + is_admin(): quién eres
 *   Server Action → re-verifica en cada mutación: qué puedes hacer
 *   RLS/Postgres  → lo impide aunque todo lo anterior falle
 *
 * Ver docs/08-SECURITY.md §3 y §5. Los propios docs de Next 16 avisan de por
 * qué esta separación es obligatoria y no estética: las Server Functions son
 * POST a la ruta donde se usan, así que un cambio de `matcher` o mover una
 * action de archivo puede dejarlas fuera del proxy sin que nada falle a la
 * vista ("Always verify authentication and authorization inside each Server
 * Function", node_modules/next/dist/docs/.../file-conventions/proxy.md).
 */

const LOGIN_PATH = "/admin/login";

/**
 * Rutas del área administrativa accesibles SIN sesión (incremento 18).
 *
 * El matcher de este archivo es `/admin/:path*`, así que sin esta lista la
 * recuperación de contraseña sería imposible por construcción: quien ha
 * perdido la clave no tiene sesión, y el proxy lo mandaría al login justo
 * cuando viene del enlace del email —perdiendo por el camino el token, que en
 * el flujo por defecto de Supabase viaja en el FRAGMENTO de la URL—.
 *
 * Son rutas públicas por necesidad, no por descuido, y ninguna da acceso a
 * nada: `/admin/reset-password` solo sirve para cambiar la contraseña de la
 * cuenta que demuestre tener un token de recuperación válido, y quien entre
 * después sigue pasando por `is_admin()` en el layout del panel.
 */
const PUBLIC_ADMIN_PATHS = new Set<string>([
  LOGIN_PATH,
  "/admin/recuperar",
  "/admin/reset-password",
  "/admin/auth/confirm",
]);

export async function proxy(request: NextRequest) {
  const { user, response } = await refreshSession(request);

  const isPublicRoute = PUBLIC_ADMIN_PATHS.has(request.nextUrl.pathname);

  // El login y la recuperación siempre son accesibles. En particular NO se
  // redirige desde aquí a un usuario con sesión: podría estar autenticado y no
  // ser admin, y rebotar login → /admin → login sería un bucle infinito. Quien
  // decide si esa identidad entra es el layout, que sí conoce `is_admin()`.
  if (user || isPublicRoute) {
    return response;
  }

  const redirectUrl = new URL(LOGIN_PATH, request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/admin") {
    redirectUrl.searchParams.set("next", target);
  }

  // Las cookies renovadas viajan también en el redirect: si el token se
  // refrescó justo antes de expirar, no se pierde por redirigir.
  return withSessionCookies(response, NextResponse.redirect(redirectUrl));
}

export const config = {
  // Estrictamente el área administrativa: la tienda pública no paga ni una
  // sola llamada de red por este archivo.
  matcher: "/admin/:path*",
};
