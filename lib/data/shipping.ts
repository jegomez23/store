import { createClient } from "@/lib/supabase/static";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import type { ShippingMethodOption } from "@/lib/checkout/shipping";
import type { ActiveMarket } from "@/lib/markets";

/**
 * Métodos de entrega disponibles (incremento 8).
 *
 * Cliente ANÓNIMO: usa `lib/supabase/static` (anon key, sin cookies), igual que
 * el resto del catálogo público. La policy `public_read_active_shipping_methods`
 * ya deja leer los activos de un mercado activo desde la 0020, así que **no hace
 * falta ninguna policy nueva**.
 *
 * Se filtra por mercado en la consulta además de por RLS: los métodos SÍ son
 * por mercado (`shipping_methods.market_id` NOT NULL), y apoyarse solo en que
 * hoy únicamente ES esté activo sería la barrera única que DEC-031 prohíbe.
 *
 * El orden lo pone PostgreSQL (`sort_order`, y `name` para desempatar): la UI
 * no reordena nada.
 */
export async function listShippingMethods(
  market: ActiveMarket,
): Promise<ShippingMethodOption[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("shipping_methods")
    .select("id, name, description, price, free_shipping_threshold")
    .eq("market_id", market.id)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) {
    // El checkout no puede quedarse sin métodos por un fallo de red: se
    // devuelve vacío y la pantalla lo dice, en vez de reventar.
    console.error("[checkout] no se pudieron cargar los métodos de envío", {
      marketId: market.id,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    // `numeric` llega como string por PostgREST para no perder precisión.
    price: toNumber(row.price),
    freeShippingThreshold:
      row.free_shipping_threshold === null ? null : toNumber(row.free_shipping_threshold),
  }));
}

/** `numeric` de PostgreSQL llega como string por PostgREST. */
function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

/* ──────────────────── Administración de los métodos (incremento 9) ────────
 *
 * `listShippingMethods` de arriba alimenta el CHECKOUT y por eso filtra
 * `is_active`: un método retirado no puede ofrecerse a un cliente. Esta otra
 * alimenta el PANEL, donde el administrador tiene que ver también lo que
 * retiró —si no, no podría reactivarlo—. Son dos funciones y no un booleano a
 * propósito, igual que en colores y tallas: el filtro del checkout es una
 * regla, no una opción.
 *
 * Usa `lib/supabase/server` (sesión del admin) y `requireAdmin()`, no el
 * cliente anónimo: aquí se leen filas que el público no debe ver.
 */

export interface AdminShippingMethod {
  id: string;
  name: string;
  description: string | null;
  price: number;
  freeShippingThreshold: number | null;
  sortOrder: number;
  isActive: boolean;
  /** Pedidos que YA se hicieron con este método. Ver `listShippingMethodsForAdmin`. */
  orderCount: number;
}

export async function listShippingMethodsForAdmin(
  market: ActiveMarket,
): Promise<AdminShippingMethod[]> {
  if (!(await requireAdmin())) return [];

  const supabase = await createServerClient();

  /*
    El recuento de pedidos viene EMBEBIDO en la misma consulta, no en una por
    fila: `orders(count)` lo resuelve PostgREST con un agregado. Sirve para que
    el panel pueda avisar antes de borrar («este método lo han usado 3 pedidos»)
    sin hacer un N+1 sobre una tabla que crecerá.
  */
  const { data, error } = await supabase
    .from("shipping_methods")
    .select(
      "id, name, description, price, free_shipping_threshold, sort_order, is_active, orders(count)",
    )
    .eq("market_id", market.id)
    .order("sort_order")
    .order("name");

  if (error) {
    throw new Error(`No se pudieron cargar los métodos de entrega: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: toNumber(row.price),
    freeShippingThreshold:
      row.free_shipping_threshold === null ? null : toNumber(row.free_shipping_threshold),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    orderCount: row.orders?.[0]?.count ?? 0,
  }));
}

/**
 * Cuántos métodos de entrega ACTIVOS tiene el mercado (Incremento 15).
 *
 * Es lo único que el estado de venta necesita saber de aquí, así que se cuenta
 * en PostgreSQL con `head: true`: **no viaja ni una fila**. Sin métodos activos
 * el cliente no puede elegir cómo recibe el pedido y el checkout no se puede
 * completar (`lib/store/sale-status.ts`).
 */
export async function countActiveShippingMethods(market: ActiveMarket): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("shipping_methods")
    .select("id", { count: "exact", head: true })
    .eq("market_id", market.id)
    .eq("is_active", true);

  if (error) {
    console.error("[admin] no se pudieron contar los métodos de entrega", {
      marketId: market.id,
      code: error.code,
      message: error.message,
    });
    // Ante la duda se informa de BLOQUEO, no de "todo bien": un falso "lista
    // para vender" es peor que un falso aviso.
    return 0;
  }

  return count ?? 0;
}
