-- Fase 8 — Correcciones previas al CMS de catálogo.
--
-- Esta migración NO añade funcionalidad: cierra tres huecos que el CRUD
-- administrativo convertiría en explotables. Se aplica ANTES de escribir una
-- sola pantalla nueva.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. AISLAMIENTO DE MERCADO EN LAS ESCRITURAS DE ADMIN (DEC-035)
--
--    Problema real: las policies de admin son `for all using (is_admin())` y
--    NO miran `market_id`. Además `profiles` no guarda a qué mercado pertenece
--    un admin, así que PostgreSQL no puede saberlo. Hasta Fase 7 daba igual
--    (solo se editaban filas existentes ya filtradas por código), pero con
--    CRUD un `insert` con `market_id = 'CO'` lo aceptaría RLS: la única
--    defensa sería TypeScript, es decir una barrera única — justo lo que
--    DEC-031 y DEC-034 prohíben.
--
--    Solución sin tocar el esquema ni la identidad: el admin solo puede leer y
--    escribir filas de un mercado ACTIVO. CO está inactivo (DEC-014), así que
--    la base de datos rechaza cualquier escritura sobre CO venga de donde
--    venga. Cuando Colombia se lance, se activa su fila en `markets` y su
--    catálogo pasa a ser administrable sin migración.
--
--    NO se aplica a `orders`, `order_items`, `order_events`, `customers` ni
--    `order_counters`: son historial operativo y el admin debe poder leerlos y
--    gestionarlos aunque un mercado se desactive (un pedido ya cobrado no deja
--    de existir porque se apague su mercado).
--
-- 2. DEC-022 EN LAS TABLAS QUE LA MIGRACIÓN 0016 SE DEJÓ
--
--    `docs/rules/database.md` #13 exige `is_active_market(market_id)` en toda
--    lectura pública de una tabla con `market_id`. La 0016 lo aplicó a
--    categories/products/product_images/product_variants, pero NO a
--    `home_content`, `promotions` ni `shipping_methods`, que también lo tienen.
--    Fase 8 hace `home_content` editable, así que el hueco pasaría a ser real.
--
-- 3. ENDURECIMIENTO DE STORAGE Y UNICIDAD DE LA IMAGEN PRINCIPAL
--
--    Los buckets se crearon sin `file_size_limit` ni `allowed_mime_types`
--    (verificado contra el proyecto real). Y `03-DATABASE.md` §2.7 decía que
--    "exactamente una principal por producto" lo garantiza la aplicación: con
--    CRUD real, dos peticiones concurrentes dejan dos principales.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Escrituras de admin acotadas a mercados activos
-- ═════════════════════════════════════════════════════════════════════════

-- Tablas con market_id propio.
drop policy if exists "admin_all_categories" on public.categories;
create policy "admin_all_categories" on public.categories
  for all to authenticated
  using (public.is_admin() and public.is_active_market(market_id))
  with check (public.is_admin() and public.is_active_market(market_id));

drop policy if exists "admin_all_products" on public.products;
create policy "admin_all_products" on public.products
  for all to authenticated
  using (public.is_admin() and public.is_active_market(market_id))
  with check (public.is_admin() and public.is_active_market(market_id));

drop policy if exists "admin_all_promotions" on public.promotions;
create policy "admin_all_promotions" on public.promotions
  for all to authenticated
  using (public.is_admin() and public.is_active_market(market_id))
  with check (public.is_admin() and public.is_active_market(market_id));

drop policy if exists "admin_all_shipping_methods" on public.shipping_methods;
create policy "admin_all_shipping_methods" on public.shipping_methods
  for all to authenticated
  using (public.is_admin() and public.is_active_market(market_id))
  with check (public.is_admin() and public.is_active_market(market_id));

drop policy if exists "admin_all_settings" on public.settings;
create policy "admin_all_settings" on public.settings
  for all to authenticated
  using (public.is_admin() and public.is_active_market(market_id))
  with check (public.is_admin() and public.is_active_market(market_id));

drop policy if exists "admin_all_home_content" on public.home_content;
create policy "admin_all_home_content" on public.home_content
  for all to authenticated
  using (public.is_admin() and public.is_active_market(market_id))
  with check (public.is_admin() and public.is_active_market(market_id));

-- Tablas hijas: el mercado se hereda del producto / la promoción.
drop policy if exists "admin_all_product_variants" on public.product_variants;
create policy "admin_all_product_variants" on public.product_variants
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and public.is_active_market(p.market_id)
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and public.is_active_market(p.market_id)
    )
  );

drop policy if exists "admin_all_product_images" on public.product_images;
create policy "admin_all_product_images" on public.product_images
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and public.is_active_market(p.market_id)
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and public.is_active_market(p.market_id)
    )
  );

drop policy if exists "admin_all_promotion_products" on public.promotion_products;
create policy "admin_all_promotion_products" on public.promotion_products
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.promotions promo
      where promo.id = promotion_products.promotion_id
        and public.is_active_market(promo.market_id)
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.promotions promo
      where promo.id = promotion_products.promotion_id
        and public.is_active_market(promo.market_id)
    )
  );

drop policy if exists "admin_all_promotion_categories" on public.promotion_categories;
create policy "admin_all_promotion_categories" on public.promotion_categories
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.promotions promo
      where promo.id = promotion_categories.promotion_id
        and public.is_active_market(promo.market_id)
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.promotions promo
      where promo.id = promotion_categories.promotion_id
        and public.is_active_market(promo.market_id)
    )
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 2. DEC-022: la lectura pública exige mercado activo (tablas que faltaban)
-- ═════════════════════════════════════════════════════════════════════════

drop policy if exists "public_read_active_home_content" on public.home_content;
create policy "public_read_active_home_content" on public.home_content
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and public.is_active_market(market_id)
  );

drop policy if exists "public_read_active_promotions" on public.promotions;
create policy "public_read_active_promotions" on public.promotions
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and public.is_active_market(market_id)
  );

drop policy if exists "public_read_active_shipping_methods" on public.shipping_methods;
create policy "public_read_active_shipping_methods" on public.shipping_methods
  for select to anon, authenticated
  using (is_active and public.is_active_market(market_id));

-- Los pivotes heredan la condición a través de la promoción.
drop policy if exists "public_read_promotion_products" on public.promotion_products;
create policy "public_read_promotion_products" on public.promotion_products
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.promotions promo
      where promo.id = promotion_products.promotion_id
        and promo.is_active
        and (promo.starts_at is null or promo.starts_at <= now())
        and (promo.ends_at is null or promo.ends_at >= now())
        and public.is_active_market(promo.market_id)
    )
  );

drop policy if exists "public_read_promotion_categories" on public.promotion_categories;
create policy "public_read_promotion_categories" on public.promotion_categories
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.promotions promo
      where promo.id = promotion_categories.promotion_id
        and promo.is_active
        and (promo.starts_at is null or promo.starts_at <= now())
        and (promo.ends_at is null or promo.ends_at >= now())
        and public.is_active_market(promo.market_id)
    )
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Una sola imagen principal por producto — garantizado por la BD
-- ═════════════════════════════════════════════════════════════════════════

-- Defensivo: si algún producto tuviera ya varias principales, se conserva la
-- de menor sort_order (y en empate, la más antigua). El seed actual tiene una
-- por producto, así que en la práctica no afecta a ninguna fila.
update public.product_images pi
   set is_primary = false
 where pi.is_primary
   and pi.id <> (
     select inner_pi.id
       from public.product_images inner_pi
      where inner_pi.product_id = pi.product_id
        and inner_pi.is_primary
      order by inner_pi.sort_order, inner_pi.created_at, inner_pi.id
      limit 1
   );

create unique index if not exists product_images_one_primary_per_product
  on public.product_images (product_id)
  where is_primary;

comment on index public.product_images_one_primary_per_product is
  'Fase 8: como maximo una imagen principal por producto. Antes lo garantizaba solo la aplicacion (03-DATABASE 2.7); con CRUD real dos peticiones concurrentes dejaban dos principales.';

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Endurecimiento de los buckets de Storage
-- ═════════════════════════════════════════════════════════════════════════
--
-- El límite "≤ 5MB, solo imagen" existía solo como validación de aplicación
-- prevista (08-SECURITY §6). Ahora es también una restricción de
-- infraestructura: doble barrera. La aplicación sigue validando por su cuenta
-- —y comprobando los magic bytes, no el MIME que declara el cliente—, porque
-- `allowed_mime_types` confía en la cabecera enviada en la subida.
--
-- SVG queda deliberadamente fuera: puede contener scripts y los buckets son
-- de lectura pública.

update storage.buckets
   set file_size_limit = 5242880,  -- 5 MiB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('products', 'content');
