-- Productos + imágenes + variantes del mercado ES. Seed de desarrollo — NO
-- son datos comerciales reales (docs/rules/database.md #13-14). Los
-- mocks de Fase 2 (lib/mock/products.ts) siguen siendo mocks de UI, no se
-- reutilizan como fuente aquí.
--
-- Un bloque DO por producto: más legible que encadenar CTEs con RETURNING
-- para un seed de este tamaño.

do $$
declare
  v_category_id uuid;
  v_product_id uuid;
  v_color_id uuid;
begin
  -- 1. Chaqueta cortavientos Cumbre
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'chaquetas';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status, is_new)
  values (
    'ES', v_category_id,
    'Chaqueta cortavientos Cumbre', 'chaqueta-cortavientos-cumbre',
    'Cortavientos técnico con corte urbano.',
    'Cortavientos ligero pensado para moverte entre la ciudad y la montaña. Tejido resistente al agua, capucha ajustable y bolsillos con cremallera.',
    'Nylon ripstop reciclado, forro interior de malla.',
    'active', true
  )
  returning id into v_product_id;

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  values (v_product_id, 'products/chaqueta-cortavientos-cumbre/01-main.jpg', 'Chaqueta cortavientos Cumbre en negro', 0, true);

  select id into v_color_id from public.colors where slug = 'negro';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-CCC-NEG-' || s.label, 89.90, 12
  from public.sizes s where s.size_group = 'apparel' and s.label in ('S', 'M', 'L');

  -- 2. Camiseta Sendero Oversize
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'camisetas';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status, is_new)
  values (
    'ES', v_category_id,
    'Camiseta Sendero Oversize', 'camiseta-sendero-oversize',
    'Algodón pesado, corte oversize.',
    'Camiseta de algodón pesado con gráfico minimalista inspirado en curvas de nivel. Corte oversize, cuello reforzado.',
    '100% algodón peinado 220gsm.',
    'active', true
  )
  returning id into v_product_id;

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  values (v_product_id, 'products/camiseta-sendero-oversize/01-main.jpg', 'Camiseta Sendero Oversize en crema', 0, true);

  select id into v_color_id from public.colors where slug = 'piedra';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-CSO-PIE-' || s.label, 34.90, 20
  from public.sizes s where s.size_group = 'apparel' and s.label in ('S', 'M', 'L');

  -- 3. Pantalón cargo Altiplano
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'pantalones';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status)
  values (
    'ES', v_category_id,
    'Pantalón cargo Altiplano', 'pantalon-cargo-altiplano',
    'Cargo técnico con bolsillos utilitarios.',
    'Pantalón cargo de corte recto con bolsillos utilitarios y cintura ajustable. Tejido resistente para uso diario en la ciudad.',
    'Algodón/elastano, tratamiento repelente al agua.',
    'active'
  )
  returning id into v_product_id;

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  values (v_product_id, 'products/pantalon-cargo-altiplano/01-main.jpg', 'Pantalón cargo Altiplano en verde bosque', 0, true);

  select id into v_color_id from public.colors where slug = 'verde-bosque';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-PCA-VBQ-' || s.label, 59.90, 10
  from public.sizes s where s.size_group = 'apparel' and s.label in ('M', 'L');

  -- 4. Gorra Horizonte (accesorio, talla única)
  select id into v_category_id from public.categories where market_id = 'ES' and slug = 'accesorios';

  insert into public.products (market_id, category_id, name, slug, short_description, description, materials, status)
  values (
    'ES', v_category_id,
    'Gorra Horizonte', 'gorra-horizonte',
    'Gorra ajustable, bordado minimalista.',
    'Gorra de seis paneles con bordado minimalista del logo YI. Cierre ajustable trasero.',
    'Algodón twill.',
    'active'
  )
  returning id into v_product_id;

  insert into public.product_images (product_id, url, alt_text, sort_order, is_primary)
  values (v_product_id, 'products/gorra-horizonte/01-main.jpg', 'Gorra Horizonte en negro', 0, true);

  select id into v_color_id from public.colors where slug = 'negro';
  insert into public.product_variants (product_id, color_id, size_id, sku, price, stock)
  select v_product_id, v_color_id, s.id, 'YI-ES-GHZ-NEG-UNI', 24.90, 30
  from public.sizes s where s.size_group = 'accessory' and s.label = 'Única';
end $$;
