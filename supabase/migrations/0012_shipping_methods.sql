-- shipping_methods: opciones de envío por mercado (docs/03-DATABASE.md §2.15).

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  free_shipping_threshold numeric(12, 2),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shipping_methods_market_id on public.shipping_methods (market_id);

create trigger set_updated_at
  before update on public.shipping_methods
  for each row execute function public.set_updated_at();

alter table public.shipping_methods enable row level security;

create policy "public_read_active_shipping_methods" on public.shipping_methods
  for select to anon, authenticated
  using (is_active);

create policy "admin_all_shipping_methods" on public.shipping_methods
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
