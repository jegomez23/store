/**
 * Lógica pura del dominio de pedidos en el panel (Fase 7).
 *
 * IMPORTANTE — QUÉ ES Y QUÉ NO ES ESTE ARCHIVO: la máquina de estados
 * AUTORITATIVA vive en `public.admin_update_order_status` (migración 0019,
 * DEC-032). Lo de aquí es un ESPEJO, y solo sirve para dos cosas: decidir qué
 * botones pintar y validar pronto para dar mejor error. Ninguna comprobación de
 * este archivo protege nada: la RPC vuelve a validarlo todo contra el pedido
 * real y bajo bloqueo de fila.
 *
 * Hay un test que compara esta tabla con la de la migración SQL, para que no
 * puedan divergir en silencio.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

export const ORDER_STATUSES = [
  "pending",
  "contacted",
  "confirmed",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

// TODO(i18n): mover a lib/i18n cuando exista el módulo (DEC-013).
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente",
  contacted: "Contactado",
  confirmed: "Confirmado",
  paid: "Pagado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

/**
 * Transiciones permitidas (docs/05-ADMIN.md §4.4). Debe coincidir EXACTAMENTE
 * con el `case` de la migración 0019.
 *
 *   pending → contacted → confirmed → paid → preparing → shipped → delivered
 *   cualquiera (excepto delivered) → cancelled
 *
 * `delivered` y `cancelled` son terminales.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["contacted", "cancelled"],
  contacted: ["confirmed", "cancelled"],
  confirmed: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function nextStatusesFor(status: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** `paid` exige confirmación explícita del admin; jamás es automático. */
export function requiresPaymentConfirmation(to: OrderStatus): boolean {
  return to === "paid";
}

/** Cancelar devuelve stock (DEC-033): la UI debe avisarlo antes de confirmar. */
export function restoresStock(to: OrderStatus): boolean {
  return to === "cancelled";
}

// ──────────────────────────────────────────────── Cola operativa (Fase 9.5)

/** Estados TERMINALES según la migración 0019: no admiten ninguna salida. */
export const TERMINAL_STATUSES = ["delivered", "cancelled"] as const;

export function isTerminal(status: OrderStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Estados ABIERTOS: los seis que todavía tienen alguna transición posible.
 *
 * No es una regla de negocio nueva: se deriva de `ALLOWED_TRANSITIONS`, que a
 * su vez es espejo de la máquina de estados de PostgreSQL. Un pedido abierto
 * es, literalmente, uno que aún puede moverse.
 */
export const OPEN_STATUSES: readonly OrderStatus[] = ORDER_STATUSES.filter(
  (status) => ALLOWED_TRANSITIONS[status].length > 0,
);

/**
 * Transición que se puede ofrecer con UN SOLO CLIC desde el listado.
 *
 * Se excluyen a propósito dos clases de destino, y ambas exclusiones salen de
 * reglas que YA existen, no de un criterio inventado:
 *
 *   1. `paid` — la función SQL `admin_update_order_status` EXIGE el argumento
 *      `p_payment_confirmed`. Marcar un pedido como pagado nunca es automático
 *      (`05-ADMIN.md` §4.4), así que no puede caber en un clic.
 *   2. `delivered` y `cancelled` — son TERMINALES. Una acción irreversible
 *      merece la pantalla de detalle y su confirmación; `cancelled` además
 *      devuelve stock (DEC-033).
 *
 * Quedan cuatro atajos, todos reversibles hacia delante y sin efectos
 * colaterales: pending→contacted, contacted→confirmed, paid→preparing,
 * preparing→shipped.
 *
 * Esto decide qué BOTÓN se pinta, no qué es legal: la autoridad sigue siendo
 * la función SQL, que revalida todo con la fila del pedido bloqueada.
 */
export function quickNextStatus(status: OrderStatus): OrderStatus | null {
  const candidate = ALLOWED_TRANSITIONS[status].find(
    (next) => !requiresPaymentConfirmation(next) && !isTerminal(next),
  );
  return candidate ?? null;
}

// ─────────────────────────────────────────────────────── Filtros del listado

export const ORDERS_PAGE_SIZE = 20;
/** Tope duro: ni un `?page=99999` puede pedir un rango absurdo. */
const MAX_PAGE = 500;
const MAX_QUERY_LENGTH = 40;

export interface OrderListParams {
  status: OrderStatus | null;
  /** Búsqueda por número de pedido, ya normalizada. */
  query: string | null;
  /** 1-indexado. */
  page: number;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normaliza los `searchParams` del listado. Todo lo que no encaje se descarta
 * en silencio y cae al valor por defecto: los filtros son UX, no seguridad, y
 * un parámetro basura nunca debe romper la página ni llegar a la query.
 */
export function parseOrderListParams(
  searchParams: Record<string, string | string[] | undefined>,
): OrderListParams {
  const rawStatus = firstValue(searchParams.estado);
  const rawQuery = firstValue(searchParams.q);
  const rawPage = firstValue(searchParams.pagina);

  const page = Number.parseInt(rawPage ?? "", 10);

  return {
    status: isOrderStatus(rawStatus) ? rawStatus : null,
    query: normalizeOrderQuery(rawQuery),
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/**
 * La búsqueda es por número de pedido (`YI-ES-000001`). Se recortan los
 * caracteres que no forman parte del formato: además de limpiar la entrada,
 * evita que `%`, `_`, `,` o `*` lleguen al patrón `ilike` de PostgREST y
 * cambien su significado.
 */
export function normalizeOrderQuery(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, MAX_QUERY_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

export function totalPages(count: number): number {
  return Math.max(1, Math.ceil(count / ORDERS_PAGE_SIZE));
}

/** Construye el querystring del listado conservando los filtros vigentes. */
export function ordersHref(
  params: Partial<OrderListParams> & { page?: number },
): string {
  const search = new URLSearchParams();
  if (params.status) search.set("estado", params.status);
  if (params.query) search.set("q", params.query);
  if (params.page && params.page > 1) search.set("pagina", String(params.page));
  const qs = search.toString();
  return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
}
