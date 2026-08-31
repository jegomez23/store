-- Categorías del mercado ES (mercado operativo, DEC-014). Seed de desarrollo.

insert into public.categories (market_id, name, slug, sort_order)
values
  ('ES', 'Chaquetas', 'chaquetas', 1),
  ('ES', 'Camisetas', 'camisetas', 2),
  ('ES', 'Pantalones', 'pantalones', 3),
  ('ES', 'Accesorios', 'accesorios', 4)
on conflict (market_id, slug) do nothing;
