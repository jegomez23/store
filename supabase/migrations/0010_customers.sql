-- customers: comprador identificado por WhatsApp (docs/03-DATABASE.md §2.11).
-- Tabla 100% privada: SIN policy SELECT para anon (docs/rules/database.md #11).

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  phone text not null,
  name text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, phone)
);

create index idx_customers_market_id on public.customers (market_id);

create trigger set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

-- Sin policy para anon/authenticated no-admin: sin SELECT ni escritura
-- pública. Solo admin.
create policy "admin_all_customers" on public.customers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
