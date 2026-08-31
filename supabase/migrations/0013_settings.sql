-- settings: configuración comercial 1:1 con market (docs/03-DATABASE.md §2.16).
-- Fuente única del número de WhatsApp — nunca hardcodeado en código
-- (docs/context/DOMAIN-MODEL.md §Setting, KNOWN-CONSTRAINTS.md).

create table public.settings (
  market_id text primary key references public.markets (id),
  store_name text not null,
  logo_url text,
  whatsapp_number text not null,
  contact_email text,
  instagram_url text,
  tiktok_url text,
  facebook_url text,
  policies jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

alter table public.settings enable row level security;

-- Sin is_active propio (1:1 con market): se lee público solo si el mercado
-- asociado está activo, coherente con el resto del catálogo.
create policy "public_read_settings_of_active_market" on public.settings
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.markets m
      where m.id = settings.market_id and m.is_active
    )
  );

create policy "admin_all_settings" on public.settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
