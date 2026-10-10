-- Fase 10: el candado del checkout va ANTES de la idempotencia (DEC-088).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ FALLÓ EN LA 0046, MEDIDO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 0046 tomaba `pg_advisory_xact_lock` DESPUÉS de comprobar la clave de
-- idempotencia. Con dos envíos SIMULTÁNEOS de la misma clave (doble clic, un
-- reintento que sale antes de que vuelva la primera respuesta):
--
--   A comprueba la clave → no existe → toma el candado → crea el pedido
--   B comprueba la clave → no existe → ESPERA el candado → A confirma →
--   B sigue → INSERT → 23505 `orders_client_request_id_key`
--
-- B recibía un error en vez de su pedido. El test «doble envío con la MISMA
-- clave» falló 2 de 3 ejecuciones. Antes de la 0046 el hueco era de
-- milisegundos y pasaba por suerte; el candado lo ensanchó.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL ARREGLO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El candado se toma ANTES de leer la clave. B espera a que A confirme, y como
-- PostgreSQL en READ COMMITTED toma una instantánea nueva por sentencia, su
-- SELECT de idempotencia ya VE el pedido de A y lo devuelve con `reused: true`.
-- Un reintento sigue sin rechazarse nunca: los límites siguen DESPUÉS.
--
-- Precio: los reintentos también esperan su turno en el mercado. Son
-- milisegundos, y la numeración correlativa (DEC-027) ya serializaba.
--
-- Misma firma de 8 parámetros: se reemplaza el cuerpo, no aparece otra puerta.

create or replace function public.create_order(
  p_market_id text,
  p_items jsonb,
  p_customer_phone text,
  p_customer_name text,
  p_client_request_id uuid,
  p_shipping_method_id uuid,
  p_source_url text default null,
  p_attribution jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attribution jsonb;
  v_units int;
  v_phone_limit int;
  v_market_limit int;
  v_recent bigint;
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
  -- 3bis. Candado por mercado (0047, DEC-088)
  ---------------------------------------------------------------------------
  -- ANTES de la idempotencia: un envío simultáneo con la misma clave espera a
  -- que el primero confirme y entonces lo encuentra, en vez de chocar con el
  -- índice único (23505). Y antes de los límites: sin el candado, peticiones
  -- paralelas cuentan a la vez y entran todas por debajo del límite.
  -- Se libera solo al terminar la transacción.
  perform pg_advisory_xact_lock(hashtext('create_order:' || coalesce(p_market_id, '')));

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
  -- 4bis. Límites anti-abuso (0046, DEC-088)
  ---------------------------------------------------------------------------
  -- Después de la idempotencia (un reintento no es un pedido nuevo) y antes de
  -- tocar stock (un rechazo no descuenta nada).
  select coalesce(sum(q), 0) into v_units from unnest(v_qtys) as q;
  if v_units > 10 then
    raise exception 'ORDER_TOO_LARGE' using errcode = 'P0001';
  end if;

  -- Sin fila de settings se aplican los mismos valores por defecto que la
  -- columna: un mercado mal configurado no queda sin límite.
  select s.checkout_max_orders_per_phone_hour, s.checkout_max_orders_per_market_10min
    into v_phone_limit, v_market_limit
    from public.settings s
   where s.market_id = p_market_id;

  v_phone_limit := coalesce(v_phone_limit, 3);
  v_market_limit := coalesce(v_market_limit, 30);

  select count(*) into v_recent
    from public.orders o
    join public.customers c on c.id = o.customer_id
   where c.market_id = p_market_id
     and c.phone = v_phone
     and o.created_at > now() - interval '1 hour';

  if v_recent >= v_phone_limit then
    raise exception 'TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;

  select count(*) into v_recent
    from public.orders o
   where o.market_id = p_market_id
     and o.created_at > now() - interval '10 minutes';

  if v_recent >= v_market_limit then
    raise exception 'CHECKOUT_BUSY' using errcode = 'P0001';
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
  -- 8bis. ATRIBUCIÓN: se CONSTRUYE aquí, no se guarda lo que llegó
  ---------------------------------------------------------------------------
  -- El objeto que manda el navegador no se almacena nunca tal cual. Se leen
  -- SOLO estas siete claves y se descarta todo lo demás, así que ningún camino
  -- —ni un POST directo a /rpc/create_order, que anon puede hacer— puede meter
  -- JSON arbitrario en la tabla.
  --
  -- NUNCA LANZA. Una atribución rota, gigante o inventada deja
  -- `attribution = null` y el pedido se crea igual: un dato de marketing no
  -- puede impedir una venta.
  v_attribution := null;

  if p_attribution is not null
     and jsonb_typeof(p_attribution) = 'object'
     -- Tope de cordura antes de tocar nada: 8 KB es varias veces lo que caben
     -- siete campos de 200 caracteres.
     and octet_length(p_attribution::text) <= 8192
  then
    select jsonb_object_agg(t.k, t.v)
      into v_attribution
    from (
      select k_name as k,
             -- Sin caracteres de control y recortado a 200: lo que entra es
             -- una etiqueta de campaña, no un texto libre.
             left(btrim(regexp_replace(p_attribution ->> k_name, '[[:cntrl:]]', '', 'g')), 200) as v
      from unnest(array[
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'landing_path'
      ]) as k_name
      where jsonb_typeof(p_attribution -> k_name) = 'string'
    ) t
    where t.v <> '';
  end if;

  ---------------------------------------------------------------------------
  -- Promociones siguen sin aplicarse (`discount_total = 0`): la regla
  -- "promoción más favorable" sigue pendiente de decisión humana
  -- (01-PRODUCT §115). El ENVÍO sí se calcula desde el incremento 8.
  insert into public.orders (
    order_number, market_id, customer_id, channel, status, currency_code,
    subtotal, discount_total, shipping_total, total, source_url,
    shipping_method_id, shipping_method_name,
    client_request_id, client_request_fingerprint, attribution
  )
  values (
    v_order_number, p_market_id, v_customer_id, 'whatsapp', 'pending', v_currency,
    v_subtotal, 0, v_shipping, v_total, left(p_source_url, 500),
    v_method.id, v_method.name,
    p_client_request_id, v_fingerprint, v_attribution
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

comment on function public.create_order(text, jsonb, text, text, uuid, uuid, text, jsonb) is
  'Crea un pedido de forma atomica validando todo contra la BD (DEC-026). El cliente solo aporta variant_id, quantity, sus datos de contacto, QUE metodo de entrega quiere y su atribucion de marketing; precio, stock, nombre, color, talla, coste de envio y totales se resuelven aqui. La atribucion se SANEA contra una lista blanca de siete claves y nunca lanza: si viene rota se guarda null y el pedido se crea igual. Idempotente por client_request_id, con el metodo dentro del fingerprint y la atribucion FUERA (DEC-028). Limites anti-abuso (0046, DEC-088): maximo 10 unidades por pedido (ORDER_TOO_LARGE), pedidos por telefono y hora (TOO_MANY_ORDERS) y pedidos por mercado cada 10 minutos (CHECKOUT_BUSY), estos dos configurables en settings; se aplican despues de la idempotencia y antes de tocar stock. Un candado por mercado, tomado ANTES de la idempotencia (0047), serializa la creacion: los limites cuentan bien bajo concurrencia y un doble envio simultaneo con la misma clave devuelve el mismo pedido.';

revoke all on function public.create_order(text, jsonb, text, text, uuid, uuid, text, jsonb) from public;
grant execute on function public.create_order(text, jsonb, text, text, uuid, uuid, text, jsonb) to anon, authenticated;
