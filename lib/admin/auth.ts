import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Capa de acceso a la identidad administrativa (DEC-031, DEC-034).
 *
 * Es el patrón "Data Access Layer" que recomiendan los docs de Next 16 para
 * autenticación: una única función que decide quién eres, envuelta en `cache()`
 * para que layout, página y Server Action de la MISMA request compartan el
 * resultado sin repetir la llamada de red.
 *
 * AUTORIDAD: `getUser()` (valida el JWT contra Supabase, no lo lee a ciegas) +
 * la función SQL `public.is_admin()`. No se replica aquí la lógica de rol: si
 * algún día `is_admin()` cambia de criterio, este código lo hereda sin tocarse.
 *
 * NUNCA usa la service role key: el cliente lleva la anon key y la sesión del
 * usuario, así que RLS sigue filtrando todo lo que se lea después.
 */

export interface AdminIdentity {
  userId: string;
  email: string | null;
}

export type AdminAccess =
  /** Sin sesión válida. */
  | { status: "anonymous" }
  /** Sesión válida, pero `is_admin()` dice que no. */
  | { status: "forbidden"; email: string | null }
  | { status: "admin"; identity: AdminIdentity };

export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const { data: isAdmin, error } = await supabase.rpc("is_admin");

  if (error) {
    // Ante un fallo de la comprobación de rol se DENIEGA. Nunca se degrada a
    // "permitir" (docs/rules/security.md #1).
    console.error("[admin] is_admin() falló", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return { status: "forbidden", email: user.email ?? null };
  }

  if (isAdmin !== true) {
    return { status: "forbidden", email: user.email ?? null };
  }

  return {
    status: "admin",
    identity: { userId: user.id, email: user.email ?? null },
  };
});

/**
 * Guard para Server Actions. Devuelve la identidad o `null` — nunca lanza, para
 * que la action pueda responder con su error tipado (docs/rules/backend.md #2).
 *
 * OBLIGATORIO en TODA mutación administrativa: el proxy y el layout no
 * protegen a una Server Action, que es un endpoint POST accesible directamente.
 */
export async function requireAdmin(): Promise<AdminIdentity | null> {
  const access = await getAdminAccess();
  return access.status === "admin" ? access.identity : null;
}
