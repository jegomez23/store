-- product_images: galería (docs/03-DATABASE.md §2.7). Exactamente una
-- imagen principal por producto — garantizado por la app, no por constraint
-- (según el documento fuente).

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  alt_text text not null,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_product_images_product_id on public.product_images (product_id);

alter table public.product_images enable row level security;

create policy "public_read_images_of_visible_products" on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and p.status = 'active'
        and p.deleted_at is null
    )
  );

create policy "admin_all_product_images" on public.product_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
