-- Fase 9.5 — Incremento 6: gestión administrativa de colores y tallas.
--
-- Esta migración NO crea nada nuevo: `colors` y `sizes` ya existen desde la
-- 0004 con `is_active`, `unique (slug)`, `unique (label, size_group)` y el
-- CHECK de los tres grupos. La feature se puede construir SIN migración.
--
-- Lo que sí hace es cerrar dos huecos REPRODUCIDOS contra el proyecto real
-- antes de escribir una línea del panel.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. `hex_code` ACEPTABA CUALQUIER COSA DE 7 CARACTERES O MENOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Es `character(7)`, no `text`, y `char(n)` RELLENA con espacios en vez de
-- rechazar. Medido con la sesión de un admin:
--
--     POST /colors {"hex_code":"rojo"}  →  201  ·  se guarda como 'rojo   '
--     POST /colors {"hex_code":"#00112233"} → 400 · 22001 (solo por longitud)
--
-- Es decir: la única validación que existía era el tamaño. Un color con
-- 'rojo   ' llega hasta el `style` de la muestra de color del panel y de la
-- tienda, donde no pinta nada y nadie sabe por qué.
--
-- Las CUATRO filas actuales cumplen el patrón (#111111, #ffffff, #9c9890,
-- #3a4a3e), así que el CHECK entra sin tocar un solo dato. Se acepta
-- mayúscula y minúscula porque ambas son válidas en CSS y la 0004 no
-- normalizó nada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LA MATRIZ DE VARIANTES ACEPTABA COLORES Y TALLAS RETIRADOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `admin_create_variant_matrix` (0021) comprobaba que el color y la talla
-- EXISTIERAN, no que estuvieran activos. Medido, con un color y una talla
-- creados ya con `is_active = false`:
--
--     POST /rpc/admin_create_variant_matrix  →  {"created":1,"requested":1}
--
-- Hasta ahora daba igual, porque nadie podía desactivar nada sin SQL. Con el
-- panel de atributos, "retirar un color" pasa a ser una operación normal, y
-- entonces "un valor retirado no se ofrece" no puede quedar garantizado solo
-- por el `.eq("is_active", true)` de `listColors()`: eso es la aplicación, y
-- un POST directo a la RPC se la salta.
--
-- SOLO SE COMPRUEBA AL CREAR. No hay CHECK ni trigger sobre
-- `product_variants`: una variante que YA usa un color retirado tiene que
-- poder seguir editándose (cambiar su precio, su stock o desactivarla). Poner
-- la restricción sobre la fila en vez de sobre la transición es exactamente el
-- error que la 0030 cometió con la publicabilidad y que la 0031 tuvo que
-- corregir. No se repite.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Formato real de `hex_code`
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.colors
  add constraint colors_hex_code_format
  check (hex_code ~ '^#[0-9A-Fa-f]{6}$');

comment on constraint colors_hex_code_format on public.colors is
  'Fase 9.5 (incremento 6). hex_code es character(7): sin esto, char(n) rellena con espacios y admitia cualquier texto corto ("rojo" se guardaba como "rojo   "). Las 4 filas del seed ya cumplian el patron.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. La matriz solo crea variantes con atributos ACTIVOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Copia literal de la función de la 0021 con dos palabras añadidas en las dos
-- comprobaciones de existencia. Todo lo demás —atomicidad, idempotencia con
-- `is not distinct from`, tope de 100, `SECURITY INVOKER`— se conserva igual.

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

    -- El color y la talla deben existir Y ESTAR ACTIVOS. La FK garantizaría lo
    -- primero; lo segundo no lo garantiza nadie, y es lo que impide que un POST
    -- directo cree variantes con un atributo que el administrador ya retiró.
    if v_color is not null and not exists (
      select 1 from public.colors where id = v_color and is_active
    ) then
      raise exception 'INVALID_COLOR' using errcode = 'P0001';
    end if;
    if v_size is not null and not exists (
      select 1 from public.sizes where id = v_size and is_active
    ) then
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
  'Fase 8, endurecida en 0034. Crea en UNA transaccion las combinaciones que faltan. SECURITY INVOKER: RLS decide dentro. Desde la 0034 exige que el color y la talla esten ACTIVOS, para que retirar un atributo no se pueda saltar por POST directo. No hay restriccion sobre product_variants: una variante que YA usa un atributo retirado debe poder seguir editandose.';
