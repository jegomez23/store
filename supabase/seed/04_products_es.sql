-- Productos + imágenes + variantes del mercado ES. Seed de desarrollo — NO
-- son datos comerciales reales (docs/rules/database.md #13-14).
--
-- Un bloque DO por producto: más legible que encadenar CTEs con RETURNING
-- para un seed de este tamaño.
--
-- IDEMPOTENCIA (Fase 4.5): este archivo debe poder ejecutarse N veces sin
-- error ni duplicados. `products` tiene UNIQUE(market_id, slug), pero
-- `product_images` y la tupla de `product_variants` no tienen una clave
-- natural con constraint utilizable en ON CONFLICT, así que se usa el patrón
-- `insert ... select ... where not exists (...)`.
-- Consecuencia deliberada: el seed NO actualiza filas ya existentes (no es
-- un upsert); si cambian los datos de seed, reaplicar con `db reset`.

do $$
declare
  v_category_id uuid;
  v_product_id uuid;
  v_color_id uuid;
begin
  -- 1. Chaqueta cortavientos Cumbre
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'chaquetas';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status, is_new, is_featured)
  values (
    'ES', v_category_id,
    'Chaqueta cortavientos Cumbre', 'chaqueta-cortavientos-cumbre',
    'Cortavientos técnico con corte urbano.',
    'Cortavientos ligero pensado para moverte entre la ciudad y la montaña. Tejido resistente al agua, capucha ajustable y bolsillos con cremallera.',
    'Nylon ripstop reciclado, forro interior de malla.',
    'active', true, true
  )
  on conflict (market_id, slug) do nothing;

  select id into v_product_id from public.products where market_id = 'ES' and slug = 'chaqueta-cortavientos-cumbre';

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  select v_product_id, 'chaqueta-cortavientos-cumbre/01-main.jpg', 'Chaqueta cortavientos Cumbre en negro', 0, true
  where not exists (
    select 1 from public.product_images pi
    where pi.product_id = v_product_id
      and pi.url = 'chaqueta-cortavientos-cumbre/01-main.jpg'
  );

  select id into v_color_id from public.colors where slug = 'negro';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-CCC-NEG-' || s.label, 89.90, 12
  from public.sizes s
  where s.size_group = 'apparel' and s.label in ('S', 'M', 'L')
    and not exists (
      select 1 from public.product_variants pv
      where pv.product_id = v_product_id and pv.color_id = v_color_id and pv.size_id = s.id
    );

  -- 2. Camiseta Sendero Oversize
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'camisetas';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status, is_new, is_featured)
  values (
    'ES', v_category_id,
    'Camiseta Sendero Oversize', 'camiseta-sendero-oversize',
    'Algodón pesado, corte oversize.',
    'Camiseta de algodón pesado con gráfico minimalista inspirado en curvas de nivel. Corte oversize, cuello reforzado.',
    '100% algodón peinado 220gsm.',
    'active', true, true
  )
  on conflict (market_id, slug) do nothing;

  select id into v_product_id from public.products where market_id = 'ES' and slug = 'camiseta-sendero-oversize';

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  select v_product_id, 'camiseta-sendero-oversize/01-main.jpg', 'Camiseta Sendero Oversize en crema', 0, true
  where not exists (
    select 1 from public.product_images pi
    where pi.product_id = v_product_id
      and pi.url = 'camiseta-sendero-oversize/01-main.jpg'
  );

  select id into v_color_id from public.colors where slug = 'piedra';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-CSO-PIE-' || s.label, 34.90, 20
  from public.sizes s
  where s.size_group = 'apparel' and s.label in ('S', 'M', 'L')
    and not exists (
      select 1 from public.product_variants pv
      where pv.product_id = v_product_id and pv.color_id = v_color_id and pv.size_id = s.id
    );

  -- 3. Pantalón cargo Altiplano
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'pantalones';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status, is_featured)
  values (
    'ES', v_category_id,
    'Pantalón cargo Altiplano', 'pantalon-cargo-altiplano',
    'Cargo técnico con bolsillos utilitarios.',
    'Pantalón cargo de corte recto con bolsillos utilitarios y cintura ajustable. Tejido resistente para uso diario en la ciudad.',
    'Algodón/elastano, tratamiento repelente al agua.',
    'active', true
  )
  on conflict (market_id, slug) do nothing;

  select id into v_product_id from public.products where market_id = 'ES' and slug = 'pantalon-cargo-altiplano';

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  select v_product_id, 'pantalon-cargo-altiplano/01-main.jpg', 'Pantalón cargo Altiplano en verde bosque', 0, true
  where not exists (
    select 1 from public.product_images pi
    where pi.product_id = v_product_id
      and pi.url = 'pantalon-cargo-altiplano/01-main.jpg'
  );

  select id into v_color_id from public.colors where slug = 'verde-bosque';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-PCA-VBQ-' || s.label, 59.90, 10
  from public.sizes s
  where s.size_group = 'apparel' and s.label in ('M', 'L')
    and not exists (
      select 1 from public.product_variants pv
      where pv.product_id = v_product_id and pv.color_id = v_color_id and pv.size_id = s.id
    );

  -- 4. Gorra Horizonte (accesorio, talla única)
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'accesorios';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status, is_featured)
  values (
    'ES', v_category_id,
    'Gorra Horizonte', 'gorra-horizonte',
    'Gorra ajustable, bordado minimalista.',
    'Gorra de seis paneles con bordado minimalista del logo YI. Cierre ajustable trasero.',
    'Algodón twill.',
    'active', true
  )
  on conflict (market_id, slug) do nothing;

  select id into v_product_id from public.products where market_id = 'ES' and slug = 'gorra-horizonte';

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  select v_product_id, 'gorra-horizonte/01-main.jpg', 'Gorra Horizonte en negro', 0, true
  where not exists (
    select 1 from public.product_images pi
    where pi.product_id = v_product_id
      and pi.url = 'gorra-horizonte/01-main.jpg'
  );

  select id into v_color_id from public.colors where slug = 'negro';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-GHZ-NEG-UNI', 24.90, 30
  from public.sizes s
  where s.size_group = 'accessory' and s.label = 'Única'
    and not exists (
      select 1 from public.product_variants pv
      where pv.product_id = v_product_id and pv.color_id = v_color_id and pv.size_id = s.id
    );
end $$;
