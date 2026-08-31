-- markets: raíz de la dimensión comercial multi-mercado (DEC-008, DEC-014).
-- docs/03-DATABASE.md §2.1.

create table public.markets (
  id text primary key,
  name text not null,
  currency_code char(3) not null,
  locale text not null,
  is_active boolean not null default true
);

alter table public.markets enable row level security;

create policy "public_read_active_markets" on public.markets
  for select to anon, authenticated
  using (is_active);

create policy "admin_all_markets" on public.markets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
