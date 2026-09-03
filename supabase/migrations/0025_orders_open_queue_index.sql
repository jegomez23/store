-- Fase 9.5 — Incremento 3: índice de la cola operativa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA CONSULTA QUE LO PIDE
-- ═══════════════════════════════════════════════════════════════════════════
--
--   select ... from orders
--   where market_id = ? and status in (los seis estados abiertos)
--   order by updated_at asc
--   limit 8
--
-- Es la consulta más cargada del panel: se ejecuta en cada visita al resumen.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EVIDENCIA (medida, no razonada)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `EXPLAIN (ANALYZE, BUFFERS)` sobre 5.000 pedidos reales generados como
-- fixture y borrados después. De ellos 3.750 abiertos:
--
--   SIN este índice
--     Limit → Sort (top-N heapsort) → Index Scan usando
--     idx_orders_market_status_created, que lee LAS 3.750 FILAS ABIERTAS para
--     quedarse con 8.
--     Buffers: 555 · Execution Time: 7,255 ms
--
--   CON este índice
--     Limit → Index Scan, se detiene a las 8 filas. El nodo `Sort` desaparece.
--     Buffers: 3 · Execution Time: 0,088 ms
--
--   ×82 más rápido y 185 veces menos páginas leídas.
--
-- El índice existente `idx_orders_market_status_created` NO sirve aquí: ordena
-- por `created_at`, y la cola necesita ordenar por `updated_at` —la antigüedad
-- del ESTADO ACTUAL—, así que obligaba a materializar y ordenar todo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ PARCIAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Solo indexa los pedidos ABIERTOS, que son un subconjunto que se limita solo:
-- cada pedido acaba en `delivered` o `cancelled` y sale del índice. Un pedido
-- entregado hace un año no ocupa espacio ni encarece escrituras aquí. El
-- histórico, que sí crece sin techo, se queda fuera.
--
-- El predicado repite los seis estados en literal en vez de derivarlos: el
-- predicado de un índice parcial tiene que ser inmutable. Si algún día se
-- añadiera un estado a la máquina de estados de la migración 0019, HAY QUE
-- revisar este índice — por eso queda dicho aquí.

create index if not exists idx_orders_open_queue
  on public.orders (market_id, updated_at)
  where status in ('pending', 'contacted', 'confirmed', 'paid', 'preparing', 'shipped');

comment on index public.idx_orders_open_queue is
  'Fase 9.5. Cola operativa: pedidos abiertos por antiguedad del estado actual. Parcial a proposito: los terminales no entran. Si cambia la maquina de estados (0019), revisar el predicado.';
