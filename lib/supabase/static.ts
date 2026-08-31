import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase SIN cookies, para lecturas públicas anónimas (catálogo,
 * mercados, home content) — usable en Server Components, `generateMetadata`
 * y `generateStaticParams` (que corre en build-time, sin request/cookies:
 * `@/lib/supabase/server.ts` falla ahí por depender de `cookies()`). RLS
 * sigue siendo la autoridad; estas queries nunca necesitan `auth.uid()`.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
