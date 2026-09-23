-- Incremento 16: la identidad pública de la tienda deja de vivir en el código,
-- y `settings` deja de aceptar valores que rompen lo que pinta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. `tagline`: la frase que ya estaba escrita CINCO veces en el repositorio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- «Vive a tu propio ritmo.» aparecía literal en:
--
--     app/layout.tsx                 → description de TODA la web
--     app/(store)/page.tsx           → openGraph.description y twitter.description
--     app/(store)/page.tsx           → fallback del subtítulo del hero
--     components/store/Footer.tsx    → bajo el nombre de la tienda
--     app/opengraph-image.tsx        → la imagen que se ve al compartir
--
-- Es la descripción con la que la tienda sale en Google y en cualquier enlace
-- compartido: una decisión comercial, no una constante técnica. Cambiarla
-- exigía tocar cinco archivos y desplegar.
--
-- Se hace NULLABLE a propósito. Vacío no significa «pon el texto por defecto»:
-- significa que la tienda no publica descripción, y entonces no se pinta
-- ninguna (regla #9 de CLAUDE.md: no se inventa copy comercial). El backfill
-- copia el valor que hoy tiene el código, así que el comportamiento visible no
-- cambia hasta que alguien lo edite.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Los límites suben a PostgreSQL (lección del incremento 9, DEC-064)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `validateSettingsInput` ya rechazaba el nombre vacío, un email inválido y
-- una URL que no fuese https. Pero esa validación solo protege UN camino de
-- escritura: el formulario. Comprobado contra el proyecto real antes de
-- escribir esto, con la sesión de un admin y sin pasar por el panel:
--
--     PATCH /rest/v1/settings?market_id=eq.ES  (Prefer: return=representation)
--     {"store_name":"   "}                      → 200, store_name queda '   '
--     {"instagram_url":"javascript:alert(1)"}   → 200, guardado tal cual
--     {"contact_email":"no-es-un-email"}        → 200, guardado tal cual
--
-- El segundo acaba en el `href` de un enlace del footer de TODAS las páginas.
-- Es un admin quien lo escribe, así que no es escalada de privilegios; pero
-- «solo el admin puede hacerlo» no es razón para dejar que la base de datos
-- acepte un estado que ninguna pantalla sabe pintar.
--
-- Los patrones son deliberadamente LAXOS —no validan que el dominio exista ni
-- que el email reciba correo—: solo impiden lo que rompe el renderizado. Las
-- longitudes son las mismas que ya usa `SETTINGS_LIMITS` en TypeScript.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Qué NO hace esta migración
-- ═══════════════════════════════════════════════════════════════════════════
--
-- · No toca `logo_url` ni `policies`: siguen sin tener pantalla que los use, y
--   ponerles límites ahora sería legislar sobre algo que no existe.
-- · No toca las policies de RLS (0013/0020) ni el GRANT del admin.
-- · No audita nada en `admin_change_log`: esa tabla es del CATÁLOGO
--   (`product_id NOT NULL`), no de la configuración.

alter table public.settings
  add column if not exists tagline text;

-- Backfill con el valor que HOY tiene el código, para todos los mercados: es
-- exactamente lo que se estaba pintando antes de esta migración.
update public.settings
   set tagline = 'Vive a tu propio ritmo.'
 where tagline is null;

comment on column public.settings.tagline is
  'Frase de la tienda: description del sitio, openGraph y footer. NULL = la tienda no publica descripcion y no se pinta ninguna (nunca se sustituye por un texto por defecto).';

-- ─────────────────────────── Integridad (punto 2) ───────────────────────────

-- ⚠️ ESTAS DOS COMPROBACIONES SE QUEDAN CORTAS Y LAS CORRIGE LA 0043.
-- `btrim(x)` sin segundo argumento recorta SOLO espacios, no tabuladores ni
-- saltos de línea, así que `store_name = E'\t\n '` las pasaba. Se dejan tal y
-- como se aplicaron —reescribir una migración ya ejecutada haría que el
-- repositorio describiera una base de datos que no existe— y la 0043 las
-- sustituye por `~ '[^[:space:]]'`, que es el equivalente de `.trim()`.
alter table public.settings
  add constraint settings_store_name_valid
    check (btrim(store_name) <> '' and length(store_name) <= 80);

alter table public.settings
  add constraint settings_tagline_valid
    check (tagline is null or (btrim(tagline) <> '' and length(tagline) <= 160));

-- Mismo criterio que `validateSettingsInput`: algo@algo.xx, sin espacios.
alter table public.settings
  add constraint settings_contact_email_valid
    check (
      contact_email is null
      or (
        length(contact_email) <= 254
        and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
      )
    );

-- Solo https: el valor acaba en un `href`. Con `http:` o `javascript:` fuera,
-- el enlace del footer no puede convertirse en un vector.
alter table public.settings
  add constraint settings_instagram_url_valid
    check (instagram_url is null or (length(instagram_url) <= 300 and instagram_url ~ '^https://[^[:space:]]+$'));

alter table public.settings
  add constraint settings_tiktok_url_valid
    check (tiktok_url is null or (length(tiktok_url) <= 300 and tiktok_url ~ '^https://[^[:space:]]+$'));

alter table public.settings
  add constraint settings_facebook_url_valid
    check (facebook_url is null or (length(facebook_url) <= 300 and facebook_url ~ '^https://[^[:space:]]+$'));

-- ──────────────── La columna nueva nace PRIVADA (0041): se abre ────────────
--
-- `tagline` se pinta en el footer, en la metadata y en la imagen de Open Graph
-- de la tienda pública: es pública por naturaleza y hay que decirlo aquí a
-- propósito, que es justo lo que la 0041 quería conseguir.

grant select (tagline) on public.settings to anon;
