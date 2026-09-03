/**
 * Antigüedad de un pedido (Fase 9.5, Incremento 3) — MÓDULO PURO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ HACE Y, SOBRE TODO, QUÉ NO HACE
 * ─────────────────────────────────────────────────────────────────────────
 * Convierte un instante en una antigüedad legible: "hace 12 min", "hace 3 h",
 * "hace 2 días". Nada más.
 *
 * **NO clasifica, no puntúa y no llama a nada "atrasado", "urgente" ni
 * "problemático".** Hacerlo exigiría un umbral —¿a partir de cuántas horas un
 * pedido va tarde?— y ese umbral es una REGLA DE NEGOCIO que nadie ha definido
 * en YI Store. Inventarla aquí haría que el panel afirmara algo que el negocio
 * no ha decidido, y el admin acabaría ignorando una alarma que no significa
 * nada.
 *
 * Lo que sí es objetivo, y por eso se hace: mostrar la antigüedad real y
 * ORDENAR por ella. "El más antiguo" es un hecho; "el más urgente" es una
 * opinión. El panel se queda en los hechos.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Antigüedad en milisegundos. `null` si la fecha no es utilizable.
 * Una fecha futura (reloj desviado del cliente o del servidor) devuelve 0 en
 * vez de un número negativo: "dentro de 3 minutos" no significa nada aquí.
 */
export function ageMs(iso: string | null | undefined, nowMs: number): number | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, nowMs - then);
}

/**
 * "hace 12 min" · "hace 3 h" · "hace 2 días".
 *
 * Minutos y horas en formato corto porque aparecen en tablas densas; días en
 * formato largo porque "hace 2 d" se lee peor que "hace 2 días" y a esa escala
 * ya no hay problema de espacio. La pluralización la resuelve `Intl`, no una
 * concatenación a mano.
 */
export function formatAge(
  iso: string | null | undefined,
  nowMs: number,
  locale = "es-ES",
): string | null {
  const ms = ageMs(iso, nowMs);
  if (ms === null) return null;

  if (ms < MINUTE) return "ahora mismo";

  const short = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" });
  const long = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "long" });

  if (ms < HOUR) return short.format(-Math.floor(ms / MINUTE), "minute");
  if (ms < DAY) return short.format(-Math.floor(ms / HOUR), "hour");
  return long.format(-Math.floor(ms / DAY), "day");
}

/**
 * Fecha y hora exactas. La antigüedad relativa sirve para decidir de un
 * vistazo; la exacta, para hablar con el cliente ("tu pedido entró el 3 a las
 * 18:42"). Se muestran las dos donde hay sitio.
 */
export function formatExact(
  iso: string | null | undefined,
  locale = "es-ES",
): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
