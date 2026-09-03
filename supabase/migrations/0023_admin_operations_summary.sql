-- Fase 9.5 — Incremento 2: agregados del panel en PostgreSQL + índices medidos.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ÍNDICES: SOLO LOS QUE LA MEDICIÓN JUSTIFICA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Medido con `EXPLAIN (ANALYZE, BUFFERS)` sobre 5.000 pedidos reales generados
-- como fixture en el proyecto Supabase y borrados después. Los tres resultados:
--
--   (a) `orders (market_id, status, created_at desc)` — SE AÑADE.
--       El listado filtrado por estado usaba `idx_orders_created_at` y
--       descartaba filas a mano: "Rows Removed by Filter: 140" para devolver
--       20. Con el compuesto, ambas columnas entran en el `Index Cond` y el
--       coste del nodo baja de 204,98 a 65,29. El filtro desaparece.
--
--   (b) `orders (market_id, created_at desc)` — NO SE AÑADE.
--       Estaba en el plan de la fase y la medición lo desmintió: el planificador
--       NO lo elige. Para el listado sin filtro de estado sigue prefiriendo
--       `idx_orders_created_at` con un filtro por mercado que hoy no descarta
--       casi nada, porque solo hay un mercado con datos. Crearlo sería pagar
--       escritura en cada pedido a cambio de nada. Cuando CO se active y tenga
--       volumen, se vuelve a medir.
--
--   (c) `idx_orders_market_status` — SE ELIMINA.
--       Es prefijo estricto de (a). Comprobado quitándolo y volviendo a medir:
--       el agregado por estado sigue resolviéndose con un Index Only Scan,
--       ahora sobre el compuesto. Mantenerlo solo encarecería cada INSERT de
--       pedido. No se conserva "por si acaso".
--
--   (d) `products (market_id) where deleted_at is null` — SE AÑADE.
--       El panel lista TODOS los productos vivos, incluidos borradores y
--       archivados. `idx_products_public` no sirve para eso: es parcial sobre
--       `status = 'active'`. Este índice es el que usan el catálogo, el
--       inventario y los recuentos de salud de abajo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. `admin_operations_summary`: por qué existe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `countOrdersByStatus()` hacía `select status from orders where market_id = ?`
-- SIN LÍMITE y contaba en JavaScript. En la base es barato —Index Only Scan,
-- ~1,2 ms— pero **transfiere una fila por pedido existente** a través de la red
-- para producir ocho números. Con los 5.000 pedidos del fixture son 5.000 filas
-- serializadas en cada carga del panel; el coste crece con la tienda y no tiene
-- techo. Ese, y no el plan de ejecución, es el problema real.
--
-- Esta función devuelve un único `jsonb` de tamaño fijo. Y de paso resuelve los
-- recuentos de salud del catálogo, que hoy exigían descargar el catálogo entero
-- (`listLowStockVariants` llamaba a `listProductsForAdmin`).
--
-- `SECURITY INVOKER`: RLS sigue aplicándose dentro, igual que en
-- `admin_update_order_status` y `admin_create_variant_matrix`. No hace falta
-- ningún privilegio extra y `lib/supabase/admin.ts` sigue sin existir.
--
-- `p_market_id` lo pone el SERVIDOR desde `getActiveMarket()`, nunca un
-- formulario. Aun así se comprueba `is_admin()` aquí dentro: un no-admin no
-- debe obtener ceros silenciosos, debe obtener un error.

-- ── 1. Índices ─────────────────────────────────────────────────────────────

create index if not exists idx_orders_market_status_created
  on public.orders (market_id, status, created_at desc);

drop index if exists public.idx_orders_market_status;

create index if not exists idx_products_market_alive
  on public.products (market_id)
  where deleted_at is null;

-- ── 2. Resumen operativo ───────────────────────────────────────────────────

create or replace function public.admin_operations_summary(p_market_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_by_status jsonb;
  v_oldest_waiting timestamptz;
  v_low_stock int;
  v_unsellable int;
  v_orders_total int;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- Ocho contadores en una pasada. `jsonb_object_agg` no emite claves para los
  -- estados sin pedidos: el llamante rellena los que falten con 0.
  select
    coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb),
    coalesce(sum(s.n), 0)
  into v_by_status, v_orders_total
  from (
    select status, count(*) as n
    from public.orders
    where market_id = p_market_id
    group by status
  ) s;

  -- El pedido más antiguo que espera respuesta del negocio. `pending` y
  -- `contacted` son los dos estados en los que la pelota está en el tejado de
  -- la tienda; el resto esperan al cliente o a la logística.
  select min(created_at) into v_oldest_waiting
  from public.orders
  where market_id = p_market_id
    and status in ('pending', 'contacted');

  -- Variantes activas de productos publicados que están en su umbral o por
  -- debajo. Antes esto exigía traerse el catálogo entero a memoria.
  select count(*) into v_low_stock
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where p.market_id = p_market_id
    and p.status = 'active'
    and p.deleted_at is null
    and v.is_active
    and v.stock <= v.low_stock_threshold;

  -- Productos PUBLICADOS que no se pueden comprar: ninguna variante activa con
  -- stock. Es el fallo que descubre el cliente, no el dueño.
  select count(*) into v_unsellable
  from public.products p
  where p.market_id = p_market_id
    and p.status = 'active'
    and p.deleted_at is null
    and not exists (
      select 1 from public.product_variants v
      where v.product_id = p.id and v.is_active and v.stock > 0
    );

  return jsonb_build_object(
    'by_status', v_by_status,
    'orders_total', v_orders_total,
    'oldest_waiting_at', v_oldest_waiting,
    'low_stock_variants', v_low_stock,
    'unsellable_products', v_unsellable
  );
end;
$$;

comment on function public.admin_operations_summary(text) is
  'Fase 9.5. Resumen operativo del panel en UNA llamada y con un jsonb de tamano fijo. Sustituye a countOrdersByStatus, que descargaba una fila por pedido para contar ocho numeros. SECURITY INVOKER: RLS sigue filtrando dentro.';

revoke all on function public.admin_operations_summary(text) from public;
grant execute on function public.admin_operations_summary(text) to authenticated;
