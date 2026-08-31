-- promotions + pivotes: mecanismo de descuento (docs/03-DATABASE.md §2.9-2.10).

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  name text not null,
  type text not null check (type in ('percentage', 'fixed_amount', 'special_price', 'code')),
  value numeric(12, 2) not null,
  code text,
  scope text not null check (scope in ('all', 'products', 'categories')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_code_unique_per_market unique (market_id, code),
  constraint promotions_value_matches_type check (
    (type = 'percentage' and value > 0 and value <= 100)
    or (type in ('fixed_amount', 'special_price', 'code') and value > 0)
  )
);

create index idx_promotions_market_id on public.promotions (market_id);

create trigger set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

create table public.promotion_products (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promotion_id, product_id)
);

create table public.promotion_categories (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (promotion_id, category_id)
);

alter table public.promotions enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotion_categories enable row level security;

-- Lectura pública solo de promociones activas y vigentes
-- (docs/08-SECURITY.md §4, variante documentada del patrón estándar).
create policy "public_read_active_promotions" on public.promotions
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "admin_all_promotions" on public.promotions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "public_read_promotion_products" on public.promotion_products
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.promotions promo
      where promo.id = promotion_products.promotion_id
        and promo.is_active
        and (promo.starts_at is null or promo.starts_at <= now())
        and (promo.ends_at is null or promo.ends_at >= now())
    )
  );

create policy "admin_all_promotion_products" on public.promotion_products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "public_read_promotion_categories" on public.promotion_categories
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.promotions promo
      where promo.id = promotion_categories.promotion_id
        and promo.is_active
        and (promo.starts_at is null or promo.starts_at <= now())
        and (promo.ends_at is null or promo.ends_at >= now())
    )
  );

create policy "admin_all_promotion_categories" on public.promotion_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
