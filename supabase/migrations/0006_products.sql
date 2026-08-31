-- products: ficha comercial (docs/03-DATABASE.md §2.6). Precio y stock NO
-- viven aquí — viven en product_variants (docs/context/DOMAIN-MODEL.md).

create table public.products (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  category_id uuid not null references public.categories (id),
  name text not null,
  slug text not null,
  short_description text,
  description text,
  materials text,
  care_instructions text,
  shipping_info_override text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_featured boolean not null default false,
  is_new boolean not null default false,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (market_id, slug)
);

create index idx_products_category_id on public.products (category_id);

create index idx_products_public on public.products (market_id, category_id)
  where status = 'active' and deleted_at is null;

create index idx_products_featured on public.products (market_id)
  where is_featured and status = 'active' and deleted_at is null;

create index idx_products_new on public.products (market_id)
  where is_new and status = 'active' and deleted_at is null;

create trigger set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy "public_read_active_products" on public.products
  for select to anon, authenticated
  using (status = 'active' and deleted_at is null);

create policy "admin_all_products" on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
