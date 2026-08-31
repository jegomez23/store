-- product_variants: unidad vendible real (docs/03-DATABASE.md §2.8, DEC-019).
-- color_id/size_id nullable para accesorios sin color/talla.

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  color_id uuid references public.colors (id),
  size_id uuid references public.sizes (id),
  sku text not null unique,
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price > price),
  stock int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color_id, size_id)
);

create index idx_product_variants_product_id on public.product_variants (product_id);
create index idx_product_variants_color_id on public.product_variants (color_id);
create index idx_product_variants_size_id on public.product_variants (size_id);

create trigger set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

alter table public.product_variants enable row level security;

create policy "public_read_variants_of_visible_products" on public.product_variants
  for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.status = 'active'
        and p.deleted_at is null
    )
  );

create policy "admin_all_product_variants" on public.product_variants
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
