-- colors, sizes: catálogos globales reutilizables entre mercados
-- (docs/03-DATABASE.md §2.4-2.5, docs/context/DOMAIN-MODEL.md).
--
-- Desviación de nombre respecto al documento: la columna "group" del
-- documento se implementa como "size_group" (evita tener que citar la
-- palabra reservada `group` en cada query). Documentado en 03-DATABASE.md.

create table public.colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  hex_code char(7) not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.sizes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  size_group text not null check (size_group in ('apparel', 'footwear', 'accessory')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (label, size_group)
);

alter table public.colors enable row level security;
alter table public.sizes enable row level security;

create policy "public_read_active_colors" on public.colors
  for select to anon, authenticated
  using (is_active);

create policy "admin_all_colors" on public.colors
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "public_read_active_sizes" on public.sizes
  for select to anon, authenticated
  using (is_active);

create policy "admin_all_sizes" on public.sizes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
