-- Configuración comercial y envíos del mercado ES. Seed de desarrollo:
-- whatsapp_number es un número de prueba, NO real (docs/rules/database.md #14).

insert into public.settings (market_id, store_name, whatsapp_number, policies)
values ('ES', 'YI', '34600000000', '{}'::jsonb)
on conflict (market_id) do nothing;

insert into public.shipping_methods (market_id, name, description, price, free_shipping_threshold, sort_order)
values
  ('ES', 'Envío a Península', 'Entrega en 2-4 días laborables.', 4.90, 60.00, 1),
  ('ES', 'Recogida en tienda', 'Recoge tu pedido sin coste.', 0.00, null, 2);
