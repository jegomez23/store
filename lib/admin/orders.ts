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
  /**
   * Lo que el administrador escribió, ya saneado. Puede ser un número de
   * pedido, un teléfono o un nombre: quién decide qué es no es esta capa
   * (ver `orderSearchTokens`). Vuelve tal cual al input y a la URL.
   */
  query: string | null;
  /**
   * El administrador escribió algo y NO quedó nada utilizable tras sanear
   * (por ejemplo `%` o `***`).
   *
   * Sin esto, esa búsqueda se comportaba como "no he buscado nada" y la
   * pantalla devolvía **el listado entero**, que se lee como "tu búsqueda ha
   * encontrado todo". Medido sobre el build servido antes de corregirlo: `%`
   * devolvía los tres pedidos de prueba. Buscar algo inservible tiene que dar
   * cero resultados y decir por qué.
   */
  unusableQuery: boolean;
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
  const query = sanitizeOrderSearch(rawQuery);

  return {
    status: isOrderStatus(rawStatus) ? rawStatus : null,
    query,
    unusableQuery: (rawQuery ?? "").trim().length > 0 && query === null,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/**
 * Normaliza un NÚMERO de pedido (`YI-ES-000001`). Se recortan los caracteres
 * que no forman parte del formato: además de limpiar la entrada, evita que
 * `%`, `_`, `,` o `*` lleguen al patrón `ilike` de PostgREST y cambien su
 * significado.
 *
 * La usan el detalle (`/admin/pedidos/[numero]`) y la action de cambio de
 * estado, donde lo que llega ES un número de pedido y nada más. **El buscador
 * del listado ya no la usa**: ver `sanitizeOrderSearch`.
 */
export function normalizeOrderQuery(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, MAX_QUERY_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

// ───────────────────────────────────────────── Buscador del listado (P3)

/**
 * Sanea lo que el administrador escribe en el buscador de pedidos.
 *
 * POR QUÉ NO SIRVE `normalizeOrderQuery` AQUÍ: pasa todo a mayúsculas y borra
 * espacios y acentos, que es correcto para `YI-ES-000001` y destruye un nombre
 * ("Ana Pérez" quedaba en "ANAPREZ"). El buscador tiene que admitir tres
 * cosas —número, teléfono y nombre— así que conserva el texto y se limita a
 * quitar lo que podría cambiar el significado de la consulta.
 *
 * QUÉ SE QUITA Y POR QUÉ, que no es cosmético:
 *   · `%` y `_`   — comodines de LIKE en PostgreSQL.
 *   · `*`         — comodín de `ilike` en la sintaxis de PostgREST.
 *   · `,` `(` `)` `.` — separan y agrupan en el `or=(…)` de PostgREST: con
 *     ellos dentro, el texto del usuario dejaría de ser un valor y pasaría a
 *     ser estructura de la consulta.
 *   · `\` y comillas — por no dejar ningún escape suelto.
 *
 * Se CONSERVAN letras con tilde y con ñ, espacios, guiones y apóstrofos,
 * porque son parte legítima de un nombre.
 */
export function sanitizeOrderSearch(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[^\p{L}\p{N} '-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Los tres patrones que salen de UNA caja de búsqueda.
 *
 * No hay heurística: no se adivina si lo escrito "parece un teléfono" o "parece
 * un número de pedido". Se buscan **las tres cosas a la vez** y se devuelve la
 * unión, porque adivinar falla justo en el caso ambiguo — `000003` es a la vez
 * un trozo de número de pedido y un trozo de teléfono plausible.
 *
 * `digits` va aparte porque `customers.phone` se guarda **solo con dígitos**
 * (`create_order` hace `regexp_replace(..., '[^0-9]', '', 'g')`), así que pegar
 * "+34 600 111 222" del chat no casaría nunca con un `ilike` del texto crudo.
 *
 * Sin I/O: ejecutable con `node --test` (DEC-025).
 */
export interface OrderSearchTokens {
  /** Para `orders.order_number`. Mayúsculas, solo `[A-Z0-9-]`. */
  orderNumber: string | null;
  /** Para `customers.phone`. Solo dígitos. */
  digits: string | null;
  /** Para `customers.name`. El texto tal cual lo escribió. */
  name: string | null;
}

export function orderSearchTokens(query: string | null): OrderSearchTokens {
  if (!query) return { orderNumber: null, digits: null, name: null };

  const orderNumber = query.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const digits = query.replace(/\D/g, "");

  return {
    orderNumber: orderNumber.length > 0 ? orderNumber : null,
    digits: digits.length > 0 ? digits : null,
    name: query,
  };
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
