import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  OPEN_STATUSES,
  ORDERS_PAGE_SIZE,
  isOrderStatus,
  type OrderListParams,
  type OrderStatus,
} from "@/lib/admin/orders";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Capa de datos administrativa de pedidos (DEC-034).
 *
 * - Usa `lib/supabase/server.ts`: anon key + la sesión del admin en cookies.
 *   **NO se usa la service role key**: así RLS sigue filtrando cada fila y un
 *   error de código no puede filtrar datos privados.
 * - Los componentes nunca llaman a Supabase; solo consumen estas funciones
 *   (docs/rules/backend.md #5).
 * - Todas filtran por `market_id`: el panel no mezcla ES y CO (DEC-008).
 * - `select` explícito por caso de uso, nunca `select *`.
 *
 * GUARD EN CADA FUNCIÓN, no solo en el layout — hallazgo real de Fase 7: en
 * RSC el layout y la página se renderizan EN PARALELO. Que el layout devuelva
 * "Acceso denegado" sin pintar sus `children` no impide que la página hermana se
 * haya renderizado, y su payload viaja igualmente en el HTML. Se comprobó
 * sirviendo el build: el HTML que recibe un usuario sin rol contiene el árbol
 * de la página. Hoy no filtra ni un dato porque RLS devuelve 0 filas al no ser
 * admin, pero apoyarse solo en eso es exactamente la barrera única que
 * DEC-031 prohíbe. Estas funciones devuelven vacío antes de consultar nada.
 *
 * Un pedido histórico se representa SIEMPRE con los snapshots guardados en
 * `order_items` (nombre, color, talla, SKU, precio unitario). No se hace join
 * con el catálogo vivo: si mañana sube el precio o se renombra el producto, el
 * pedido debe seguir mostrando lo que se vendió.
 */

/** `numeric` de PostgreSQL llega como string por PostgREST (no perder precisión). */
function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function toStatus(value: string): OrderStatus {
  // El CHECK de la tabla ya lo garantiza; esto solo estrecha el tipo sin `as`.
  return isOrderStatus(value) ? value : "pending";
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  createdAt: string;
  /**
   * Antigüedad del ESTADO actual (Fase 9.5, 5A). El mismo dato que la cola del
   * resumen ya usaba: el único `UPDATE` sobre `orders` en todo el proyecto es
   * el de `admin_update_order_status`, sellado por el trigger `set_updated_at`.
   * Sin él, filtrar el listado por "Contactado" devuelve una lista plana en la
   * que nada distingue lo que lleva parado una hora de lo que lleva cuatro días.
   */
  stateSince: string;
  status: OrderStatus;
  channel: string;
  currencyCode: string;
  total: number;
  customerName: string | null;
  customerPhone: string;
  lineCount: number;
  unitCount: number;
}

export interface AdminOrderListResult {
  orders: AdminOrderListItem[];
  /** Total de pedidos que casan con el filtro, no los de esta página. */
  count: number;
}

export async function listOrders(
  market: ActiveMarket,
  params: OrderListParams,
): Promise<AdminOrderListResult> {
  if (!(await requireAdmin())) return { orders: [], count: 0 };

  const supabase = await createClient();

  const from = (params.page - 1) * ORDERS_PAGE_SIZE;

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, created_at, updated_at, status, channel, currency_code, total, customer:customers(name, phone), order_items(quantity)",
      { count: "exact" },
    )
    .eq("market_id", market.id)
    .order("created_at", { ascending: false })
    .range(from, from + ORDERS_PAGE_SIZE - 1);

  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.query) {
    // `params.query` viene de `normalizeOrderQuery`, que ya eliminó `%`, `_`,
    // `,` y `*` — los caracteres que cambiarían el significado del patrón.
    query = query.ilike("order_number", `%${params.query}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar los pedidos: ${error.message}`);
  }

  return {
    count: count ?? 0,
    orders: (data ?? []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      createdAt: row.created_at,
      stateSince: row.updated_at,
      status: toStatus(row.status),
      channel: row.channel,
      currencyCode: row.currency_code,
      total: toNumber(row.total),
      customerName: row.customer?.name ?? null,
      customerPhone: row.customer?.phone ?? "",
      lineCount: row.order_items.length,
      unitCount: row.order_items.reduce((sum, item) => sum + item.quantity, 0),
    })),
  };
}

export interface QueueOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Cuándo entró el pedido. */
  createdAt: string;
  /**
   * Cuándo cambió de estado por última vez. Auditado en la Fase 9.5: el
   * ÚNICO `UPDATE` sobre `orders` en todo el proyecto es el de
   * `admin_update_order_status` (migración 0019), y el trigger `set_updated_at`
   * lo sella. En un pedido que nunca se movió coincide con `created_at`.
   * Es, por tanto, la antigüedad exacta del estado actual — sin join a
   * `order_events` y sin consulta extra.
   */
  stateSince: string;
  currencyCode: string;
  total: number;
  customerName: string | null;
  customerPhone: string;
}

/**
 * Cola operativa: los pedidos que siguen abiertos, el que lleva más tiempo sin
 * moverse primero (Fase 9.5, Incremento 3).
 *
 * QUÉ ENTRA: los seis estados con alguna transición posible. `delivered` y
 * `cancelled` son terminales y no representan trabajo, así que no compiten por
 * la atención del admin.
 *
 * CÓMO SE ORDENA: por `updated_at` ascendente, es decir, por antigüedad del
 * estado actual. **Es un hecho, no un juicio.** El panel no marca nada como
 * "atrasado" ni "urgente": eso exigiría un umbral que el negocio no ha
 * definido. Ordenar por antigüedad da la misma utilidad sin afirmar nada.
 *
 * El filtro y el orden los resuelve PostgreSQL, con `limit` explícito. Nada de
 * traerse los pedidos para ordenarlos en JavaScript.
 */
export async function listOperationalQueue(
  market: ActiveMarket,
  limit = 8,
): Promise<QueueOrder[]> {
  if (!(await requireAdmin())) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, created_at, updated_at, currency_code, total, customer:customers(name, phone)",
    )
    .eq("market_id", market.id)
    .in("status", OPEN_STATUSES)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`No se pudo cargar la cola de pedidos: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: toStatus(row.status),
    createdAt: row.created_at,
    stateSince: row.updated_at,
    currencyCode: row.currency_code,
    total: toNumber(row.total),
    customerName: row.customer?.name ?? null,
    customerPhone: row.customer?.phone ?? "",
  }));
}

export interface AdminOrderLine {
  id: string;
  productName: string;
  colorName: string | null;
  sizeLabel: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** `null` si la variante fue borrada del catálogo (ON DELETE SET NULL). */
  variantId: string | null;
}

export interface AdminOrderEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
  actorId: string | null;
}

export interface AdminOrderNote {
  id: string;
  body: string;
  createdAt: string;
  actorId: string;
  /** `full_name` del perfil que la firmó; `null` si el admin no lo tiene puesto. */
  authorName: string | null;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  channel: string;
  sourceUrl: string | null;
  /*
    NO hay campo `notes`. La columna `orders.notes` existe en el esquema desde
    la migración 0011, nadie la escribe nunca —`create_order` no la toca— y
    hasta la Fase 9.5 viajaba desde el `select` hasta este tipo para no
    pintarse en ninguna pantalla. Las notas internas son `internalNotes`, con
    autor y fecha (migración 0027). Se retira de aquí para que nadie vuelva a
    confundirlas.
  */
  currencyCode: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  customerName: string | null;
  customerPhone: string;
  customerEmail: string | null;
  lines: AdminOrderLine[];
  events: AdminOrderEvent[];
  /**
   * Notas internas (0027). Se llama así y no `notes` para no chocar con
   * `orders.notes`, la columna `text` que nadie escribe nunca.
   */
  internalNotes: AdminOrderNote[];
  /**
   * Pedidos totales de este cliente en este mercado, INCLUIDO el actual.
   * `customers` es única por `(market_id, phone)`, así que el cliente que
   * vuelve es la misma fila y el recuento es exacto, no una heurística.
   */
  customerOrderCount: number;
}

export async function getOrderByNumber(
  market: ActiveMarket,
  orderNumber: string,
): Promise<AdminOrderDetail | null> {
  if (!(await requireAdmin())) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, created_at, updated_at, status, channel, source_url,
       currency_code, subtotal, discount_total, shipping_total, total, customer_id,
       customer:customers(name, phone, email),
       order_items(id, product_name, color_name, size_label, sku, unit_price, quantity, line_total, variant_id),
       order_events(id, from_status, to_status, note, created_at, actor_id),
       order_notes(id, body, created_at, actor_id, author:profiles(full_name))`,
    )
    .eq("market_id", market.id)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el pedido: ${error.message}`);
  }
  if (!data) return null;

  /*
    Recuento de pedidos del cliente. Es UNA consulta más, no una por fila: esta
    función carga un único pedido, así que no hay N+1 posible. Se pide con
    `head: true`, de modo que PostgreSQL cuenta y **no viaja ni una fila** —
    solo la cabecera `Content-Range`. Se apoya en `idx_orders_customer_id`
    (migración 0011).

    Filtrado además por mercado: dos mercados no comparten cliente, pero
    apoyarse en eso sería la barrera única que DEC-031 prohíbe.
  */
  const { count: customerOrderCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("market_id", market.id)
    .eq("customer_id", data.customer_id);

  return {
    id: data.id,
    orderNumber: data.order_number,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    status: toStatus(data.status),
    channel: data.channel,
    sourceUrl: data.source_url,
    currencyCode: data.currency_code,
    subtotal: toNumber(data.subtotal),
    discountTotal: toNumber(data.discount_total),
    shippingTotal: toNumber(data.shipping_total),
    total: toNumber(data.total),
    customerName: data.customer?.name ?? null,
    customerPhone: data.customer?.phone ?? "",
    customerEmail: data.customer?.email ?? null,
    lines: data.order_items.map((item) => ({
      id: item.id,
      productName: item.product_name,
      colorName: item.color_name,
      sizeLabel: item.size_label,
      sku: item.sku,
      unitPrice: toNumber(item.unit_price),
      quantity: item.quantity,
      lineTotal: toNumber(item.line_total),
      variantId: item.variant_id,
    })),
    // Orden cronológico: el historial se lee de arriba abajo.
    events: data.order_events
      .map((event) => ({
        id: event.id,
        fromStatus: event.from_status ? toStatus(event.from_status) : null,
        toStatus: toStatus(event.to_status),
        note: event.note,
        createdAt: event.created_at,
        actorId: event.actor_id,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    // Sin ordenar aquí: `buildTimeline` mezcla notas y eventos en un solo hilo
    // y define el desempate. Ordenarlas dos veces solo escondería el criterio.
    internalNotes: data.order_notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.created_at,
      actorId: note.actor_id,
      authorName: note.author?.full_name ?? null,
    })),
    customerOrderCount: customerOrderCount ?? 0,
  };
}

/**
 * Escribe una nota interna (Fase 9.5, Incremento 5A).
 *
 * TRES COSAS QUE NO SE ACEPTAN DEL CLIENTE, y ninguna se protege desde la UI:
 *
 *   1. **El pedido.** No llega un `orderId`: llega el NÚMERO de pedido, y se
 *      resuelve contra `orders` filtrando por el mercado activo del servidor.
 *      Un UUID de otro mercado enviado a mano no encuentra fila.
 *   2. **El autor.** No se envía `actor_id`. Lo pone el DEFAULT `auth.uid()` de
 *      la migración 0027, y la policy de INSERT exige además que coincida con
 *      `auth.uid()`: firmar como otro admin es imposible incluso por POST
 *      directo a PostgREST.
 *   3. **El mercado.** Nunca viaja en el formulario (DEC-035).
 *
 * Devuelve `false` si el pedido no existe en este mercado.
 */
export async function addOrderNote(
  market: ActiveMarket,
  orderNumber: string,
  body: string,
): Promise<boolean> {
  if (!(await requireAdmin())) return false;

  const supabase = await createClient();

  const { data: order, error: lookupError } = await supabase
    .from("orders")
    .select("id")
    .eq("market_id", market.id)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`No se pudo comprobar el pedido: ${lookupError.message}`);
  }
  if (!order) return false;

  // `actor_id` deliberadamente ausente del payload: lo pone la base.
  const { error } = await supabase
    .from("order_notes")
    .insert({ order_id: order.id, body });

  if (error) {
    throw new Error(`No se pudo guardar la nota: ${error.message}`);
  }
  return true;
}

export interface OperationsSummary {
  byStatus: Record<OrderStatus, number>;
  ordersTotal: number;
  /** `created_at` del pedido más antiguo que espera respuesta del negocio. */
  oldestWaitingAt: string | null;
  lowStockVariants: number;
  /** Productos publicados sin ninguna variante activa con stock. */
  unsellableProducts: number;
}

function emptyCounts(): Record<OrderStatus, number> {
  return {
    pending: 0,
    contacted: 0,
    confirmed: 0,
    paid: 0,
    preparing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
}

const EMPTY_SUMMARY: OperationsSummary = {
  byStatus: emptyCounts(),
  ordersTotal: 0,
  oldestWaitingAt: null,
  lowStockVariants: 0,
  unsellableProducts: 0,
};

/**
 * Resumen operativo del panel (Fase 9.5, migración 0023).
 *
 * SUSTITUYE A `countOrdersByStatus`, que hacía
 * `select status from orders where market_id = ?` **sin límite** y contaba en
 * JavaScript. En la base era barato (Index Only Scan, ~1,2 ms medidos sobre
 * 5.000 pedidos), pero transfería **una fila por pedido existente** para
 * producir ocho números, y ese coste crecía sin techo con la tienda.
 *
 * Ahora PostgreSQL agrega y devuelve un único `jsonb` de tamaño fijo, que
 * además trae los recuentos de salud del catálogo — antes había que descargar
 * el catálogo entero para calcularlos.
 *
 * La RPC lanza `FORBIDDEN` si quien llama no es admin. Aquí se devuelve el
 * resumen vacío en vez de propagar: el guard de `requireAdmin()` ya cortó
 * antes, así que llegar aquí sin rol solo puede pasar si algo falla, y en ese
 * caso el panel debe mostrar ceros, no una pantalla de error.
 */
export async function getOperationsSummary(
  market: ActiveMarket,
): Promise<OperationsSummary> {
  if (!(await requireAdmin())) return EMPTY_SUMMARY;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_operations_summary", {
    p_market_id: market.id,
  });

  if (error) {
    console.error("[admin] admin_operations_summary falló", {
      marketId: market.id,
      code: error.code,
      message: error.message,
    });
    return EMPTY_SUMMARY;
  }

  const raw = (data ?? {}) as {
    by_status?: Record<string, number>;
    orders_total?: number;
    oldest_waiting_at?: string | null;
    low_stock_variants?: number;
    unsellable_products?: number;
  };

  // `jsonb_object_agg` omite los estados sin pedidos: se rellenan aquí para que
  // la UI no tenga que distinguir entre "cero" y "ausente".
  const byStatus = emptyCounts();
  for (const [status, count] of Object.entries(raw.by_status ?? {})) {
    if (isOrderStatus(status)) byStatus[status] = Number(count) || 0;
  }

  return {
    byStatus,
    ordersTotal: Number(raw.orders_total) || 0,
    oldestWaitingAt: raw.oldest_waiting_at ?? null,
    lowStockVariants: Number(raw.low_stock_variants) || 0,
    unsellableProducts: Number(raw.unsellable_products) || 0,
  };
}
