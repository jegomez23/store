-- Configuración comercial y envíos del mercado ES. Seed de desarrollo:
-- whatsapp_number es un número de prueba, NO real (docs/rules/database.md #14).
-- Idempotente (Fase 4.5): reejecutable sin duplicados.

insert into public.settings (market_id, store_name, whatsapp_number, policies)
values ('ES', 'YI', '34600000000', '{}'::jsonb)
on conflict (market_id) do nothing;

-- shipping_methods no tiene clave natural con constraint (la PK es un uuid),
-- así que la idempotencia se resuelve con NOT EXISTS sobre (market_id, name).
insert into public.shipping_methods (market_id, name, description, price, free_shipping_threshold, sort_order)
select v.market_id, v.name, v.description, v.price, v.free_shipping_threshold, v.sort_order
from (values
  ('ES', 'Envío a Península', 'Entrega en 2-4 días laborables.', 4.90::numeric(12, 2), 60.00::numeric(12, 2), 1),
  ('ES', 'Recogida en tienda', 'Recoge tu pedido sin coste.', 0.00::numeric(12, 2), null::numeric(12, 2), 2)
) as v (market_id, name, description, price, free_shipping_threshold, sort_order)
where not exists (
  select 1 from public.shipping_methods sm
  where sm.market_id = v.market_id and sm.name = v.name
);
