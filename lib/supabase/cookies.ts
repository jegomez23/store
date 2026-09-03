import type { CookieOptions } from "@supabase/ssr";

/**
 * Endurecimiento de las cookies de sesión del admin (Fase 7).
 *
 * POR QUÉ EXISTE: `@supabase/ssr` NO marca `httpOnly` por defecto, porque su
 * cliente de navegador necesita leer la sesión desde `document.cookie`. Se
 * verificó empíricamente sirviendo el build: la cabecera `Set-Cookie` de
 * `sb-<ref>-auth-token` llegaba sin `HttpOnly`, en contra de lo que afirma
 * `docs/08-SECURITY.md` §2.
 *
 * En este proyecto ese trade-off no aplica: el panel es 100% server-side y
 * NINGÚN componente cliente instancia `lib/supabase/browser.ts`. Al forzar
 * `httpOnly` un XSS ya no puede robar la sesión del administrador, y el
 * comportamiento pasa a coincidir con lo documentado.
 *
 * CONSECUENCIA A TENER EN CUENTA: si algún día un Client Component necesita el
 * cliente de navegador autenticado, dejará de ver la sesión. La respuesta
 * correcta entonces es mover esa lectura al servidor, no quitar `httpOnly`.
 *
 * `Secure` tampoco lo pone la librería (sus `DEFAULT_COOKIE_OPTIONS` solo
 * traen `path`, `sameSite`, `httpOnly: false` y `maxAge`). Se deriva del
 * protocolo real del sitio en vez de `NODE_ENV`: `next start` en local corre
 * con `NODE_ENV=production` sobre http, y marcar `Secure` ahí haría que el
 * navegador descartara la cookie y el login local no funcionase nunca.
 */
export function adminCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: options.sameSite ?? "lax",
    secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
  };
}
