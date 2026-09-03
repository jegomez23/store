import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { adminCookieOptions } from "@/lib/supabase/cookies";
import type { Database } from "@/types/database.types";

/**
 * Cliente Supabase para Server Components / Server Actions. Usa la anon key
 * (autorización real vive en RLS) — nunca la service role key. `cookies()`
 * es async en Next.js 16.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Un Server Component no puede escribir cookies; falla en silencio
          // cuando se llama fuera de una Server Action o Route Handler.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, adminCookieOptions(options));
            });
          } catch {
            // Ignorado: ver comentario arriba.
          }
        },
      },
    },
  );
}
