import type { NextConfig } from "next";

// Hostname derivado de NEXT_PUBLIC_SUPABASE_URL (sin hardcodear un
// project-ref real). Si la variable no está configurada, remotePatterns
// queda vacío y next/image simplemente no permite imágenes remotas todavía.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

/**
 * Headers de seguridad (Fase 9, `docs/08-SECURITY.md` §270).
 *
 * Son exactamente los tres que enumera esa sección más `nosniff`. Todos actúan
 * sobre el NAVEGADOR: no sustituyen a nada del lado servidor. Lo que protege
 * el panel sigue siendo `proxy.ts` → layout → `requireAdmin()` → RLS.
 *
 * NO se añade `Content-Security-Policy`: Next inyecta scripts inline y
 * Tailwind estilos inline, así que una CSP mal calibrada rompe la tienda de
 * formas que en este entorno **no hay navegador para verificar**. Queda para el
 * deploy (Fase 11), donde se puede medir contra el dominio real.
 *
 * NO se añade `Strict-Transport-Security`: en local se sirve por HTTP y
 * marcarlo aquí no aporta nada. Va con el dominio de producción.
 */
const securityHeaders = [
  // La tienda no se embebe en ningún iframe legítimo: clickjacking fuera.
  { key: "X-Frame-Options", value: "DENY" },
  // Impide que el navegador "adivine" el tipo de un objeto de Storage.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtra la URL completa a terceros (una ficha de producto ya dice bastante).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La tienda no usa cámara, micrófono ni geolocalización: se deniegan.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
