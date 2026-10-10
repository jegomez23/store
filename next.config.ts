import type { NextConfig } from "next";
import { ACTION_BODY_LIMIT_BYTES } from "./lib/admin/images";
import { buildSecurityHeaders } from "./lib/security/headers";
import { assertDeployEnv } from "./lib/security/deploy-env";

// Fase final (DEC-090): en Vercel, sin `NEXT_PUBLIC_SITE_URL`/`_MARKET`/
// Supabase el build FALLA con el nombre de lo que falta, en vez de publicar un
// canonical a localhost o vender en el mercado por defecto. Y nunca, en ningún
// entorno, un secreto con prefijo `NEXT_PUBLIC_`. El mensaje no lleva valores.
assertDeployEnv(process.env);

// Hostname derivado de NEXT_PUBLIC_SUPABASE_URL (sin hardcodear un
// project-ref real). Si la variable no está configurada, remotePatterns
// queda vacío y next/image simplemente no permite imágenes remotas todavía.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

/**
 * Headers de seguridad (fase 9 DEC-042, ampliados en fase 10 DEC-086).
 *
 * La lista NO se escribe aquí: sale de `lib/security/headers.ts`, que es un
 * módulo puro con tests. Mismo criterio que el límite de subida del incremento
 * 7 — una sola fuente, y un test comprueba que esta configuración la importa en
 * vez de volver a escribirla a mano.
 *
 * Todas actúan sobre el NAVEGADOR: no sustituyen a nada del lado servidor. Lo
 * que protege el panel sigue siendo `proxy.ts` → layout → `requireAdmin()` →
 * RLS.
 *
 * Las dos nuevas dependen del ENTORNO, y por eso se resuelven aquí:
 *   - la CSP necesita el origen de Supabase (imágenes de Storage y llamadas a
 *     Auth desde el navegador del panel);
 *   - `Strict-Transport-Security` solo se emite si `NEXT_PUBLIC_SITE_URL` es
 *     HTTPS. En `http://localhost` no aporta nada y no se manda.
 */
const securityHeaders = buildSecurityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  isDev: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /**
   * SUBIDA DE IMÁGENES (incremento 7) — corrige un fallo MEDIDO, no una mejora
   * preventiva.
   *
   * Next limita el cuerpo de una Server Action a **1 MB por defecto**, y aquí
   * no estaba configurado. Comprobado sobre el build servido:
   *
   *     jpeg de 0,32 MB → HTTP 200, imagen guardada
   *     jpeg de 1,20 MB → HTTP 500 · "Body exceeded 1 MB limit"
   *
   * O sea: una foto de móvil corriente **no se podía subir**, aunque
   * `MAX_IMAGE_BYTES` y el bucket admiten 5 MB. El administrador solo veía un
   * error genérico.
   *
   * El valor NO se escribe a mano aquí: se deriva de los mismos límites que
   * usa la validación (`MAX_FILES_PER_BATCH × MAX_IMAGE_BYTES` + holgura para
   * las fronteras de `multipart/form-data`, que los docs de Next avisan de que
   * cuentan). Una sola fuente, y un test comprueba que no divergen.
   */
  /**
   * EL SEGUNDO LÍMITE, y hasta el incremento 17 hacía inalcanzable al primero.
   *
   * `serverActions.bodySizeLimit` no es el único tope: cuando hay `proxy.ts`
   * —y aquí lo hay—, Next **clona y bufferiza el cuerpo en memoria** para que
   * lo puedan leer el proxy y la ruta, con un tope propio de **10 MB por
   * defecto** (`proxyClientMaxBodySize`, `node_modules/next/dist/docs/.../
   * proxyClientMaxBodySize.md`).
   *
   * MEDIDO sobre el build servido antes de tocar nada, con las tres fotos
   * adjuntas en el formulario real del catálogo:
   *
   *     3 fotos × 4,84 MB = 14,5 MB  →  pantalla "Algo ha fallado", 0 subidas
   *     log: "Request body exceeded 10MB for /admin/catalogo/…"
   *          "Error: Unexpected end of form"
   *
   * Es decir: el lote de 5 fotos que anuncia el incremento 7 **no cabía**, y
   * ni siquiera uno de 3 fotos de móvil. Cada archivo pasaba su validación de
   * 5 MB; lo que fallaba era el transporte, y el administrador solo veía un
   * error genérico — el mismo síntoma que la Fase 8 tenía con el límite de 1 MB.
   *
   * Se deriva del MISMO valor que el otro límite para que no puedan separarse.
   * El coste es memoria del servidor mientras dura la subida; con un panel de
   * un solo administrador es un intercambio razonable, y es exactamente lo que
   * ya se estaba prometiendo en la interfaz.
   */
  /**
   * Y EL TERCERO, que manda sobre los dos (DEC-089): Vercel corta en 4,5 MB
   * cualquier petición a una Function con un `413`, antes de llegar a Next. Por
   * eso `ACTION_BODY_LIMIT_BYTES` vale ahora exactamente ese tope —local se
   * comporta como producción— y es el NAVEGADOR el que reduce las fotos para
   * que quepan (`components/admin/useImageShrinker.ts`).
   */
  experimental: {
    serverActions: {
      bodySizeLimit: ACTION_BODY_LIMIT_BYTES,
    },
    proxyClientMaxBodySize: ACTION_BODY_LIMIT_BYTES,
  },
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
