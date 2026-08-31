-- Colores y tallas: catálogos globales (sin market_id). Seed de desarrollo.

insert into public.colors (name, slug, hex_code, sort_order)
values
  ('Negro', 'negro', '#111111', 1),
  ('Blanco', 'blanco', '#ffffff', 2),
  ('Piedra', 'piedra', '#9c9890', 3),
  ('Verde bosque', 'verde-bosque', '#3a4a3e', 4)
on conflict (slug) do nothing;

insert into public.sizes (label, size_group, sort_order)
values
  ('XS', 'apparel', 1),
  ('S', 'apparel', 2),
  ('M', 'apparel', 3),
  ('L', 'apparel', 4),
  ('XL', 'apparel', 5),
  ('38', 'footwear', 1),
  ('39', 'footwear', 2),
  ('40', 'footwear', 3),
  ('41', 'footwear', 4),
  ('42', 'footwear', 5),
  ('Única', 'accessory', 1)
on conflict (label, size_group) do nothing;
