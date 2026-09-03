-- Fase 8 — Creación en lote de variantes desde la matriz color × talla.
--
-- POR QUÉ UNA FUNCIÓN: "crear todas las combinaciones" son N inserts. Desde el
-- cliente JS serían N peticiones sin transacción: si la quinta falla por un SKU
-- repetido, quedan cuatro variantes a medio crear y el admin no sabe cuáles.
-- Aquí es todo o nada (DEC-032: lo que debe ser atómico vive en SQL).
--
-- `SECURITY INVOKER`, igual que `admin_update_order_status` y por la misma
-- razón: el llamante es un admin autenticado que YA tiene policies, así que RLS
-- se sigue aplicando fila a fila dentro de la función. En particular, la policy
-- `admin_all_product_variants` de la migración 0020 exige que el producto
-- pertenezca a un mercado ACTIVO — de modo que esta función tampoco puede
-- crear variantes en un producto de Colombia.
--
-- El cliente aporta color, talla, SKU, precio, stock y activa. NO aporta
-- `product_id` de otra cosa: se valida que el producto sea visible para él.

create or replace function public.admin_create_variant_matrix(
  p_product_id uuid,
  p_variants jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_elem jsonb;
  v_color uuid;
  v_size uuid;
  v_sku text;
  v_price numeric(12, 2);
  v_stock int;
  v_active boolean;
  v_price_text text;
  v_stock_text text;
  v_created int := 0;
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_product_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'product_id requerido';
  end if;

  -- Si RLS no deja ver el producto (otro mercado, mercado inactivo, borrado),
  -- esto no encuentra nada y se corta aquí. No se distingue "no existe" de
  -- "no puedes verlo": mismo error (docs/08-SECURITY.md §1).
  select true into v_exists
    from public.products
   where id = p_product_id
     and deleted_at is null
   limit 1;

  if v_exists is not true then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'variants debe ser un array';
  end if;
  if jsonb_array_length(p_variants) = 0 then
    raise exception 'EMPTY_MATRIX' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_variants) > 100 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'demasiadas combinaciones';
  end if;

  for v_elem in select value from jsonb_array_elements(p_variants) loop
    -- color_id y size_id son NULLABLE a propósito (DEC-019, accesorios).
    v_color := nullif(v_elem ->> 'color_id', '')::uuid;
    v_size := nullif(v_elem ->> 'size_id', '')::uuid;

    v_sku := upper(btrim(coalesce(v_elem ->> 'sku', '')));
    if v_sku !~ '^[A-Z0-9-]{2,40}$' then
      raise exception 'INVALID_SKU' using errcode = 'P0001', detail = v_sku;
    end if;

    -- Solo dígitos y hasta 2 decimales ANTES de castear: descarta negativos,
    -- notación exponencial, NaN e Infinity.
    v_price_text := coalesce(v_elem ->> 'price', '');
    if v_price_text !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'INVALID_PRICE' using errcode = 'P0001';
    end if;
    v_price := v_price_text::numeric(12, 2);
    if v_price > 1000000 then
      raise exception 'INVALID_PRICE' using errcode = 'P0001';
    end if;

    v_stock_text := coalesce(v_elem ->> 'stock', '');
    if v_stock_text !~ '^[0-9]+$' then
      raise exception 'INVALID_STOCK' using errcode = 'P0001';
    end if;
    v_stock := v_stock_text::int;
    if v_stock > 100000 then
      raise exception 'INVALID_STOCK' using errcode = 'P0001';
    end if;

    v_active := coalesce((v_elem ->> 'is_active')::boolean, true);

    -- El color y la talla deben existir de verdad; la FK lo garantizaría, pero
    -- así el error es propio y no un 23503 crudo.
    if v_color is not null and not exists (select 1 from public.colors where id = v_color) then
      raise exception 'INVALID_COLOR' using errcode = 'P0001';
    end if;
    if v_size is not null and not exists (select 1 from public.sizes where id = v_size) then
      raise exception 'INVALID_SIZE' using errcode = 'P0001';
    end if;

    -- La combinación ya existente se SALTA en vez de fallar: la matriz es
    -- idempotente y "crear las que falten" es la operación natural del admin.
    -- Nota: `unique (product_id, color_id, size_id)` no dispara con NULLs
    -- (Postgres los trata como distintos), así que se comprueba con IS NOT
    -- DISTINCT FROM, que sí los equipara.
    if exists (
      select 1 from public.product_variants pv
       where pv.product_id = p_product_id
         and pv.color_id is not distinct from v_color
         and pv.size_id is not distinct from v_size
    ) then
      continue;
    end if;

    insert into public.product_variants
      (product_id, color_id, size_id, sku, price, stock, is_active)
    values
      (p_product_id, v_color, v_size, v_sku, v_price, v_stock, v_active);

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'requested', jsonb_array_length(p_variants)
  );
end;
$$;

comment on function public.admin_create_variant_matrix(uuid, jsonb) is
  'Fase 8. Crea en una sola transaccion las variantes que falten de la matriz color x talla. SECURITY INVOKER: RLS (incluida la restriccion de mercado activo de la 0020) sigue aplicandose dentro.';

revoke all on function public.admin_create_variant_matrix(uuid, jsonb) from public;
grant execute on function public.admin_create_variant_matrix(uuid, jsonb) to authenticated;
