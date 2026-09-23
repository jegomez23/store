/**
 * Cabeceras de seguridad de la respuesta (Fase 10, DEC-086).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTO SE LO PIDE EL SERVIDOR AL NAVEGADOR. NO SUSTITUYE A NADA.
 * ═══════════════════════════════════════════════════════════════════════════
 * Ninguna cabecera de aquí impide leer un dato: lo que protege el panel sigue
 * siendo `proxy.ts` (sesión) → layout (`is_admin()`) → `requireAdmin()` en cada
 * Server Action → RLS en PostgreSQL. Una CSP solo reduce lo que un navegador
 * acepta ejecutar SI algún día se cuela contenido ajeno en una página.
 *
 * Módulo PURO —sin imports de runtime, sin leer `process.env`— para poder
 * comprobarlo con `node:test` (DEC-025). El entorno lo inyecta `next.config.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ `'unsafe-inline'` EN script-src, Y QUÉ SE PIERDE CON ELLO
 * ═══════════════════════════════════════════════════════════════════════════
 * La alternativa buena es un nonce por petición. Los docs de Next 16 son
 * explícitos sobre su precio (`node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md`): el nonce lo aplica el render del SERVIDOR a
 * partir de la cabecera de la PETICIÓN, así que **obliga a render dinámico** y
 * «Static optimization and Incremental Static Regeneration (ISR) are disabled».
 *
 * Esta tienda es estática e ISR a propósito: la portada, las fichas y el
 * sitemap se prerenderizan, y toda la fase 9 se dedicó a que la invalidación
 * fuese quirúrgica. Cambiar eso por una CSP más estricta significaría
 * renderizar cada ficha en cada visita — un coste real y permanente a cambio de
 * un endurecimiento que hoy no tiene a qué aplicarse: la tienda **no carga ni
 * un solo script de terceros**, y el único HTML crudo que se inyecta es el
 * JSON-LD que genera el propio servidor.
 *
 * Lo que esta CSP SÍ hace, aun con `'unsafe-inline'`:
 *   - un `<script src="https://otro-dominio/…">` inyectado NO se descarga;
 *   - `object-src 'none'`: nada de `<object>` ni `<embed>`;
 *   - `base-uri 'self'`: no se puede reescribir la base de las URLs relativas;
 *   - `form-action 'self'`: un formulario inyectado no puede POSTear fuera;
 *   - `frame-ancestors 'none'`: clickjacking, además de `X-Frame-Options`;
 *   - `connect-src` cerrado: un `fetch()` inyectado no puede exfiltrar a otro
 *     dominio.
 *
 * Lo que NO hace: impedir que se ejecute un `<script>` inline inyectado. Por
 * eso el nonce queda anotado como el siguiente paso —medible solo con un
 * navegador y la base de datos en pie— y no como algo ya resuelto.
 *
 * ⚠️ NO AÑADIR AQUÍ un dominio de terceros «por si acaso». Cada origen de esta
 * lista es un sitio desde el que un navegador aceptaría cargar algo.
 *
 * ⚠️ **ESTAS CABECERAS SE CONGELAN EN EL BUILD.** `headers()` de `next.config.ts`
 * se evalúa al construir y el resultado se escribe en `.next/routes-manifest.json`;
 * `next start` se limita a servir eso. Medido: con el servidor ya arrancado,
 * cambiar `NEXT_PUBLIC_SITE_URL` a `https://…` **no** hizo aparecer HSTS, y tras
 * `npm run build` apareció en la misma petición. Consecuencia práctica: el
 * entorno del **build** es el que decide si se emite HSTS, así que la variable
 * tiene que estar bien en el momento de construir, no solo al desplegar.
 */

/** Cabecera HTTP tal y como la espera `headers()` de Next. */
export interface ResponseHeader {
  key: string;
  value: string;
}

export interface SecurityHeaderOptions {
  /** `NEXT_PUBLIC_SUPABASE_URL`. De aquí salen las imágenes de Storage y la API. */
  supabaseUrl?: string | null;
  /** `NEXT_PUBLIC_SITE_URL`. Decide si HSTS tiene sentido: solo con HTTPS. */
  siteUrl?: string | null;
  /** `NODE_ENV === "development"`. */
  isDev?: boolean;
}

/**
 * Origen (`https://host`) de una URL, o `null` si no lo es.
 *
 * Devolver `null` en vez de lanzar es deliberado: una variable de entorno mal
 * escrita no puede tumbar el build. La CSP queda entonces MÁS estricta, que es
 * el lado correcto por el que fallar.
 */
export function originOf(raw: string | null | undefined): string | null {
  const candidate = (raw ?? "").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** ¿El sitio se sirve por HTTPS? HSTS sobre `http://localhost` no aporta nada. */
export function isSecureSite(siteUrl: string | null | undefined): boolean {
  const origin = originOf(siteUrl);
  return origin !== null && origin.startsWith("https://");
}

/**
 * Valor de `Content-Security-Policy`.
 *
 * En DESARROLLO se relaja lo justo, y por motivos que documenta el propio Next:
 * React usa `eval` para reconstruir los stacks del servidor, y Turbopack abre un
 * WebSocket para el hot reload. Ninguna de las dos cosas existe en el build de
 * producción, así que ninguna de las dos se concede allí.
 */
export function buildContentSecurityPolicy(
  options: SecurityHeaderOptions = {},
): string {
  const supabaseOrigin = originOf(options.supabaseUrl);
  const isDev = options.isDev === true;

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  // Imágenes: el propio dominio (next/image sirve por `/_next/image`), los
  // `data:` del placeholder blur generado en servidor (DEC-040), los `blob:` de
  // la previsualización al subir una foto, y Storage.
  const imgSrc = ["'self'", "data:", "blob:"];
  if (supabaseOrigin) imgSrc.push(supabaseOrigin);

  // Red: las Server Actions van al propio origen; Supabase Auth y PostgREST
  // salen del navegador en el panel.
  const connectSrc = ["'self'"];
  if (supabaseOrigin) connectSrc.push(supabaseOrigin);
  if (isDev) connectSrc.push("ws:", "wss:");

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["script-src", scriptSrc],
    // Tailwind v4 y React emiten estilos inline; no hay hoja de terceros.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // `next/font` descarga Geist en el build y la sirve desde el propio origen.
    ["font-src", ["'self'"]],
    ["img-src", imgSrc],
    ["connect-src", connectSrc],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'none'"]],
    ["worker-src", ["'self'", "blob:"]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`);

  // Solo con HTTPS: en local convertiría las peticiones a `http://localhost` en
  // `https://` y no cargaría nada.
  if (isSecureSite(options.siteUrl)) policy.push("upgrade-insecure-requests");

  return policy.join("; ");
}

/**
 * `Strict-Transport-Security`, o `null` cuando el sitio no es HTTPS.
 *
 * Un año, con subdominios. **Sin `preload`**, y es una decisión: entrar en la
 * lista de precarga de los navegadores es difícil de revertir y compromete a
 * servir por HTTPS todo subdominio futuro del dominio. Eso lo decide el dueño
 * del dominio cuando el dominio exista, no este archivo.
 */
export function buildStrictTransportSecurity(
  siteUrl: string | null | undefined,
): string | null {
  if (!isSecureSite(siteUrl)) return null;
  return "max-age=31536000; includeSubDomains";
}

/**
 * Todas las cabeceras de seguridad de la respuesta, en el formato de Next.
 *
 * Las cuatro primeras venían de la fase 9 (DEC-042) y no cambian.
 */
export function buildSecurityHeaders(
  options: SecurityHeaderOptions = {},
): ResponseHeader[] {
  const headers: ResponseHeader[] = [
    // La tienda no se embebe en ningún iframe legítimo: clickjacking fuera.
    { key: "X-Frame-Options", value: "DENY" },
    // Impide que el navegador «adivine» el tipo de un objeto de Storage.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // No filtra la URL completa a terceros (una ficha de producto ya dice bastante).
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // La tienda no usa cámara, micrófono ni geolocalización: se deniegan.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
  ];

  const hsts = buildStrictTransportSecurity(options.siteUrl);
  if (hsts) headers.push({ key: "Strict-Transport-Security", value: hsts });

  return headers;
}
