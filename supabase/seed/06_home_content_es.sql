-- Contenido editorial de Home del mercado ES. Seed de desarrollo.
-- Idempotente (Fase 4.5): reejecutable sin duplicados. Clave lógica usada:
-- (market_id, section, sort_order) — un mismo mercado puede tener varios
-- bloques de la misma sección, diferenciados por su orden.

insert into public.home_content (market_id, section, title, subtitle, cta_label, cta_href, sort_order)
select 'ES', 'hero', 'YI', 'Vive a tu propio ritmo.', 'Explorar', '#destacados', 1
where not exists (
  select 1 from public.home_content hc
  where hc.market_id = 'ES' and hc.section = 'hero' and hc.sort_order = 1
);
