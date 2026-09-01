-- Fase 4.5 — corrección de divergencia esquema real vs documentación.
--
-- docs/03-DATABASE.md §3 especifica para categories/products/images/variants:
--   "SELECT público: activos y no borrados (y market activo)"
-- Las policies de Fase 3 implementaron solo "activos y no borrados": el
-- catálogo de un mercado INACTIVO (hoy CO, DEC-014) era legible con la anon
-- key. `settings` ya aplicaba la comprobación de mercado activo
-- (0013_settings.sql), así que el esquema era además incoherente consigo mismo
-- y con `markets`, que sí oculta las filas inactivas (0003_markets.sql).
--
-- Se corrige aplicando la condición documentada. No es un cambio de decisión
-- arquitectónica: alinea la implementación con la documentación vigente
-- (DEC-008 multi-mercado + DEC-014 CO inactivo).

create or replace function public.is_active_market(p_market_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.markets m
    where m.id = p_market_id and m.is_active
  );
$$;

comment on function public.is_active_market(text) is
  'True si el mercado existe y está activo. SECURITY DEFINER para evaluarse igual dentro de policies sin depender de la RLS de markets.';

-- categories
drop policy "public_read_active_categories" on public.categories;
create policy "public_read_active_categories" on public.categories
  for select to anon, authenticated
  using (
    is_active
    and deleted_at is null
    and public.is_active_market(market_id)
  );

-- products
drop policy "public_read_active_products" on public.products;
create policy "public_read_active_products" on public.products
  for select to anon, authenticated
  using (
    status = 'active'
    and deleted_at is null
    and public.is_active_market(market_id)
  );

-- product_images: hereda la visibilidad del producto, mercado incluido.
drop policy "public_read_images_of_visible_products" on public.product_images;
create policy "public_read_images_of_visible_products" on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and p.status = 'active'
        and p.deleted_at is null
        and public.is_active_market(p.market_id)
    )
  );

-- product_variants: ídem, además de su propio is_active.
drop policy "public_read_variants_of_visible_products" on public.product_variants;
create policy "public_read_variants_of_visible_products" on public.product_variants
  for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.status = 'active'
        and p.deleted_at is null
        and public.is_active_market(p.market_id)
    )
  );
