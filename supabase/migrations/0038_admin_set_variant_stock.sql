-- Fase 9.5 — Incremento 12: el stock se ESTABLECE, no se suma.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE ESTA FUNCIÓN SI YA ESTABA `admin_restock_variants`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 0026 resuelve "han llegado 10 unidades": una SUMA, inmune a la pérdida de
-- actualizaciones por construcción. Pero la información que recibe esta tienda
-- no es una entrada de mercancía: el proveedor dice **"hay 12"**. Traducir eso
-- a un delta obliga al administrador a restar de cabeza contra un número que
-- puede haber cambiado hace un segundo, y esa resta es exactamente el bug que
-- la 0026 vino a eliminar — solo que hecha por una persona.
--
-- "Hay 12" es un valor ABSOLUTO, y un valor absoluto SÍ depende del valor de
-- partida: quien escribe 12 lo decidió mirando un 4. Si mientras tanto otro
-- administrador —o una venta— dejó ese 4 en 2, escribir 12 destruye
-- información nueva con información vieja. Por eso aquí el testigo
-- `expected_updated_at` NO es opcional: es la única cosa que distingue
-- "establecer" de "pisar".
--
-- `admin_restock_variants` NO se toca ni se borra: sigue siendo la operación
-- correcta para una recepción de mercancía y sus tests siguen protegiéndola.
-- Simplemente queda FUERA del flujo de edición rápida del panel (DEC-068).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LAS DOS OPERACIONES, Y POR QUÉ SON DISTINTAS EN EL PROTOCOLO Y NO EN LA UI
-- ═══════════════════════════════════════════════════════════════════════════
--
--   mode = 'set'      → exige `stock` y `expected_updated_at`. Es la edición.
--   mode = 'exhaust'  → no admite ninguno de los dos. Escribe 0. Es "Agotar".
--
-- La distinción es EXPLÍCITA a propósito. La alternativa —dejar el testigo
-- nulo y deducir "es un agotar"— convierte la ausencia de un dato en un
-- permiso, y cualquier cliente que olvidara mandarlo escribiría sin control de
-- concurrencia sin que nadie se enterase. Aquí, un `set` sin testigo es un
-- error (`EXPECTED_UPDATED_AT_REQUIRED`), no una escritura libre.
--
-- POR QUÉ 'exhaust' PUEDE PRESCINDIR DEL TESTIGO, medido contra el proyecto
-- real antes de escribir esto:
--   · dos "agotar" simultáneos → ambos 200, resultado final 0;
--   · comprar con stock 0 → 400 `OUT_OF_STOCK` (el guard de `create_order`).
-- Poner a 0 es idempotente y converge al mismo estado se aplique en el orden
-- que se aplique, así que no hay nada que un testigo pudiera proteger. Y NO
-- acepta ningún otro valor: `exhaust` no es "escribir sin testigo", es
-- "escribir el cero".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ATOMICIDAD: EL LOTE ENTERO O NADA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Una función es una transacción, así que cualquier `raise` deshace todo lo
-- anterior. Es deliberado y es la petición explícita: si el administrador
-- escribe M=4, L=0, XL=7 y la L cambió mientras editaba, aplicar M y XL le
-- dejaría un estado que nadie decidió y que además parecería correcto. Se
-- rechaza el lote completo con `STOCK_CHANGED` y se le pide recargar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ NO TOCA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ni `is_active`, ni `status`, ni `deleted_at`. Agotar NO despublica: un
-- producto con stock 0 sigue publicado y su ficha muestra "Agotado"
-- (`product_is_sellable`, 5B). Cambiar `is_active` aquí rompería además
-- `enforce_publishable_product` y dejaría fichas en 404.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LÍMITES, Y DE DÓNDE SALEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- · `stock >= 0` ya lo impone el CHECK de la 0008; se comprueba antes solo
--   para dar un error que el administrador entienda.
-- · Tope superior: la columna es `int` (hasta 2.147.483.647), así que la BD no
--   lo acota. Se usa 100000, que NO es un número nuevo: es el `MAX_STOCK` que
--   `lib/admin/catalog.ts` ya aplica desde la Fase 7 al otro camino de
--   escritura absoluta. Dos caminos con el mismo tope, no dos topes.
-- · Lote 1..100: el mismo de `admin_restock_variants` y de `MAX_MATRIX_SIZE`.
--   Un producto no puede tener más variantes que colores × tallas, y hoy eso
--   son 4 × 11 = 44 en la base de datos real.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURIDAD
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `SECURITY INVOKER`: RLS sigue aplicándose dentro, incluida la restricción de
-- mercado ACTIVO de la 0020. Sin service role, igual que la 0026.
--
-- MERCADO: `p_market_id` lo pone el SERVIDOR (`getActiveMarket()`), nunca un
-- formulario, y aquí se revalida contra CADA variante con la fila bloqueada.
-- Una variante que no pertenezca hace fallar el lote entero en vez de
-- ignorarse: un lote aplicado a medias es peor que uno rechazado.

create or replace function public.admin_set_variant_stock(
  p_market_id text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_mode text;
  v_variant_id uuid;
  v_expected timestamptz;
  v_target int;
  v_current int;
  v_updated_at timestamptz;
  v_slug text;
  v_applied int := 0;
  v_unchanged int := 0;
  v_slugs text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_mode := coalesce(v_item ->> 'mode', 'set');
    if v_mode not in ('set', 'exhaust') then
      raise exception 'INVALID_MODE';
    end if;

    begin
      v_variant_id := (v_item ->> 'variant_id')::uuid;
    exception when others then
      raise exception 'INVALID_VARIANT_ID';
    end;

    if v_mode = 'set' then
      -- Solo dígitos. `'5.5'::int` redondearía en silencio y "media unidad"
      -- no significa nada; `'-1'` lo pararía el CHECK, pero el error sería de
      -- PostgreSQL y no del administrador.
      if (v_item ->> 'stock') !~ '^[0-9]+$' then
        raise exception 'INVALID_STOCK';
      end if;
      v_target := (v_item ->> 'stock')::int;
      if v_target > 100000 then
        raise exception 'STOCK_OUT_OF_RANGE';
      end if;

      if (v_item ->> 'expected_updated_at') is null then
        raise exception 'EXPECTED_UPDATED_AT_REQUIRED';
      end if;
      begin
        v_expected := (v_item ->> 'expected_updated_at')::timestamptz;
      exception when others then
        raise exception 'INVALID_EXPECTED_UPDATED_AT';
      end;
    else
      -- 'exhaust' no negocia el valor: es el cero y nada más.
      if v_item ? 'stock' or v_item ? 'expected_updated_at' then
        raise exception 'INVALID_PAYLOAD';
      end if;
      v_target := 0;
      v_expected := null;
    end if;

    -- El mercado se comprueba SOBRE LA FILA, no sobre lo que dijo el cliente.
    -- `for update of v` bloquea la variante hasta el final de la transacción,
    -- así que entre este SELECT y el UPDATE no cabe nadie: ni otro admin, ni
    -- el decremento de `create_order`.
    select v.stock, v.updated_at, p.slug
      into v_current, v_updated_at, v_slug
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = v_variant_id
      and p.market_id = p_market_id
      and p.deleted_at is null
    for update of v;

    if v_slug is null then
      raise exception 'VARIANT_NOT_IN_MARKET';
    end if;

    -- EL BLOQUEO OPTIMISTA. Se compara con la fila YA BLOQUEADA, así que no
    -- hay ventana entre comprobar y escribir.
    if v_mode = 'set' and v_updated_at is distinct from v_expected then
      raise exception 'STOCK_CHANGED' using detail = v_variant_id::text;
    end if;

    if v_current = v_target then
      -- Escribir el mismo número movería `updated_at` y caducaría el testigo
      -- de las demás pestañas sin que nada haya cambiado. Y "Agotar" sobre
      -- una variante ya agotada tiene que ser silencioso, no un error.
      v_unchanged := v_unchanged + 1;
    else
      update public.product_variants
         set stock = v_target
       where id = v_variant_id;

      v_applied := v_applied + 1;
      if not (v_slug = any (v_slugs)) then
        v_slugs := array_append(v_slugs, v_slug);
      end if;
    end if;
  end loop;

  -- Los slugs tocados vuelven para que la Server Action invalide cada ficha
  -- por RUTA LITERAL (DEC-037/DEC-041). Sin esto la tienda enseñaría
  -- disponibilidad vieja hasta 5 minutos.
  return jsonb_build_object(
    'applied', v_applied,
    'unchanged', v_unchanged,
    'slugs', to_jsonb(v_slugs)
  );
end;
$$;

comment on function public.admin_set_variant_stock(text, jsonb) is
  'Incremento 12. Establece el stock de varias variantes a un valor ABSOLUTO (mode=set, con testigo expected_updated_at obligatorio) o lo pone a cero (mode=exhaust, idempotente y sin testigo porque converge). Todo o nada: un testigo caducado lanza STOCK_CHANGED y deshace el lote entero. Revalida el mercado de cada variante sobre la fila bloqueada. No toca is_active ni el estado del producto: agotado NO es despublicado. SECURITY INVOKER.';

revoke all on function public.admin_set_variant_stock(text, jsonb) from public;
grant execute on function public.admin_set_variant_stock(text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- LA AUDITORÍA: UNA LÍNEA, Y NINGUNA CATEGORÍA NUEVA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `log_admin_change` clasifica por `request.path`. Sin tocarla, lo que escriba
-- esta función entraría como 'rpc' —el cajón de "algo pasó y nadie lo
-- etiquetó"— y la ficha del producto lo pintaría como ruido.
--
-- Establecer un valor absoluto es exactamente lo que la taxonomía de la 0032
-- ya llama 'correccion', que es además como se etiqueta hoy el PATCH del panel
-- que hace lo mismo. No se añade ningún valor al CHECK de `source`: "Agotado"
-- es una forma de PINTAR una corrección cuyo valor nuevo es 0, y eso es
-- trabajo de la interfaz, no de la base de datos.
--
-- Se reescribe la función entera (no hay forma de parchear un `case` en
-- PostgreSQL) copiando la versión de la 0033 con UNA línea añadida.

create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_path text := coalesce(current_setting('request.path', true), '');
  v_source text;
  v_product_id uuid;
begin
  -- 1. SOLO UN ADMINISTRADOR DECIDE (0033, DEC-059).
  if not public.is_admin() then
    return null;
  end if;

  -- 2. LO QUE YA CUBRE `order_events` NO SE DUPLICA.
  if v_path like '%/rpc/create_order'
     or v_path like '%/rpc/admin_update_order_status' then
    return null;
  end if;

  -- 3. ORIGEN, desde el propio request.
  v_source := case
    when v_path like '%/rpc/admin_restock_variants' then 'reposicion'
    -- Incremento 12: establecer un absoluto es una corrección, igual que el
    -- PATCH del panel que hacía lo mismo antes.
    when v_path like '%/rpc/admin_set_variant_stock' then 'correccion'
    when v_path like '%/rpc/admin_create_variant_matrix' then 'matriz'
    when v_path like '%/rpc/%' then 'rpc'
    else 'directo'
  end;

  if tg_table_name = 'products' then
    v_product_id := new.id;

    if new.status is distinct from old.status then
      insert into public.admin_change_log
        (product_id, field_name, old_value, new_value, source, actor_id)
      values (v_product_id, 'status', old.status, new.status, v_source, v_actor);
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      insert into public.admin_change_log
        (product_id, field_name, old_value, new_value, source, actor_id)
      values (
        v_product_id, 'deleted_at',
        old.deleted_at::text, new.deleted_at::text,
        v_source, v_actor
      );
    end if;

    return null;
  end if;

  if new.price is distinct from old.price then
    insert into public.admin_change_log
      (product_id, variant_id, sku, field_name, old_value, new_value, source, actor_id)
    values (
      new.product_id, new.id, new.sku, 'price',
      old.price::text, new.price::text, v_source, v_actor
    );
  end if;

  if new.stock is distinct from old.stock then
    insert into public.admin_change_log
      (product_id, variant_id, sku, field_name, old_value, new_value, source, actor_id)
    values (
      new.product_id, new.id, new.sku, 'stock',
      old.stock::text, new.stock::text,
      case when v_source = 'directo' then 'correccion' else v_source end,
      v_actor
    );
  end if;

  return null;
end;
$$;

comment on function public.log_admin_change() is
  'Fase 9.5 (5C, corregida en 0033, ampliada en 0038). SECURITY DEFINER para poder escribir en admin_change_log, que no tiene policy de INSERT. Solo AFTER UPDATE. Escribe unicamente si el actor es ADMIN (is_admin()), lo que ademas hace inalcanzable la FK de actor_id, y descarta create_order y admin_update_order_status porque order_events ya los cubre. admin_set_variant_stock se etiqueta correccion: establecer un absoluto es lo mismo que hacia el PATCH del panel.';
