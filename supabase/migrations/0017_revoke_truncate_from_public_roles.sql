-- Fase 4.5 — endurecimiento de privilegios (defensa en profundidad, DEC-009).
--
-- Supabase concede por defecto ALL PRIVILEGES sobre el esquema `public` a los
-- roles `anon` y `authenticated`. RLS filtra SELECT/INSERT/UPDATE/DELETE, pero
-- NO filtra TRUNCATE ni TRIGGER: son privilegios a nivel de tabla que ignoran
-- por completo las policies. Verificado en el proyecto real (Fase 4.5): anon y
-- authenticated tenían TRUNCATE sobre las 18 tablas, incluidas orders,
-- order_items y customers.
--
-- Hoy no es explotable a través de la API (PostgREST no expone TRUNCATE y no
-- hay RPC que lo invoque), por eso se clasifica como defensa en profundidad y
-- no como brecha activa. Se revoca igualmente: el modelo de seguridad del
-- proyecto (DEC-009) dice que la BD debe limitar el daño aunque el cliente
-- esté comprometido, y TRUNCATE es precisamente el privilegio que saltaría RLS.
--
-- `service_role` y `postgres` conservan todos sus privilegios.
--
-- REGLA PARA MIGRACIONES FUTURAS: toda tabla nueva de `public` debe repetir
-- este REVOKE en su propia migración, igual que repite ENABLE ROW LEVEL
-- SECURITY (ver docs/rules/database.md).

do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'revoke truncate, trigger on public.%I from anon, authenticated',
      r.relname
    );
  end loop;
end $$;

-- Evita que los DEFAULT PRIVILEGES vuelvan a conceder TRUNCATE/TRIGGER en las
-- tablas creadas a partir de ahora por el rol postgres.
alter default privileges in schema public
  revoke truncate, trigger on tables from anon, authenticated;
