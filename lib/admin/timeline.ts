/**
 * Expediente del pedido: mezcla de eventos de estado y notas internas
 * (Fase 9.5, Incremento 5A).
 *
 * POR QUÉ ESTO EXISTE COMO MÓDULO PURO: en la base de datos son dos tablas
 * separadas a propósito (ver la migración 0027 — `order_events` es el
 * historial de transiciones y no puede recibir escrituras de otro origen).
 * Pero el administrador no piensa en tablas: piensa en "qué ha pasado con este
 * pedido". La mezcla es, por tanto, una decisión de PRESENTACIÓN, y vive aquí,
 * donde se puede probar sin red.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

import type { OrderStatus } from "./orders";

export const MAX_NOTE_LENGTH = 2000;

export interface TimelineEventInput {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
  actorId: string | null;
}

export interface TimelineNoteInput {
  id: string;
  body: string;
  createdAt: string;
  actorId: string;
  authorName: string | null;
}

export type TimelineEntry =
  | ({ kind: "event" } & TimelineEventInput)
  | ({ kind: "note" } & TimelineNoteInput);

/**
 * Un solo hilo cronológico, del más antiguo al más reciente.
 *
 * DESEMPATE ESTABLE: dos entradas pueden compartir `created_at` al milisegundo
 * —una nota escrita en el mismo instante en que otra pestaña cambia el
 * estado—. Cuando eso pasa, el evento va primero (el hecho antes del
 * comentario) y, si aún empatan, decide el `id`. Sin esto el orden dependería
 * de cómo llegaran los arrays, que no está garantizado.
 *
 * Se comparan las cadenas ISO directamente: PostgREST las devuelve siempre en
 * UTC con el mismo formato, así que el orden lexicográfico ES el cronológico.
 */
export function buildTimeline(
  events: readonly TimelineEventInput[],
  notes: readonly TimelineNoteInput[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...events.map((event) => ({ kind: "event" as const, ...event })),
    ...notes.map((note) => ({ kind: "note" as const, ...note })),
  ];

  return entries.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export type NoteParseResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
const EMPTY = "Escribe algo antes de guardar la nota.";
const TOO_LONG = `La nota no puede pasar de ${MAX_NOTE_LENGTH} caracteres.`;

/**
 * Valida el texto ANTES de la red, con exactamente el mismo criterio que el
 * CHECK de la migración 0027 (`length(btrim(body)) between 1 and 2000`).
 *
 * Esto no protege nada — la base vuelve a comprobarlo y es la que manda. Sirve
 * para dar un error entendible en vez de un código de PostgreSQL.
 *
 * El recorte se hace aquí y se envía ya recortado, para que lo que se guarda
 * sea exactamente lo que se validó.
 */
export function parseNoteBody(raw: unknown): NoteParseResult {
  if (typeof raw !== "string") return { ok: false, error: EMPTY };

  const body = raw.trim();
  if (body.length === 0) return { ok: false, error: EMPTY };
  if (body.length > MAX_NOTE_LENGTH) return { ok: false, error: TOO_LONG };

  return { ok: true, body };
}

/**
 * Señal objetiva de cliente recurrente.
 *
 * `customers` es única por `(market_id, phone)`, así que el cliente que vuelve
 * es literalmente la misma fila y contar sus pedidos es un hecho, no una
 * inferencia. **No hay ninguna regla comercial aquí**: no existe "cliente VIP"
 * ni umbral de fidelidad, y no se inventa. Solo se dice cuántos pedidos tiene,
 * que es lo que cambia el tono del mensaje que el admin va a escribir.
 *
 * `total` incluye el pedido que se está mirando.
 */
export function repeatCustomerLabel(total: number): string | null {
  if (!Number.isFinite(total) || total <= 1) return null;
  // TODO(i18n)
  return total === 2
    ? "Segundo pedido de este cliente"
    : `Pedido n.º ${total} de este cliente`;
}

// ────────────────────────────────── Auditoría del catálogo (5C)

export const CHANGE_FIELDS = ["status", "deleted_at", "price", "stock"] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export const CHANGE_SOURCES = [
  "reposicion",
  "correccion",
  "matriz",
  "directo",
  "rpc",
] as const;
export type ChangeSource = (typeof CHANGE_SOURCES)[number];

export interface ChangeEntry {
  id: number;
  field: ChangeField;
  oldValue: string | null;
  newValue: string | null;
  source: ChangeSource;
  sku: string | null;
  authorName: string | null;
  createdAt: string;
}

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
const PRODUCT_STATUS_PHRASES: Record<string, string> = {
  active: "Publicado",
  draft: "Retirado de la tienda",
  archived: "Archivado",
};

/**
 * `Number(null)` y `Number("")` valen **0**, no `NaN`, así que comprobar solo
 * `Number.isFinite` dejaba pasar un registro corrupto como "0 → 0" — un dato
 * inventado con pinta de real. Aquí un valor ausente es siempre `NaN`.
 */
function numeric(value: string | null): number {
  if (value === null || value.trim() === "") return Number.NaN;
  return Number(value);
}

/**
 * Convierte un registro de auditoría en una frase que se lee de un vistazo
 * (Fase 9.5, 5C).
 *
 * El administrador no debe interpretar `{"field":"price","old":"29.90"}`. Lee
 * "Precio: 29,90 € → 34,90 €". El formato del importe lo pone quien llama,
 * porque depende del mercado; aquí solo se decide QUÉ frase es.
 *
 * Sin I/O: ejecutable con `node --test` (DEC-025).
 */
export function describeChange(
  entry: Pick<ChangeEntry, "field" | "oldValue" | "newValue" | "source">,
  formatMoney: (amount: number) => string,
): string {
  switch (entry.field) {
    case "status":
      // El estado ya es una frase por sí mismo: "Publicado" dice más que
      // "Estado: draft → active".
      return PRODUCT_STATUS_PHRASES[entry.newValue ?? ""] ?? "Estado cambiado";

    case "deleted_at":
      return entry.newValue === null ? "Producto restaurado" : "Producto eliminado";

    case "price": {
      const before = numeric(entry.oldValue);
      const after = numeric(entry.newValue);
      if (!Number.isFinite(before) || !Number.isFinite(after)) return "Precio cambiado";
      return `Precio: ${formatMoney(before)} → ${formatMoney(after)}`;
    }

    case "stock": {
      const before = numeric(entry.oldValue);
      const after = numeric(entry.newValue);
      if (!Number.isFinite(before) || !Number.isFinite(after)) return "Stock cambiado";
      // La reposición se dice como lo que fue —una entrada de mercancía— y no
      // como un salto de números. La corrección, al revés: lo importante es
      // que alguien decidió que el valor real era otro.
      if (entry.source === "reposicion") {
        const delta = after - before;
        const signo = delta > 0 ? "+" : "";
        return `Repuso ${signo}${delta} uds (${before} → ${after})`;
      }
      return `Stock corregido: ${before} → ${after}`;
    }
  }
}

/** `true` si el cambio merece destacarse en rojo: solo lo que quita venta. */
export function isCriticalChange(entry: Pick<ChangeEntry, "field" | "newValue">): boolean {
  if (entry.field === "deleted_at") return entry.newValue !== null;
  if (entry.field === "status") return entry.newValue !== "active";
  return false;
}
