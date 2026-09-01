import type { CartState, MarketId, PersistedCart } from "./types";

/**
 * Persistencia del carrito en localStorage (Fase 5).
 *
 * Responsabilidad ACOTADA a: clave versionada, serialización, y sobrevivir a
 * datos corruptos. La validación del contenido NO vive aquí — vive en el
 * reducer (`HYDRATE` → `sanitizeLines`), que es la única autoridad sobre qué
 * es un carrito válido. Así no hay dos validaciones que puedan divergir.
 *
 * Por eso `readPersistedLines()` devuelve `unknown`: lo que sale de
 * localStorage no es confiable y el tipo lo dice.
 *
 * SSR: todas las funciones comprueban `typeof window === "undefined"` y son
 * no-op en servidor. Nunca deben llamarse durante render de Server Components,
 * `generateStaticParams` ni build — solo desde efectos de cliente.
 */

/**
 * Clave versionada. No existía convención previa en el proyecto (es el primer
 * uso de localStorage), así que se fija aquí: `yi-store:<dominio>:v<n>`.
 * Subir la versión invalida los carritos antiguos de forma segura en vez de
 * intentar migrarlos.
 */
export const CART_STORAGE_KEY = "yi-store:cart:v1";
export const CART_STORAGE_VERSION = 1;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Safari en modo privado y navegadores con cookies/almacenamiento
    // bloqueado lanzan al acceder a localStorage.
    return null;
  }
}

/** Borra la entrada del carrito sin propagar errores. */
export function clearPersistedCart(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(CART_STORAGE_KEY);
  } catch {
    // Sin recuperación posible ni útil: el carrito en memoria sigue siendo válido.
  }
}

/**
 * Lee las líneas persistidas para el mercado indicado.
 *
 * Devuelve `null` (y limpia la entrada) cuando el contenido es inservible:
 * - JSON corrupto,
 * - envoltorio con forma inesperada,
 * - `version` desconocida,
 * - carrito de otro mercado (DEC-024).
 *
 * Nunca lanza: un localStorage roto no puede tumbar la aplicación.
 */
export function readPersistedLines(marketId: MarketId): unknown {
  const storage = getStorage();
  if (!storage) return null;

  let rawValue: string | null;
  try {
    rawValue = storage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
  if (rawValue === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    clearPersistedCart();
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    clearPersistedCart();
    return null;
  }

  const envelope = parsed as Record<string, unknown>;

  if (envelope.version !== CART_STORAGE_VERSION) {
    // Versión desconocida (futura o antigua): se ignora de forma segura.
    clearPersistedCart();
    return null;
  }

  if (envelope.marketId !== marketId) {
    // Carrito de otro mercado: no se mezcla ni se migra (DEC-024).
    clearPersistedCart();
    return null;
  }

  // Las líneas van tal cual al reducer, que las saneará.
  return envelope.lines;
}

/** Guarda el carrito. Un fallo de cuota o de permisos se ignora en silencio. */
export function writePersistedCart(state: CartState, marketId: MarketId): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: PersistedCart = {
    version: CART_STORAGE_VERSION,
    marketId,
    lines: state.lines,
  };

  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // QuotaExceededError o almacenamiento bloqueado: el carrito sigue vivo en
    // memoria durante la sesión; solo se pierde la persistencia.
  }
}
