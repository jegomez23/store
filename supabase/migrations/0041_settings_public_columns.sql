-- Incremento 15: `settings` deja de ser legible ENTERA por el anónimo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE SE MIDIÓ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La policy `public_read_settings_of_active_market` (0013) da acceso de
-- lectura a la FILA, y RLS no sabe filtrar columnas. Comprobado con la anon
-- key contra el proyecto real:
--
--     GET /rest/v1/settings?select=*
--     → {"market_id":"ES","store_name":"YI","logo_url":null,
--        "whatsapp_number":"…","contact_email":null,"instagram_url":null,
--        "tiktok_url":null,"facebook_url":null,"policies":{},"updated_at":"…"}
--
-- HOY eso no filtra nada: las diez columnas son públicas por naturaleza —el
-- número de WhatsApp acaba en un enlace `wa.me`, el nombre y las redes se
-- pintan en el footer desde este mismo incremento—. Así que esto **no arregla
-- una fuga**: cierra la puerta por la que entraría la próxima.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ AHORA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `settings` es exactamente la tabla donde va a aterrizar la configuración que
-- NO es pública: un Meta Pixel ID, un token de la Conversions API, una nota
-- interna. Con la lectura abierta a toda la fila, esa columna nacería visible
-- para cualquiera con la anon key —que viaja en el navegador— y nadie se
-- daría cuenta, porque el data layer sí selecciona columnas concretas y todo
-- parecería correcto.
--
-- Con GRANTs por columna, una columna NUEVA nace PRIVADA: si algún día tiene
-- que ser pública, hay que decirlo aquí a propósito. Falla hacia el lado
-- seguro, que es la regla del proyecto.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ NO CAMBIA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- · La policy de RLS: sigue siendo la de la 0013 (solo mercados activos).
-- · El admin: `authenticated` conserva la lectura completa, porque el panel
--   necesita la fila entera y hoy el único autenticado posible es un
--   administrador (no hay cuentas de cliente, DEC-011). **Si algún día existen
--   cuentas de cliente, esto hay que revisarlo**: quedaría documentado en
--   `08-SECURITY.md`.
-- · La escritura: ya estaba limitada al admin por la policy de la 0020.

revoke select on public.settings from anon;

grant select (
  market_id,
  store_name,
  logo_url,
  whatsapp_number,
  contact_email,
  instagram_url,
  tiktok_url,
  facebook_url,
  policies
) on public.settings to anon;

comment on table public.settings is
  'Configuracion comercial por mercado. El anonimo solo puede LEER las columnas concedidas explicitamente en la migracion 0041: una columna nueva nace PRIVADA. La escritura es solo del admin (policy de la 0020) y la lectura publica exige mercado activo (0013). updated_at queda fuera del grant publico: no aporta nada al cliente.';
