-- Fase 7 — Panel admin: cambio de estado de pedido (DEC-032) y cancelación
-- con restauración de stock (DEC-033).
--
-- POR QUÉ UNA FUNCIÓN Y NO VARIAS LLAMADAS DESDE TYPESCRIPT: cambiar el estado
-- de un pedido son hasta 2 + N escrituras que deben ser atómicas — UPDATE de
-- `orders`, INSERT en `order_events` y, al cancelar, un UPDATE por cada línea
-- para devolver stock. El cliente JS de Supabase no ejecuta transacciones
-- multi-sentencia: si fallara la segunda, el pedido quedaría cambiado sin
-- auditoría, o el stock restaurado a medias.
--
-- POR QUÉ `SECURITY INVOKER` Y NO `DEFINER` (diferencia clave con
-- `create_order` de la migración 0018): `create_order` es DEFINER porque su
-- llamante es ANÓNIMO y no tiene ninguna policy sobre las tablas de pedidos.
-- Aquí el llamante es un admin autenticado que YA tiene policies
-- (`admin_all_orders`, `admin_insert_order_events`, `admin_all_product_variants`).
-- Al ejecutarse como el invocador, **RLS se sigue aplicando fila a fila dentro
-- de la función**: no se abre ninguna vía de bypass. El `is_admin()` del
-- principio es una segunda barrera explícita, no la única.
--
-- REGLA CENTRAL: el cliente solo puede proponer un `order_id`, un estado
-- destino y una nota. Qué transición es legal, si hay que devolver stock y
-- cuánto, lo decide PostgreSQL leyendo el pedido real.

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_to_status text,
  p_note text default null,
  -- `paid` NUNCA es automático (docs/05-ADMIN.md §4.4, KNOWN-CONSTRAINTS).
  -- Exigir un flag explícito hace que ni siquiera una llamada directa a la RPC
  -- pueda marcar un pedido como pagado "de pasada".
  p_payment_confirmed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_actor uuid;
  v_allowed text[];
  v_note text;
  v_item record;
  v_restored_units int := 0;
  v_restored_lines int := 0;
  v_orphan_lines int := 0;
begin
  ---------------------------------------------------------------------------
  -- 1. Autorización. Redundante con RLS a propósito: falla pronto y con un
  --    código propio en vez de con "0 filas afectadas".
  ---------------------------------------------------------------------------
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  v_actor := auth.uid();

  ---------------------------------------------------------------------------
  -- 2. Validación de forma
  ---------------------------------------------------------------------------
  if p_order_id is null then
    raise exception 'INVALID_INPUT'
      using errcode = 'P0001', detail = 'order_id requerido';
  end if;

  if p_to_status is null or p_to_status not in (
    'pending', 'contacted', 'confirmed', 'paid',
    'preparing', 'shipped', 'delivered', 'cancelled'
  ) then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'INVALID_INPUT'
      using errcode = 'P0001', detail = 'nota demasiado larga';
  end if;

  ---------------------------------------------------------------------------
  -- 3. Bloqueo del pedido. `for update` serializa dos admins (o dos pestañas)
  --    intentando cambiar el mismo pedido a la vez: el segundo espera y ve el
  --    estado ya actualizado, así que su transición se valida contra la
  --    realidad. Es lo que hace idempotente la devolución de stock.
  ---------------------------------------------------------------------------
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    -- Cubre tanto "no existe" como "RLS no te deja verlo": mismo error, sin
    -- filtrar cuál de los dos (docs/08-SECURITY.md §1, enumeración).
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 4. Transiciones permitidas (docs/05-ADMIN.md §4.4)
  --      pending → contacted → confirmed → paid → preparing → shipped → delivered
  --      cualquiera (excepto delivered) → cancelled
  --    `delivered` y `cancelled` son terminales. Volver atrás no está
  --    permitido: el historial de `order_events` es append-only y un pedido no
  --    "des-ocurre".
  ---------------------------------------------------------------------------
  v_allowed := case v_order.status
    when 'pending'   then array['contacted', 'cancelled']
    when 'contacted' then array['confirmed', 'cancelled']
    when 'confirmed' then array['paid', 'cancelled']
    when 'paid'      then array['preparing', 'cancelled']
    when 'preparing' then array['shipped', 'cancelled']
    when 'shipped'   then array['delivered', 'cancelled']
    else array[]::text[]
  end;

  if not (p_to_status = any (v_allowed)) then
    raise exception 'TRANSITION_NOT_ALLOWED'
      using errcode = 'P0001',
            detail = format('%s -> %s', v_order.status, p_to_status);
  end if;

  if p_to_status = 'paid' and p_payment_confirmed is not true then
    raise exception 'PAYMENT_NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 5. Cancelación: devolver stock (DEC-033)
  --
  --    El stock se descontó al CREAR el pedido (`create_order`), así que toda
  --    cancelación lo devuelve, venga del estado que venga. Ocurre EXACTAMENTE
  --    UNA VEZ porque solo se llega aquí desde un estado no-cancelled y la fila
  --    del pedido está bloqueada: un doble clic o dos pestañas no pueden
  --    duplicar la devolución.
  --
  --    `order_items.variant_id` es `on delete set null`: una línea cuya
  --    variante ya no existe no puede devolver stock a ningún sitio. No se
  --    inventa nada — se cuenta y se deja constancia en la nota del evento.
  ---------------------------------------------------------------------------
  if p_to_status = 'cancelled' then
    for v_item in
      select oi.variant_id, oi.quantity
        from public.order_items oi
       where oi.order_id = v_order.id
         and oi.variant_id is not null
       -- Mismo orden de bloqueo que en `create_order`: evita deadlocks entre
       -- una cancelación y una compra concurrente sobre las mismas variantes.
       order by oi.variant_id
    loop
      update public.product_variants
         set stock = stock + v_item.quantity
       where id = v_item.variant_id;

      if found then
        v_restored_units := v_restored_units + v_item.quantity;
        v_restored_lines := v_restored_lines + 1;
      else
        v_orphan_lines := v_orphan_lines + 1;
      end if;
    end loop;

    select v_orphan_lines + count(*)::int into v_orphan_lines
      from public.order_items oi
     where oi.order_id = v_order.id
       and oi.variant_id is null;

    v_note := btrim(
      coalesce(v_note || ' ', '') ||
      format('[stock devuelto: %s uds en %s lineas', v_restored_units, v_restored_lines) ||
      case when v_orphan_lines > 0
        then format('; %s linea(s) sin variante viva, no devueltas', v_orphan_lines)
        else '' end ||
      ']'
    );
  end if;

  ---------------------------------------------------------------------------
  -- 6. Escritura del estado + evento. Misma transacción que el stock: si algo
  --    falla aquí, la devolución se revierte con ello.
  ---------------------------------------------------------------------------
  update public.orders
     set status = p_to_status
   where id = v_order.id;

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
  values (v_order.id, v_order.status, p_to_status, v_note, v_actor);

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'previous_status', v_order.status,
    'status', p_to_status,
    'stock_restored_units', v_restored_units,
    'stock_restored_lines', v_restored_lines,
    'stock_skipped_lines', v_orphan_lines
  );
end;
$$;

comment on function public.admin_update_order_status(uuid, text, text, boolean) is
  'Fase 7 (DEC-032/DEC-033). Cambia el estado de un pedido validando la transicion contra docs/05-ADMIN.md 4.4, escribe el order_event correspondiente y, al cancelar, devuelve el stock exactamente una vez. SECURITY INVOKER: RLS sigue aplicandose dentro de la funcion.';

-- Sin `to public`: solo un usuario autenticado puede siquiera invocarla, y
-- dentro se exige `is_admin()`.
revoke all on function public.admin_update_order_status(uuid, text, text, boolean) from public;
grant execute on function public.admin_update_order_status(uuid, text, text, boolean) to authenticated;
