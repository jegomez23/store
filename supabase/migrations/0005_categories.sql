-- categories: taxonomía jerárquica por mercado, máx. 2 niveles
-- (docs/03-DATABASE.md §2.3, docs/context/DOMAIN-MODEL.md).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  parent_id uuid references public.categories (id),
  name text not null,
  slug text not null,
  description text,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (market_id, slug)
);

create index idx_categories_parent_id on public.categories (parent_id);
create index idx_categories_market_id on public.categories (market_id);

create trigger set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Profundidad máxima 2 niveles: si la categoría tiene padre, ese padre debe
-- ser raíz (parent_id IS NULL). docs/03-DATABASE.md §2.3: "validar en app +
-- constraint opcional vía trigger" — implementado como trigger.
create or replace function public.enforce_category_depth()
returns trigger
language plpgsql
as $$
declare
  parent_has_parent boolean;
begin
  if new.parent_id is not null then
    select (parent_id is not null) into parent_has_parent
    from public.categories
    where id = new.parent_id;

    if parent_has_parent then
      raise exception 'categories: profundidad máxima de 2 niveles excedida (parent_id % ya tiene padre)', new.parent_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_category_depth
  before insert or update of parent_id on public.categories
  for each row execute function public.enforce_category_depth();

alter table public.categories enable row level security;

create policy "public_read_active_categories" on public.categories
  for select to anon, authenticated
  using (is_active and deleted_at is null);

create policy "admin_all_categories" on public.categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
