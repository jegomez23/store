-- Fase 9.5 — Incremento 4: reposición de stock atómica y acumulativa.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA, REPRODUCIDO ANTES DE ESCRIBIR ESTO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `updateVariantAction` escribe un valor ABSOLUTO leído antes en el formulario:
-- read → modify → write. Medido contra el proyecto real, con stock 12 y dos
-- reposiciones simultáneas de +10 y +7:
--
--     esperado 29 · real 19  →  diez unidades desaparecidas en silencio
--
-- No es un caso teórico: basta con dos pestañas abiertas, o con que el admin
-- deje una ficha cargada mientras cuenta cajas. La UI no puede protegerlo —
-- deshabilitar un botón no impide un segundo POST.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓN: DELTA, NO VALOR ABSOLUTO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Han llegado 10 unidades" es una SUMA, y una suma no necesita saber sobre qué
-- valor se decidió. `stock = stock + delta` dentro de una transacción es
-- inmune a la pérdida de actualizaciones por construcción: la segunda
-- transacción espera el bloqueo de fila de la primera y vuelve a leer el valor
-- ya actualizado. Diez reposiciones simultáneas suman las diez.
--
-- La corrección absoluta ("el recuento real es 7") es otra operación distinta,
-- sí necesita saber sobre qué valor se decidió, y se resuelve aparte con un
-- testigo `updated_at` en `updateVariantAction`. No se mezclan aquí.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURIDAD
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `SECURITY INVOKER`: RLS sigue aplicándose dentro, incluida la restricción de
-- mercado ACTIVO de la migración 0020. Sin service role.
--
-- AISLAMIENTO DE MERCADO: la policy `admin_all_product_variants` exige mercado
-- activo, no mercado CONCRETO. Hoy CO está inactivo, pero apoyarse en eso sería
-- una barrera única. Por eso `p_market_id` —que pone el SERVIDOR desde
-- `getActiveMarket()`, nunca un formulario— se revalida contra CADA variante
-- dentro de la transacción. Si una no pertenece, **falla el lote entero**: un
-- lote aplicado a medias es peor que uno rechazado, porque nadie sabría qué
-- parte se aplicó.
--
-- ATOMICIDAD: una función es una transacción. Cualquier `raise` deshace todo lo
-- anterior del lote.

create or replace function public.admin_restock_variants(
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
  v_variant_id uuid;
  v_delta int;
  v_new_stock int;
  v_applied int := 0;
  v_slugs text[] := array[]::text[];
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  -- Tope de cordura: un lote enorme no debe poder bloquear medio catálogo.
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- El id tiene que ser un uuid de verdad; si no, la conversión falla y con
    -- ella el lote entero.
    begin
      v_variant_id := (v_item ->> 'variant_id')::uuid;
    exception when others then
      raise exception 'INVALID_VARIANT_ID';
    end;

    -- Solo enteros. `'5.5'::int` redondearía en silencio, y "media unidad
    -- repuesta" no significa nada.
    if (v_item ->> 'delta') !~ '^-?[0-9]+$' then
      raise exception 'INVALID_DELTA';
    end if;
    v_delta := (v_item ->> 'delta')::int;

    if v_delta = 0 then
      raise exception 'INVALID_DELTA';
    end if;
    if abs(v_delta) > 100000 then
      raise exception 'DELTA_OUT_OF_RANGE';
    end if;

    -- Mercado: se comprueba SOBRE LA FILA, no sobre lo que dijo el cliente.
    -- `for update` bloquea la variante hasta el final de la transacción.
    select p.slug into v_slug
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = v_variant_id
      and p.market_id = p_market_id
      and p.deleted_at is null
    for update of v;

    if v_slug is null then
      raise exception 'VARIANT_NOT_IN_MARKET';
    end if;

    -- LA OPERACIÓN ATÓMICA. No se lee para luego escribir: se suma en la BD.
    update public.product_variants
       set stock = stock + v_delta
     where id = v_variant_id
     returning stock into v_new_stock;

    -- El CHECK `stock >= 0` de la 0008 ya lo impediría; se comprueba antes para
    -- devolver un error que el admin entienda en vez de uno de PostgreSQL.
    if v_new_stock < 0 then
      raise exception 'NEGATIVE_STOCK';
    end if;

    v_applied := v_applied + 1;
    if not (v_slug = any (v_slugs)) then
      v_slugs := array_append(v_slugs, v_slug);
    end if;
  end loop;

  -- Se devuelven los slugs afectados para que la Server Action invalide cada
  -- ficha por RUTA LITERAL (DEC-037/DEC-041). Sin esto, la tienda mostraría
  -- disponibilidad vieja hasta 5 minutos.
  return jsonb_build_object(
    'applied', v_applied,
    'slugs', to_jsonb(v_slugs)
  );
end;
$$;

comment on function public.admin_restock_variants(text, jsonb) is
  'Fase 9.5. Reposicion de stock por DELTA, atomica y acumulativa: stock = stock + delta. Inmune a la perdida de actualizaciones, a diferencia del UPDATE absoluto. Revalida el mercado de cada variante dentro de la transaccion; si una no pertenece, falla el lote entero. SECURITY INVOKER.';

revoke all on function public.admin_restock_variants(text, jsonb) from public;
grant execute on function public.admin_restock_variants(text, jsonb) to authenticated;
