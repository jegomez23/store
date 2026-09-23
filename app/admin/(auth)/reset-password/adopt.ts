"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Convertir el token del FRAGMENTO en una sesión de servidor (incremento 18).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ HACE FALTA ESTO
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDIDO: con la plantilla de email POR DEFECTO de Supabase, el enlace acaba
 * en un **303 hacia `<redirect_to>#access_token=…&refresh_token=…&type=recovery`**.
 * El fragmento (`#…`) **no se envía al servidor**: ni el proxy, ni un Route
 * Handler, ni un Server Component pueden verlo. Solo el navegador lo tiene.
 *
 * Así que el navegador lo lee y lo entrega aquí UNA vez, y a partir de ese
 * momento la sesión vive en las cookies httpOnly del servidor, como el resto
 * del panel. No se usa `lib/supabase/browser.ts`: ese cliente guardaría la
 * sesión en una cookie legible por JavaScript y rompería la decisión de
 * `lib/supabase/cookies.ts` (todo el panel es server-side y sus cookies son
 * httpOnly).
 *
 * Con una plantilla que use `{{ .TokenHash }}` este camino no se usa: el token
 * llega por query a `/admin/auth/confirm` y nunca pasa por JavaScript. Es
 * preferible, y es configuración del panel de Supabase.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ACEPTA TOKENS DEL CLIENTE, Y POR ESO LOS VALIDA CONTRA SUPABASE
 * ═══════════════════════════════════════════════════════════════════════════
 * Una Server Action es un endpoint POST público: cualquiera puede mandar aquí
 * lo que quiera. `setSession` solo guarda; quien decide si eso vale es
 * `getUser()`, **que valida el JWT contra Supabase** en vez de leerlo a ciegas.
 * Si no vale, se cierra la sesión y no queda ninguna cookie rondando.
 *
 * Y aunque valiera: una sesión NO es acceso al panel. Sigue haciendo falta
 * `is_admin()` en el layout de `(panel)` y en cada `requireAdmin()`.
 */

export interface AdoptResult {
  ok: boolean;
}

export async function adoptRecoverySessionAction(
  accessToken: unknown,
  refreshToken: unknown,
): Promise<AdoptResult> {
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    accessToken.length === 0 ||
    accessToken.length > 4096 ||
    refreshToken.length === 0 ||
    refreshToken.length > 4096
  ) {
    return { ok: false };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    console.error("[admin] setSession de recuperación falló", {
      status: error.status,
      code: error.code,
    });
    return { ok: false };
  }

  // LA COMPROBACIÓN QUE IMPORTA: `getUser()` pregunta a Supabase. Un token
  // inventado o caducado no sobrevive a esta línea.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await supabase.auth.signOut();
    return { ok: false };
  }

  return { ok: true };
}
