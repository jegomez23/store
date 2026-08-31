-- home_content: bloques editoriales de la home por mercado
-- (docs/03-DATABASE.md §2.17).

create table public.home_content (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  section text not null check (section in ('hero', 'banner', 'strip_promo')),
  title text,
  subtitle text,
  cta_label text,
  cta_href text,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_home_content_market_id on public.home_content (market_id);

create trigger set_updated_at
  before update on public.home_content
  for each row execute function public.set_updated_at();

alter table public.home_content enable row level security;

create policy "public_read_active_home_content" on public.home_content
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "admin_all_home_content" on public.home_content
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
