-- Incremento 21: la ayuda con IA se enciende y se apaga desde el panel.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ UNA COLUMNA Y NO UNA VARIABLE DE ENTORNO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora el asistente estaba «activo» si existía la clave del proveedor.
-- Eso no es un interruptor del administrador: es uno del programador. Apagarlo
-- exigía tocar el despliegue, igual que antes del incremento 16 renombrar la
-- tienda exigía desplegar (DEC-071).
--
-- Con esta columna, Juan lo apaga desde `/admin/ajustes` —porque no le gusta
-- lo que propone, porque se ha gastado la cuota del mes, o porque prefiere
-- rellenar a mano— y la tienda sigue funcionando exactamente igual: el alta de
-- producto nunca ha dependido del asistente.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- APAGADA POR DEFECTO, Y A PROPÓSITO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `default false`: mandar una foto a un tercero es una decisión, no un estado
-- inicial. Una instalación nueva —o este mismo proyecto tras la migración— no
-- envía nada a ningún proveedor hasta que alguien lo enciende a mano.
--
-- ⚠️ NACE PRIVADA, y no hay que hacer nada para que lo sea: la 0041 revocó el
-- SELECT de tabla a `anon` y lo concede columna a columna, así que toda
-- columna nueva de `settings` es invisible para la tienda pública salvo que se
-- añada aquí un `grant select (…)` explícito. Esta NO lo lleva: es
-- configuración administrativa y el escaparate no tiene por qué conocerla.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ NO CAMBIA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- · Las policies de RLS de `settings`: siguen siendo las de la 0013 y la 0035
--   (lectura pública solo de mercados activos; escritura solo admin y solo en
--   mercados activos, DEC-035).
-- · `admin_change_log`: la configuración NO se audita ahí. Esa tabla es del
--   catálogo y tiene `product_id NOT NULL` (DEC-070).
-- · El estado de venta: encender o apagar la IA **no** es un bloqueo de venta.
--   `resolveSaleBlockers` solo contiene lo que impide completar un pedido, y
--   hay un test que impide que crezca por cosas como esta (DEC-070, DEC-077).

alter table public.settings
  add column if not exists ai_assist_enabled boolean not null default false;

comment on column public.settings.ai_assist_enabled is
  'Interruptor de la ayuda con IA en el alta de producto (0045). false por defecto: mandar una foto a un proveedor externo es una decision explicita del administrador. PRIVADA: anon no tiene grant de lectura (0041). Estar encendida NO basta para que el asistente funcione: hace falta ademas que el proveedor este configurado en el servidor.';
