-- Extensiones y funciones auxiliares reutilizadas por el resto de migraciones.
-- docs/rules/database.md: toda migración debe aplicar limpiamente sobre un
-- proyecto fresco.

create extension if not exists pgcrypto;

-- Trigger genérico para mantener updated_at (docs/rules/database.md #5).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Actualiza updated_at en cada UPDATE. Adjuntar como BEFORE UPDATE trigger a toda tabla con esa columna.';
