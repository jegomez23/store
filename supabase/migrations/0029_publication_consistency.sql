-- Fase 9.5 — Incremento 5B: publicación consistente.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ SIGNIFICA HOY "COMPRABLE", AUDITADO ANTES DE ESCRIBIR NADA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La AUTORIDAD es `create_order` (0018), porque es lo único que acepta o
-- rechaza una compra de verdad. Sus cuatro rechazos:
--
--   VARIANT_INACTIVE      not pv.is_active
--   PRODUCT_UNAVAILABLE   p.deleted_at is not null or p.status <> 'active'
--   WRONG_MARKET          p.market_id <> mercado  (+ MARKET_UNAVAILABLE)
--   OUT_OF_STOCK          stock < cantidad  →  para una unidad: stock <= 0
--
-- De ahí salen DOS conceptos distintos que hasta ahora estaban mezclados en
-- uno solo, y que esta migración separa. **Ninguno se inventa aquí.**
--
--   · PUBLICABLE  = tiene al menos UNA variante activa.
--   · VENDIBLE    = tiene al menos una variante activa CON STOCK.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ NO SE BLOQUEA PUBLICAR SIN STOCK
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Porque el agotado YA es comportamiento intencionado y documentado:
-- `AddToCartForm` pinta "Agotado" y desactiva la compra, `json-ld.ts` emite
-- `OutOfStock`, y `01-PRODUCT.md` §102 lo lista como caso previsto. Bloquear
-- la publicación por stock 0 contradiría una regla existente, y decidir si un
-- agotado debe ocultarse es una decisión de negocio que nadie ha tomado.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL DEFECTO REAL, REPRODUCIDO SOBRE EL BUILD SERVIDO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `getProductBySlug` devuelve NULL si el producto no tiene ninguna variante
-- activa, así que la ficha responde 404. Pero `getSitemapProducts` y
-- `getAllProductSlugs` filtraban SOLO por `status='active'`. Medido con tres
-- productos de prueba publicados y el build servido:
--
--     /producto/zz-5b-sin-variantes        404   ← anunciado en sitemap.xml
--     /producto/zz-5b-variante-inactiva    404   ← anunciado en sitemap.xml
--     /producto/zz-5b-agotado              200   ← correcto: "Agotado"
--
-- Dos de las ocho URLs del sitemap eran 404. Eso contradice DEC-039 ("el
-- sitemap solo describe rutas que EXISTEN") y es justo lo que descubre Google
-- antes que el dueño.
-- ───────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- 1. La regla, escrita UNA sola vez
-- ─────────────────────────────────────────────────────────────────────────
-- `language sql` + `stable` a propósito: así el planificador puede inlinearlas
-- dentro de la consulta que las llama, en vez de ejecutarlas fila a fila como
-- haría con plpgsql.

create or replace function public.product_has_active_variant(p_product_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.product_variants v
    where v.product_id = p_product_id and v.is_active
  );
$$;

comment on function public.product_has_active_variant(uuid) is
  'Fase 9.5 (5B). PUBLICABLE: sin ninguna variante activa la ficha publica devuelve 404, porque getProductBySlug retorna null. Derivado de create_order (VARIANT_INACTIVE), no inventado.';

create or replace function public.product_is_sellable(p_product_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.product_variants v
    where v.product_id = p_product_id and v.is_active and v.stock > 0
  );
$$;

comment on function public.product_is_sellable(uuid) is
  'Fase 9.5 (5B). VENDIBLE AHORA: alguna variante activa con stock. Un producto publicable pero no vendible se muestra como "Agotado", que es comportamiento intencionado (01-PRODUCT.md).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. La barrera de publicación, en PostgreSQL
-- ─────────────────────────────────────────────────────────────────────────
-- Va en un trigger y NO en la Server Action porque una action se salta: un
-- POST directo a PostgREST con `{"status":"active"}` pasaría por RLS —que solo
-- comprueba admin y mercado activo— sin tocar ni una línea de TypeScript.
--
-- Solo se comprueba en la TRANSICIÓN hacia `active`. Un producto que ya está
-- publicado y al que se le edita la descripción no vuelve a validarse: si
-- alguien desactivó su última variante después, el problema es real pero
-- bloquear una edición no lo arregla — lo señala la alerta del resumen. Y
-- **no se despublica nada automáticamente**, que está fuera de alcance.

create or replace function public.enforce_publishable_product()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- INSERT directo con status='active', o UPDATE que entra en 'active'.
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not public.product_has_active_variant(new.id)
  then
    raise exception 'NO_ACTIVE_VARIANT'
      using errcode = 'P0001',
            detail = 'Un producto sin variantes activas no se puede publicar: su ficha devolveria 404.';
  end if;

  return new;
end;
$$;

create trigger enforce_publishable_product
  before insert or update on public.products
  for each row execute function public.enforce_publishable_product();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. El resumen usa la MISMA función, no una copia del predicado
-- ─────────────────────────────────────────────────────────────────────────
-- Idéntico contrato: las mismas cinco claves, los mismos valores. Lo único
-- que cambia es que `unsellable_products` deja de repetir el `not exists` a
-- mano y llama a `product_is_sellable`, para que la definición viva en un
-- único sitio.

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

  select min(o.created_at) into v_oldest_waiting
  from public.orders o
  where o.market_id = p_market_id
    and o.status in ('pending', 'contacted');

  select count(*) into v_low_stock
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where p.market_id = p_market_id
    and p.status = 'active'
    and p.deleted_at is null
    and v.is_active
    and v.stock <= v.low_stock_threshold;

  select count(*) into v_unsellable
  from public.products p
  where p.market_id = p_market_id
    and p.status = 'active'
    and p.deleted_at is null
    and not public.product_is_sellable(p.id);

  return jsonb_build_object(
    'by_status', v_by_status,
    'orders_total', v_orders_total,
    'oldest_waiting_at', v_oldest_waiting,
    'low_stock_variants', v_low_stock,
    'unsellable_products', v_unsellable
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. QUIÉNES son, no solo cuántos
-- ─────────────────────────────────────────────────────────────────────────
-- La alerta del resumen decía "3 productos publicados sin stock" y enlazaba a
-- la lista de TODOS los activos: con cuarenta productos, dejaba al admin
-- delante de cuarenta filas sin marcar cuáles eran las tres. Esta función
-- devuelve exactamente esas, con el mismo predicado que las contó.
--
-- Además distingue los dos casos, que se arreglan de forma distinta:
--   'sin_variante_activa' → la ficha da 404. Hay que activar o crear una.
--   'agotado'             → se ve como "Agotado". Hay que reponer.

create or replace function public.admin_unsellable_products(
  p_market_id text,
  p_limit int default 50
)
returns table (
  id uuid,
  name text,
  slug text,
  reason text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select p.id,
         p.name,
         p.slug,
         case
           when not public.product_has_active_variant(p.id) then 'sin_variante_activa'
           else 'agotado'
         end as reason
  from public.products p
  where p.market_id = p_market_id
    and p.status = 'active'
    and p.deleted_at is null
    and not public.product_is_sellable(p.id)
  -- Lo roto antes que lo agotado: un 404 es peor que un "Agotado".
  order by public.product_has_active_variant(p.id), p.name
  limit greatest(1, least(p_limit, 200));
end;
$$;

comment on function public.admin_unsellable_products(text, int) is
  'Fase 9.5 (5B). Los productos que cuenta unsellable_products del resumen, con el MISMO predicado (product_is_sellable) y separando los dos casos: sin_variante_activa (la ficha da 404) y agotado (se muestra como Agotado).';
