/**
 * Comprobación del entorno al construir en Vercel (DEC-090).
 *
 * Módulo PURO —recibe el entorno como argumento— para poder probarlo con
 * `node:test` (DEC-025). Lo llama `next.config.ts`.
 *
 * POR QUÉ HACE FALTA: las variables `NEXT_PUBLIC_*` se escriben en el código
 * en el BUILD, y varias de este proyecto tienen un valor de respaldo pensado
 * para desarrollo que en producción falla EN SILENCIO:
 *
 *   - sin `NEXT_PUBLIC_SITE_URL`, `metadataBase`, el canonical, el sitemap, el
 *     `robots.txt` y el Open Graph apuntan a `http://localhost:3000`; la cookie
 *     de sesión del panel sale sin `Secure` y no se emite HSTS. El build pasa y
 *     la web se ve bien: solo se nota cuando Google indexa localhost;
 *   - sin `NEXT_PUBLIC_MARKET`, el despliegue vende en España
 *     (`FALLBACK_MARKET_ID`), aunque fuera el proyecto de Colombia.
 *
 * Por eso, cuando el build corre en Vercel (`VERCEL=1`), falla con un mensaje
 * que dice QUÉ variable falta y DÓNDE se configura. En local y en CI no exige
 * nada nuevo: ahí los respaldos son lo que se quiere.
 *
 * Lo que comprueba SIEMPRE, también en local: que ningún secreto de servidor
 * lleve el prefijo `NEXT_PUBLIC_`. Con ese prefijo Next lo copia al JavaScript
 * del navegador, y eso no tiene vuelta atrás: la clave hay que rotarla.
 *
 * Nunca incluye un VALOR en el mensaje: solo nombres.
 */

export type DeployEnv = Readonly<Record<string, string | undefined>>;

/** Mercados que existen en `markets` (seed `01_markets.sql`, DEC-014). */
export const DEPLOYABLE_MARKETS = ["ES", "CO"] as const;

/**
 * Fragmentos que delatan un secreto. `NEXT_PUBLIC_SUPABASE_ANON_KEY` es
 * pública por diseño (la protege RLS) y no casa con ninguno.
 */
const SECRET_NAME = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|GEMINI|API_KEY|TOKEN/;

function isHttpsUrl(raw: string | undefined): boolean {
  const candidate = (raw ?? "").trim();
  if (!candidate) return false;
  try {
    return new URL(candidate).protocol === "https:";
  } catch {
    return false;
  }
}

function isLocalHost(raw: string | undefined): boolean {
  try {
    const host = new URL((raw ?? "").trim()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * Nombres de variables públicas con pinta de secreto. Se aplica siempre.
 *
 * Se ignoran las `NEXT_PUBLIC_VERCEL_*`: las crea la plataforma (URL, rama,
 * commit…), no este proyecto, y un nombre suyo no debe tumbar el build.
 */
export function exposedSecretNames(env: DeployEnv): string[] {
  return Object.keys(env)
    .filter((name) => name.startsWith("NEXT_PUBLIC_") && !name.startsWith("NEXT_PUBLIC_VERCEL_"))
    .filter((name) => SECRET_NAME.test(name))
    .filter((name) => (env[name] ?? "").trim() !== "")
    .sort();
}

/**
 * Problemas del entorno, en castellano y sin valores. Vacío = se puede
 * construir. Las comprobaciones de despliegue solo se aplican con `VERCEL=1`.
 */
export function deployEnvProblems(env: DeployEnv): string[] {
  const problems = exposedSecretNames(env).map(
    (name) =>
      `${name}: un secreto no puede llevar el prefijo NEXT_PUBLIC_ (acabaría en el JavaScript del navegador). Quítale el prefijo y, si ya se desplegó así, rota la clave.`,
  );

  if (env.VERCEL !== "1") return problems;

  if (!isHttpsUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL: falta o no es una URL https. Es la Project URL de Supabase (Settings → API).",
    );
  }
  if ((env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() === "") {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY: falta. Es la anon/publishable key del MISMO proyecto de Supabase.",
    );
  }
  if (!isHttpsUrl(env.NEXT_PUBLIC_SITE_URL) || isLocalHost(env.NEXT_PUBLIC_SITE_URL)) {
    problems.push(
      "NEXT_PUBLIC_SITE_URL: falta o no es una URL https pública. Sin ella el canonical, el sitemap y el Open Graph apuntarían a localhost. Pon la URL del dominio (o la .vercel.app del proyecto mientras no haya dominio).",
    );
  }
  const market = (env.NEXT_PUBLIC_MARKET ?? "").trim();
  if (!(DEPLOYABLE_MARKETS as readonly string[]).includes(market)) {
    problems.push(
      `NEXT_PUBLIC_MARKET: falta o no es uno de ${DEPLOYABLE_MARKETS.join(", ")}. Sin ella el despliegue vendería en ES por defecto.`,
    );
  }
  return problems;
}

/** Lanza con todos los problemas juntos, para arreglarlos de una vez. */
export function assertDeployEnv(env: DeployEnv): void {
  const problems = deployEnvProblems(env);
  if (problems.length === 0) return;
  throw new Error(
    [
      "Configuración de entorno incompleta (lib/security/deploy-env.ts, DEC-090):",
      ...problems.map((problem) => `  - ${problem}`),
      "En Vercel: Project → Settings → Environment Variables, en el entorno que se está construyendo (Preview o Production), y vuelve a desplegar.",
    ].join("\n"),
  );
}
