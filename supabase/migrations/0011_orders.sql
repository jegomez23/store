-- orders + order_items + order_events (docs/03-DATABASE.md §2.12-2.14).
-- Todas privadas: sin lectura pública, sin excepciones
-- (docs/rules/database.md #11, docs/context/KNOWN-CONSTRAINTS.md).

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  market_id text not null references public.markets (id),
  customer_id uuid not null references public.customers (id),
  channel text not null check (channel in ('whatsapp', 'online')),
  status text not null default 'pending' check (
    status in ('pending', 'contacted', 'confirmed', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  currency_code char(3) not null,
  subtotal numeric(12, 2) not null,
  discount_total numeric(12, 2) not null default 0,
  shipping_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  shipping_address jsonb,
  notes text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_market_status on public.orders (market_id, status);
create index idx_orders_customer_id on public.orders (customer_id);
create index idx_orders_created_at on public.orders (created_at desc);

create trigger set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  color_name text,
  size_label text,
  sku text,
  unit_price numeric(12, 2) not null,
  quantity int not null check (quantity > 0),
  line_total numeric(12, 2) not null
);

create index idx_order_items_order_id on public.order_items (order_id);
create index idx_order_items_variant_id on public.order_items (variant_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index idx_order_events_order_id on public.order_events (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

create policy "admin_all_orders" on public.orders
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin_all_order_items" on public.order_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- order_events es append-only: solo INSERT + SELECT para admin, nunca
-- UPDATE/DELETE (docs/03-DATABASE.md §2.14). REVOKE explícito además de RLS
-- como defensa en profundidad (docs/rules/backend.md #WhatsApp/checkout no
-- aplica aquí; regla general de append-only del propio documento).
create policy "admin_read_order_events" on public.order_events
  for select to authenticated
  using (public.is_admin());

create policy "admin_insert_order_events" on public.order_events
  for insert to authenticated
  with check (public.is_admin());

revoke update, delete on public.order_events from authenticated, anon;
