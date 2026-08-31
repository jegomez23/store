import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para Client Components. Usa la anon key (segura para el
 * navegador) — nunca la service role key. Ver docs/rules/security.md.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
