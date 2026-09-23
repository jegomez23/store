import type { NextConfig } from "next";
import { ACTION_BODY_LIMIT_BYTES } from "./lib/admin/images";

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
