-- Seed de desarrollo — NO son datos comerciales reales (docs/rules/database.md #13-14).
-- DEC-014: España es el mercado inicial operativo. Colombia queda soportado
-- arquitectónicamente (fila existe, FKs válidas) pero inactivo hasta que se
-- decida su lanzamiento — por eso is_active = false y sin seed operativo
-- propio (categorías/productos/settings) en los siguientes archivos.

insert into public.markets (id, name, currency_code, locale, is_active)
values
  ('ES', 'España', 'EUR', 'es-ES', true),
  ('CO', 'Colombia', 'COP', 'es-CO', false)
on conflict (id) do nothing;
