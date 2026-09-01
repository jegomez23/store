-- Fase 6 — Checkout: creación segura de pedidos.
--
-- CONTEXTO (DEC-026): `orders`, `order_items`, `order_events` y `customers`
-- solo tienen policies de admin — un cliente anónimo NO puede insertar nada.
-- Además el cliente JS de Supabase no puede ejecutar transacciones
-- multi-sentencia, y crear un pedido son 5 escrituras que deben ser atómicas.
--
-- Solución: una única función SECURITY DEFINER que encapsula TODA la
-- validación y escritura. Se invoca con la anon key, pero las tablas siguen
-- siendo privadas: no se añade ninguna policy pública de INSERT y no se usa
-- la service role key en ningún punto de la aplicación.
--
-- REGLA CENTRAL: el cliente solo aporta identificadores de variante,
-- cantidades y sus datos de contacto. Precio, nombre, color, talla, SKU,
-- stock y totales se resuelven SIEMPRE desde PostgreSQL. Cualquier precio
-- enviado por el cliente se ignora porque ni siquiera se recibe.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Contador de pedidos por mercado (DEC-027) — formato YI-ES-000001
-- ─────────────────────────────────────────────────────────────────────────

create table public.order_counters (
  market_id text primary key references public.markets (id),
  last_number bigint not null default 0
);

comment on table public.order_counters is
  'Correlativo de order_number por mercado (DEC-027). El UPSERT bloquea la fila, serializando la numeración y evitando duplicados bajo concurrencia.';

alter table public.order_counters enable row level security;

-- Sin lectura pública: revelaría el volumen de pedidos del negocio.
create policy "admin_all_order_counters" on public.order_counters
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DEC-023: RLS no filtra TRUNCATE/TRIGGER.
revoke truncate, trigger on public.order_counters from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Idempotencia (DEC-028)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.orders
  add column client_request_id uuid,
  add column client_request_fingerprint text;

comment on column public.orders.client_request_id is
  'UUID generado por el cliente por intento de checkout. Hace idempotente la creación frente a doble clic, recarga y varias pestañas.';
comment on column public.orders.client_request_fingerprint is
  'md5 del payload normalizado (ítems ordenados + teléfono). Permite distinguir un retry legítimo de una reutilización de la clave con otro payload.';

-- Índice parcial: los pedidos creados por el admin (Fase 7) no llevan clave.
create unique index orders_client_request_id_key
  on public.orders (client_request_id)
  where client_request_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. create_order — validación + escritura atómica
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.create_order(
  p_market_id text,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_client_request_id uuid,
  p_source_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_name text;
  v_elem jsonb;
  v_vid_text text;
  v_qty_text text;
  v_qty int;
  v_uuid uuid;
  v_ids uuid[] := '{}';
  v_qtys int[] := '{}';
  v_fingerprint text;
  v_existing public.orders%rowtype;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_next bigint;
  v_currency char(3);
  v_subtotal numeric(12, 2) := 0;
  v_line_total numeric(12, 2);
  v_updated int;
  v_row record;
  v_items_out jsonb := '[]'::jsonb;
  i int;
begin
  ---------------------------------------------------------------------------
  -- 0. Clave de idempotencia obligatoria
  ---------------------------------------------------------------------------
  if p_client_request_id is null then
    raise exception 'INVALID_INPUT'
      using errcode = 'P0001', detail = 'client_request_id requerido';
  end if;

  ---------------------------------------------------------------------------
  -- 1. Datos del cliente (DEC-030: teléfono y nombre obligatorios)
  ---------------------------------------------------------------------------
  -- E.164 sin '+' , coherente con settings.whatsapp_number (03-DATABASE §2.16).
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_name := btrim(coalesce(p_customer_name, ''));

  if length(v_phone) < 6 or length(v_phone) > 20 then
    raise exception 'INVALID_CUSTOMER_PHONE' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'INVALID_CUSTOMER_NAME' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 2. Ítems: validación estructural estricta
  ---------------------------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_INPUT'
      using errcode = 'P0001', detail = 'items debe ser un array';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_INPUT'
      using errcode = 'P0001', detail = 'demasiadas líneas';
  end if;

  for v_elem in select value from jsonb_array_elements(p_items) loop
    v_vid_text := v_elem ->> 'variant_id';
    v_qty_text := v_elem ->> 'quantity';

    if v_vid_text is null or v_vid_text !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_INPUT'
        using errcode = 'P0001', detail = 'variant_id no es un uuid';
    end if;

    -- Solo dígitos: descarta negativos, decimales, NaN, Infinity y notación
    -- exponencial antes de cualquier cast.
    if v_qty_text is null or v_qty_text !~ '^[0-9]+$' then
      raise exception 'INVALID_INPUT'
        using errcode = 'P0001', detail = 'quantity no es un entero';
    end if;

    v_qty := v_qty_text::int;
    if v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_INPUT'
        using errcode = 'P0001', detail = 'quantity fuera de rango';
    end if;

    v_uuid := v_vid_text::uuid;
    if v_uuid = any (v_ids) then
      raise exception 'INVALID_INPUT'
        using errcode = 'P0001', detail = 'variant_id duplicado';
    end if;

    v_ids := array_append(v_ids, v_uuid);
    v_qtys := array_append(v_qtys, v_qty);
  end loop;

  -- Orden estable por variant_id. Doble propósito:
  --   a) el fingerprint no depende del orden en que el cliente mande los ítems;
  --   b) todas las transacciones bloquean las filas de stock en el mismo
  --      orden, lo que elimina los deadlocks entre compras concurrentes.
  select array_agg(x.vid order by x.vid), array_agg(x.qty order by x.vid)
    into v_ids, v_qtys
    from unnest(v_ids, v_qtys) as x(vid, qty);

  ---------------------------------------------------------------------------
  -- 3. Fingerprint del payload (DEC-028)
  ---------------------------------------------------------------------------
  select md5(string_agg(x.vid::text || ':' || x.qty::text, '|' order by x.vid)
             || '#' || v_phone)
    into v_fingerprint
    from unnest(v_ids, v_qtys) as x(vid, qty);

  ---------------------------------------------------------------------------
  -- 4. Idempotencia ANTES de tocar nada
  ---------------------------------------------------------------------------
  select * into v_existing
    from public.orders
   where client_request_id = p_client_request_id;

  if found then
    if v_existing.client_request_fingerprint is distinct from v_fingerprint then
      -- Misma clave, payload distinto: se rechaza sin modificar NADA.
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;

    -- Retry legítimo: se devuelve el pedido ya creado. No se descuenta stock,
    -- no se crea customer, ni order, ni items, ni evento.
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'variant_id', oi.variant_id,
               'product_name', oi.product_name,
               'color_name', oi.color_name,
               'size_label', oi.size_label,
               'sku', oi.sku,
               'unit_price', oi.unit_price,
               'quantity', oi.quantity,
               'line_total', oi.line_total
             ) order by oi.product_name),
             '[]'::jsonb)
      into v_items_out
      from public.order_items oi
     where oi.order_id = v_existing.id;

    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'market_id', v_existing.market_id,
      'currency_code', v_existing.currency_code,
      'subtotal', v_existing.subtotal,
      'discount_total', v_existing.discount_total,
      'shipping_total', v_existing.shipping_total,
      'total', v_existing.total,
      'items', v_items_out,
      'reused', true
    );
  end if;

  ---------------------------------------------------------------------------
  -- 5. Mercado activo
  ---------------------------------------------------------------------------
  select m.currency_code into v_currency
    from public.markets m
   where m.id = p_market_id and m.is_active;

  if not found then
    raise exception 'MARKET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  ---------------------------------------------------------------------------
  -- 6. Resolver cada variante desde la BD y descontar stock atómicamente
  ---------------------------------------------------------------------------
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    select pv.id,
           pv.sku,
           pv.price,
           pv.is_active,
           p.name as product_name,
           p.status as product_status,
           p.deleted_at as product_deleted_at,
           p.market_id as product_market_id,
           c.name as color_name,
           s.label as size_label
      into v_row
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      left join public.colors c on c.id = pv.color_id
      left join public.sizes s on s.id = pv.size_id
     where pv.id = v_ids[i];

    if not found then
      raise exception 'VARIANT_NOT_FOUND'
        using errcode = 'P0001', detail = v_ids[i]::text;
    end if;
    if not v_row.is_active then
      raise exception 'VARIANT_INACTIVE'
        using errcode = 'P0001', detail = v_ids[i]::text;
    end if;
    if v_row.product_deleted_at is not null or v_row.product_status <> 'active' then
      raise exception 'PRODUCT_UNAVAILABLE'
        using errcode = 'P0001', detail = v_ids[i]::text;
    end if;
    if v_row.product_market_id <> p_market_id then
      raise exception 'WRONG_MARKET'
        using errcode = 'P0001', detail = v_ids[i]::text;
    end if;

    -- Decremento ATÓMICO con guard. Nunca SELECT + UPDATE sin condición: el
    -- WHERE stock >= qty y el recuento de filas afectadas son lo que impide
    -- el overselling cuando dos clientes pelean por la última unidad.
    update public.product_variants
       set stock = stock - v_qtys[i]
     where id = v_ids[i]
       and stock >= v_qtys[i];

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'OUT_OF_STOCK'
        using errcode = 'P0001', detail = v_ids[i]::text;
    end if;

    -- Precio REAL de la BD. El cliente no envía precio y aunque lo enviara,
    -- esta función no lo lee de ninguna parte.
    v_line_total := (v_row.price * v_qtys[i])::numeric(12, 2);
    v_subtotal := v_subtotal + v_line_total;

    v_items_out := v_items_out || jsonb_build_object(
      'variant_id', v_ids[i],
      'product_name', v_row.product_name,
      'color_name', v_row.color_name,
      'size_label', v_row.size_label,
      'sku', v_row.sku,
      'unit_price', v_row.price,
      'quantity', v_qtys[i],
      'line_total', v_line_total
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 7. Cliente (upsert por market+phone: un retry no lo duplica)
  ---------------------------------------------------------------------------
  insert into public.customers (market_id, phone, name)
  values (p_market_id, v_phone, v_name)
  on conflict (market_id, phone)
    do update set name = excluded.name
  returning id into v_customer_id;

  ---------------------------------------------------------------------------
  -- 8. Número de pedido correlativo por mercado (DEC-027)
  ---------------------------------------------------------------------------
  insert into public.order_counters (market_id, last_number)
  values (p_market_id, 1)
  on conflict (market_id)
    do update set last_number = public.order_counters.last_number + 1
  returning last_number into v_next;

  v_order_number := 'YI-' || p_market_id || '-' || lpad(v_next::text, 6, '0');

  ---------------------------------------------------------------------------
  -- 9. Pedido + líneas + evento
  ---------------------------------------------------------------------------
  -- Fase 6 no aplica promociones ni envío: la regla "promoción más favorable"
  -- sigue pendiente de decisión humana (01-PRODUCT §115) y el coste de envío
  -- se acuerda en la conversación de WhatsApp (06-WHATSAPP §5).
  insert into public.orders (
    order_number, market_id, customer_id, channel, status, currency_code,
    subtotal, discount_total, shipping_total, total, source_url,
    client_request_id, client_request_fingerprint
  )
  values (
    v_order_number, p_market_id, v_customer_id, 'whatsapp', 'pending', v_currency,
    v_subtotal, 0, 0, v_subtotal, left(p_source_url, 500),
    p_client_request_id, v_fingerprint
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, variant_id, product_name, color_name, size_label, sku,
    unit_price, quantity, line_total
  )
  select v_order_id,
         (item ->> 'variant_id')::uuid,
         item ->> 'product_name',
         item ->> 'color_name',
         item ->> 'size_label',
         item ->> 'sku',
         (item ->> 'unit_price')::numeric(12, 2),
         (item ->> 'quantity')::int,
         (item ->> 'line_total')::numeric(12, 2)
    from jsonb_array_elements(v_items_out) as item;

  -- Bitácora append-only. from_status NULL = creación (03-DATABASE §2.14).
  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
  values (v_order_id, null, 'pending', 'Pedido creado desde el checkout de WhatsApp', null);

  ---------------------------------------------------------------------------
  -- 10. Respuesta mínima para continuar el checkout
  ---------------------------------------------------------------------------
  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'market_id', p_market_id,
    'currency_code', v_currency,
    'subtotal', v_subtotal,
    'discount_total', 0,
    'shipping_total', 0,
    'total', v_subtotal,
    'items', v_items_out,
    'reused', false
  );
end;
$$;

comment on function public.create_order(text, jsonb, text, text, uuid, text) is
  'Crea un pedido de forma atómica validando todo contra la BD (DEC-026). El cliente solo aporta variant_id, quantity y sus datos de contacto; precio, stock, nombre, color, talla y totales se resuelven aquí. Idempotente por client_request_id (DEC-028).';

-- Permisos explícitos: la función es el ÚNICO camino por el que un anónimo
-- puede escribir en las tablas de pedidos. Las tablas siguen sin policies
-- públicas de INSERT.
revoke all on function public.create_order(text, jsonb, text, text, uuid, text) from public;
grant execute on function public.create_order(text, jsonb, text, text, uuid, text) to anon, authenticated;
