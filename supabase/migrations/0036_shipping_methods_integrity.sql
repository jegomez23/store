-- Incremento 9 — el precio del envío pasa a editarse desde el panel.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ ESTA MIGRACIÓN EXISTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta el incremento 8, `shipping_methods` era una tabla que nadie escribía:
-- sus dos filas venían del seed y el checkout ni siquiera las leía. Desde que
-- el envío entra en el total del pedido (DEC-063), lo que hay en esta tabla
-- **decide lo que cobra la tienda**, y el panel va a dejar editarlo.
--
-- Eso cambia quién puede equivocarse y con qué consecuencia. Comprobado contra
-- el proyecto real ANTES de escribir el CRUD, con la sesión de un admin:
--
--     price = -1                    → 23514  (ya existía CHECK)
--     free_shipping_threshold = -50 → 201    ACEPTADO
--     name = ''                     → 201    ACEPTADO
--     name duplicado en el mercado  → 201    ACEPTADO
--
-- Las tres que pasan son erratas plausibles de un formulario, y ninguna avisa:
--
--   · Un umbral NEGATIVO hace que `subtotal >= umbral` sea SIEMPRE cierto, así
--     que el envío pasa a ser gratis para todo el mundo. Escribir "-50" en vez
--     de "50" regala el envío sin que nada lo indique.
--   · Un nombre VACÍO pinta una opción en blanco en el checkout: el cliente
--     tiene que elegir una entrega que no sabe cuál es.
--   · Dos métodos con el MISMO nombre en el mismo mercado son dos radios
--     idénticos con precios distintos.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EN LA BASE DE DATOS Y NO SOLO EN LA SERVER ACTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Porque el esquema ya trata esto así: `price >= 0` es un CHECK, `size_group`
-- es un CHECK y `colors.slug` es UNIQUE. La validación de la action es la
-- primera barrera; esto es la definitiva, y cubre también el PATCH directo a
-- PostgREST con la sesión del admin, que se salta TypeScript entero.
--
-- LAS DOS FILAS REALES YA CUMPLEN LAS TRES (verificado antes de aplicar):
--     Envío a Península   4.90   umbral 60.00
--     Recogida en tienda  0.00   umbral NULL
-- así que la migración entra sin tocar ni corregir un solo dato.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SOBRE EL UNIQUE: NO ES UNA REGLA NUEVA, ES LA QUE YA SE ASUMÍA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `supabase/seed/05_settings_and_shipping_es.sql` dice literalmente que
-- "shipping_methods no tiene clave natural con constraint (la PK es un uuid),
-- así que la idempotencia se resuelve con NOT EXISTS sobre (market_id, name)".
-- El seed YA trata ese par como clave natural; esto solo lo hace cierto. Y el
-- propio seed sigue siendo idempotente, porque su NOT EXISTS nunca llega a
-- intentar el duplicado.

alter table public.shipping_methods
  add constraint shipping_methods_threshold_non_negative
  check (free_shipping_threshold is null or free_shipping_threshold >= 0);

comment on constraint shipping_methods_threshold_non_negative on public.shipping_methods is
  'Incremento 9. Un umbral negativo haria que subtotal >= umbral fuese siempre cierto y el envio saliese gratis para todos. Coherente con el CHECK price >= 0 que ya existia.';

alter table public.shipping_methods
  add constraint shipping_methods_name_not_blank
  check (btrim(name) <> '');

comment on constraint shipping_methods_name_not_blank on public.shipping_methods is
  'Incremento 9. Un metodo sin nombre pinta una opcion en blanco en el checkout: el cliente elegiria una entrega que no sabe cual es.';

-- Índice UNIQUE en vez de constraint: da igual funcionalmente y deja margen a
-- convertirlo en parcial si algún día hiciera falta (por ejemplo ignorar los
-- retirados), sin tener que recrear una constraint con nombre.
create unique index if not exists shipping_methods_market_name_key
  on public.shipping_methods (market_id, name);

comment on index public.shipping_methods_market_name_key is
  'Incremento 9. Dos metodos con el mismo nombre en el mismo mercado son dos opciones indistinguibles en el checkout. El seed ya trataba (market_id, name) como clave natural; esto lo hace cierto.';
