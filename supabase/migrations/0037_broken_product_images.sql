-- Fase 9.5 — Incremento 10: imágenes que apuntan a un objeto inexistente.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL DEFECTO, MEDIDO CONTRA EL PROYECTO REAL ANTES DE ESCRIBIR NADA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El seed `04_products_es.sql` inserta una fila en `product_images` por
-- producto, pero NUNCA sube el objeto correspondiente: los buckets `products`
-- y `content` están vacíos. Medido:
--
--   storage.list('products')                          → 0 objetos
--   GET /storage/v1/object/public/products/<las 4>    → 400  (las cuatro)
--   GET /_next/image?url=<esa URL>                    → 400
--        «"url" parameter is valid but upstream response is invalid»
--
-- Consecuencias reales, no hipotéticas:
--
--   1. El HTML SERVIDO lleva un <img> roto. El fallback a `MockImage` vive en
--      `onError` de `RemoteImage`, que es de CLIENTE: solo actúa después de
--      hidratar. Antes de eso el cliente ve un hueco.
--   2. `og:image` y el `image` del JSON-LD `Product` sirven esa misma URL. Al
--      compartir la ficha no hay previsualización, y `image` es propiedad
--      REQUERIDA del rich result de producto de Google.
--   3. El detector de "publicados sin foto" (P2) informa de que los cuatro
--      productos TIENEN foto, porque la FILA existe. Es cierto y es inútil.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ SE BORRAN LAS FILAS Y NO SE "ARREGLAN"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Una fila cuyo objeto no existe no tiene ningún valor recuperable: no se
-- puede pintar, no se puede optimizar y no se puede compartir. Lo único que
-- aporta es hacer mentir al detector de P2. Borrarla devuelve al producto a
-- su estado honesto —"publicado sin foto"—, que es exactamente lo que es.
--
-- El seed se corrige en el mismo incremento para que no las vuelva a crear.
--
-- ALCANCE DELIBERADO: solo filas con `url` NO vacía. La cadena vacía ya es
-- territorio de P2 (`enforce_publishable_product` no la toca y el renderizador
-- la trata como ausencia), y mezclar las dos cosas volvería a juntar dos
-- conceptos que el incremento P2 separó a propósito.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Limpieza de lo que ya está roto
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  v_deleted integer;
begin
  with borradas as (
    delete from public.product_images as pi
    where btrim(pi.url) <> ''
      and not exists (
        select 1
        from storage.objects as o
        where o.bucket_id = 'products'
          and o.name = pi.url
      )
    returning pi.id
  )
  select count(*) into v_deleted from borradas;

  raise notice 'product_images con objeto inexistente borradas: %', v_deleted;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. El detector permanente
-- ─────────────────────────────────────────────────────────────────────────
--
-- Existe porque la limpieza de arriba resuelve el presente y nada más. Un
-- objeto borrado a mano desde el panel de Supabase, o una subida que escriba
-- la fila y falle al guardar el objeto, vuelven a producir el mismo estado sin
-- que nadie lo note: la fila existe, la ficha responde 200 y la foto no está.
--
-- SECURITY DEFINER porque `storage.objects` tiene su propia RLS y el rol de la
-- sesión no puede leerla. Eso obliga a poner la puerta DENTRO: `is_admin()` es
-- una condición del WHERE, así que un no-admin recibe cero filas y no un
-- error — misma forma que el resto de funciones admin del proyecto.
--
-- `is_active_market` además de `market_id`: DEC-035. Con el mercado apagado el
-- producto ya devuelve [] en el resto del panel; su diagnóstico no debe ser la
-- excepción que siga contestando.

create or replace function public.admin_products_with_broken_images(
  p_market_id text
)
returns table (
  product_id uuid,
  product_name text,
  product_slug text,
  image_id uuid,
  image_url text,
  is_primary boolean
)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select
    p.id,
    p.name,
    p.slug,
    pi.id,
    pi.url,
    pi.is_primary
  from public.product_images as pi
  join public.products as p on p.id = pi.product_id
  where public.is_admin()
    and p.market_id = p_market_id
    and public.is_active_market(p.market_id)
    and p.deleted_at is null
    and btrim(pi.url) <> ''
    and not exists (
      select 1
      from storage.objects as o
      where o.bucket_id = 'products'
        and o.name = pi.url
    )
  order by p.name, pi.sort_order, pi.id;
$$;

comment on function public.admin_products_with_broken_images(text) is
  'Filas de product_images cuyo objeto NO existe en el bucket products. '
  'SECURITY DEFINER para poder leer storage.objects; la puerta is_admin() va '
  'en el WHERE, así que un no-admin recibe cero filas. Incremento 10.';

revoke all on function public.admin_products_with_broken_images(text) from public;
revoke all on function public.admin_products_with_broken_images(text) from anon;
grant execute on function public.admin_products_with_broken_images(text) to authenticated;
