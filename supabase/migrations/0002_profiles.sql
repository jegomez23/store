-- profiles: admins vinculados a Supabase Auth (docs/03-DATABASE.md §2.2).
-- Alta manual, sin trigger de auto-creación en signup (DEC-020,
-- docs/context/DOMAIN-MODEL.md §Admin).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- is_admin(): SECURITY DEFINER para poder leer profiles sin recursión de RLS
-- (docs/08-SECURITY.md §4). Requiere que profiles ya exista, por eso va
-- después de crear la tabla.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

alter table public.profiles enable row level security;

create policy "read_own_profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "admin_manage_profiles" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
