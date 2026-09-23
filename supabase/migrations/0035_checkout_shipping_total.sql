-- Incremento 8 — el envío deja de ser cero y el total pasa a ser el que ve el cliente.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ ESTABA MAL, COMPROBADO CONTRA EL PROYECTO REAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `create_order` escribía `shipping_total = 0` y `total = subtotal` SIEMPRE,
-- mientras `shipping_methods` tenía —y tiene— dos métodos activos del mercado
-- ES con precio real:
--
--     Envío a Península   4.90   free_shipping_threshold = 60.00
--     Recogida en tienda  0.00   free_shipping_threshold = NULL
--
-- Ese umbral de 60 llevaba ahí desde el seed y **nadie lo aplicaba**: un pedido
-- de 89,90 € pagaba 4,90 € de envío que, según los propios datos de la tienda,
-- no debía pagar.
--
-- Y no existía ninguna columna donde anotar QUÉ método eligió el cliente:
-- `orders` solo tenía `shipping_total`. El administrador no podía saber si un
-- pedido era para enviar o para recoger sin preguntarlo por el chat.
--
-- Era coherente con la Fase 6, que documentaba "el coste de envío se acuerda en
-- la conversación de WhatsApp" (06-WHATSAPP §5, 01-PRODUCT §Envío). Esa
-- decisión se revierte a partir de aquí (DEC-063): el importe que ve el cliente
-- antes de confirmar es exactamente el que queda registrado.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ DOS COLUMNAS Y NO UNA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mismo patrón que `order_items`, que guarda `variant_id` **y** el nombre del
-- producto: el id sirve para relacionar y el SNAPSHOT para que el pedido siga
-- diciendo lo que se vendió aunque el método se renombre o se retire. Sin el
-- nombre, renombrar un método reescribiría el pasado; sin el id, no habría
-- relación. `on delete set null`: borrar un método no puede borrar el pedido.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL MÉTODO ENTRA EN EL FINGERPRINT DE IDEMPOTENCIA (DEC-028)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El fingerprint era `variante:cantidad|…#teléfono`. Sin el método dentro,
-- reintentar con la MISMA clave y otro envío se habría tratado como un retry
-- legítimo y habría devuelto el pedido viejo con el total viejo — el cliente
-- vería un importe que no pidió. Ahora esa combinación levanta
-- `IDEMPOTENCY_KEY_REUSED`, que es la verdad.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NADA DE ESTO ES ESPECÍFICO DE ESPAÑA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No hay ni un precio, ni un umbral, ni un nombre de método en el código: todo
-- sale de `shipping_methods` filtrado por el mercado del pedido. El día que se
-- active otro mercado y se siembren sus métodos, esto funciona sin tocar una
-- línea.

alter table public.orders
  add column if not exists shipping_method_id uuid
    references public.shipping_methods (id) on delete set null,
  add column if not exists shipping_method_name text;

comment on column public.orders.shipping_method_id is
  'Incremento 8. Metodo de entrega elegido. NULL en pedidos anteriores al incremento y si el metodo se borra despues.';
comment on column public.orders.shipping_method_name is
  'Incremento 8. SNAPSHOT del nombre en el momento de la compra, como product_name en order_items: renombrar un metodo no reescribe pedidos pasados.';

-- ═══════════════════════════════════════════════════════════════════════════
-- LA FIRMA ANTIGUA SE ELIMINA, Y NO ES COSMÉTICO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `create_order` es la única puerta por la que un anónimo escribe pedidos, y la
-- versión de 6 parámetros no sabe nada de envío: dejarla viva sería dejar
-- publicado un camino que sigue creando pedidos con `shipping_total = 0`. Se
-- elimina ANTES de crear la nueva para que no queden las dos.
drop function if exists public.create_order(text, jsonb, text, text, uuid, text);

create or replace function public.create_order(
  p_market_id text,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_client_request_id uuid,
  p_shipping_method_id uuid,
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
  v_shipping numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
  v_method record;
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
             || '#' || v_phone
             || '#' || coalesce(p_shipping_method_id::text, ''))
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
      'shipping_method_name', v_existing.shipping_method_name,
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
  -- 5bis. Método de entrega — resuelto contra la BD, nunca desde el cliente
  ---------------------------------------------------------------------------
  -- El navegador solo dice CUÁL quiere. Precio, umbral y nombre salen de aquí.
  -- Se exige que exista, que esté ACTIVO y que sea del mercado del pedido: un
  -- id de otro mercado o de un método retirado no puede colarse por POST.
  if p_shipping_method_id is null then
    raise exception 'SHIPPING_METHOD_REQUIRED' using errcode = 'P0001';
  end if;

  select sm.id, sm.name, sm.price, sm.free_shipping_threshold
    into v_method
    from public.shipping_methods sm
   where sm.id = p_shipping_method_id
     and sm.market_id = p_market_id
     and sm.is_active;

  if not found then
    raise exception 'INVALID_SHIPPING_METHOD' using errcode = 'P0001';
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
  -- 7bis. Coste del envío y total definitivos
  ---------------------------------------------------------------------------
  -- REGLA ÚNICA, y vive aquí: gratis cuando el SUBTOTAL de productos alcanza
  -- el umbral del método. Se compara contra el subtotal y no contra el total
  -- porque el total incluye el envío: compararlo consigo mismo no tiene una
  -- definición coherente. `free_shipping_threshold` NULL = el método no tiene
  -- umbral y siempre cuesta su precio.
  v_shipping := case
    when v_method.free_shipping_threshold is not null
         and v_subtotal >= v_method.free_shipping_threshold then 0
    else v_method.price
  end;

  v_total := v_subtotal + v_shipping;

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
  -- Promociones siguen sin aplicarse (`discount_total = 0`): la regla
  -- "promoción más favorable" sigue pendiente de decisión humana
  -- (01-PRODUCT §115). El ENVÍO sí se calcula desde el incremento 8.
  insert into public.orders (
    order_number, market_id, customer_id, channel, status, currency_code,
    subtotal, discount_total, shipping_total, total, source_url,
    shipping_method_id, shipping_method_name,
    client_request_id, client_request_fingerprint
  )
  values (
    v_order_number, p_market_id, v_customer_id, 'whatsapp', 'pending', v_currency,
    v_subtotal, 0, v_shipping, v_total, left(p_source_url, 500),
    v_method.id, v_method.name,
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
    'shipping_total', v_shipping,
    'shipping_method_name', v_method.name,
    'total', v_total,
    'items', v_items_out,
    'reused', false
  );
end;
$$;

comment on function public.create_order(text, jsonb, text, text, uuid, uuid, text) is
  'Crea un pedido de forma atomica validando todo contra la BD (DEC-026). El cliente solo aporta variant_id, quantity, sus datos de contacto y QUE metodo de entrega quiere; precio, stock, nombre, color, talla, coste de envio y totales se resuelven aqui. El envio es obligatorio y se resuelve contra shipping_methods del mercado del pedido (incremento 8). Idempotente por client_request_id, con el metodo dentro del fingerprint (DEC-028).';

-- Permisos explícitos sobre la firma NUEVA: la función sigue siendo el único
-- camino por el que un anónimo puede escribir en las tablas de pedidos, y esas
-- tablas siguen sin policies públicas de INSERT.
revoke all on function public.create_order(text, jsonb, text, text, uuid, uuid, text) from public;
grant execute on function public.create_order(text, jsonb, text, text, uuid, uuid, text) to anon, authenticated;
