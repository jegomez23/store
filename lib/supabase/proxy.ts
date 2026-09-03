import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { adminCookieOptions } from "@/lib/supabase/cookies";
import type { Database } from "@/types/database.types";

/**
 * Cliente Supabase para `proxy.ts` (DEC-031).
 *
 * POR QUÉ EXISTE: un Server Component NO puede escribir cookies. Si el access
 * token de Supabase caduca (1 h por defecto) durante una sesión de admin, el
 * refresh que hace `@supabase/ssr` dentro del layout se pierde al intentar
 * guardarlo, y el admin acabaría expulsado al login. El proxy sí puede
 * escribir cookies en la respuesta, así que es el único punto del ciclo de
 * request donde la renovación puede persistirse.
 *
 * QUÉ NO ES: esto NO es autorización. Aquí solo se comprueba que existe una
 * sesión válida (identidad), nunca si esa identidad es admin. La autorización
 * real vive en el layout de /admin, en cada Server Action y en RLS —
 * ver docs/08-SECURITY.md §3 y §5.
 *
 * Usa la anon key. La service role key no interviene en ningún punto.
 */

export interface ProxySession {
  /** Usuario validado contra el servidor de Supabase (`getUser`), no un JWT leído a ciegas. */
  user: User | null;
  /** Respuesta que YA lleva las cookies renovadas. Debe ser la que se devuelva. */
  response: NextResponse;
}

export async function refreshSession(
  request: NextRequest,
): Promise<ProxySession> {
  // `NextResponse.next({ request })` propaga las cookies actualizadas también
  // hacia el render de la ruta, no solo hacia el navegador.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1) La request ve las cookies nuevas: si Supabase acaba de refrescar
          //    el token, el Server Component posterior lee ya el token válido.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // 2) Se reconstruye la respuesta sobre esa request y se copian las
          //    cookies con sus `options` (httpOnly, maxAge, sameSite) para que
          //    el navegador las persista.
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, adminCookieOptions(options));
          });
        },
      },
    },
  );

  // `getUser()` contacta con Supabase y valida el JWT; `getSession()` solo
  // decodifica la cookie y NO sirve para decidir nada (docs/rules/security.md #3).
  // Esta llamada es además la que dispara el refresh cuando el token expiró.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, response };
}

/**
 * Copia a una respuesta nueva (típicamente un redirect) las cookies que
 * `refreshSession` acaba de escribir. Sin esto, redirigir al login perdería la
 * sesión renovada.
 */
export function withSessionCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}
