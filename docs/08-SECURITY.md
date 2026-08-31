# 08 — SECURITY: Autenticación, autorización y protección de datos

> Modelo de seguridad completo. Principio rector (DEC-009): **la seguridad vive en la base de datos (RLS), no en ocultar rutas**.
>
> **Estado real:** §4 (RLS) y §6 (Storage) están **implementados** en `supabase/migrations/` (Fase 3) — sin validar contra Postgres real en este entorno (sin Docker disponible, ver `docs/context/CURRENT-STATE.md`). §2 (Auth), §3 (autorización en capas 1-3) y §5 (protección de rutas / `proxy.ts`) siguen **sin implementar** — se construyen en Fase 7 junto al panel admin; la Fase 3 solo dejó preparada la tabla `profiles` + `is_admin()` (capa 4, la definitiva) para que la UI de auth se apoye en algo real cuando llegue.

---

## 1. Modelo de amenazas v1

| Amenaza | Mitigación |
|---|---|
| Acceso anónimo a datos privados | RLS: público solo lee catálogo publicado |
| Suplantación de admin | Auth Supabase + verificación real de rol en cada request de admin |
| Manipulación de precios/stock desde cliente | Precios/stock solo se leen; mutaciones solo Server Actions server-side |
| Fuga de service role key | Nunca en cliente ni en `NEXT_PUBLIC_*`; solo módulo server-only |
| XSS vía contenido admin | React escapa por defecto; sin `dangerouslySetInnerHTML` salvo revisión |
| Enumeración de slugs/rutas | Respuestas 404 uniformes; sin filtración de existencia |

---

## 2. Autenticación

- Proveedor: **Supabase Auth** (email + contraseña).
- Sesión: JWT en cookie httpOnly gestionada por `@supabase/ssr` (cookies async en Next 16).
- Clientes:
  - `lib/supabase/server.ts` → componentes/actions (lee cookies del request).
  - `lib/supabase/browser.ts` → interacciones client-side.
  - `lib/supabase/admin.ts` → service role. **Solo importable desde código de servidor** (patrón `server-only`).
- Alta de admins: manual (SQL o dashboard Supabase). No hay self-signup hacia roles.
- Logout: revoca sesión y limpia cookies.

---

## 3. Autorización

### Roles
v1: un único rol `admin` en `profiles.role`. El esquema admite añadir `editor`/`viewer` después sin migración destructiva.

### Verificación en capas

```
1. proxy.ts            → ¿hay cookie de sesión? NO → redirect /admin/login   (optimista, UX)
2. app/admin/layout    → getUser() válido Y profiles.role='admin'            (real, obligatoria)
3. Server Actions      → re-verifican sesión+rol antes de CADA mutación       (real, obligatoria)
4. RLS PostgreSQL      → última barrera aunque todo lo anterior falle         (real, definitiva)
```

Regla: las capas 1–2 son UX/rendimiento; la autoridad es 3–4. Ninguna acción confía solo en el frontend.

---

## 4. Row Level Security — políticas por tabla

Helper común (migración inicial):

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
```

### Catálogo visible al público

```sql
-- products (ejemplo patrón; replicar en categories/images/variants con sus joins)
alter table products enable row level security;

create policy "public_read_active_products" on products
for select to anon, authenticated
using (
  status = 'active'
  and deleted_at is null
);

create policy "admin_all_products" on products
for all to authenticated
using (public.is_admin()) with check (public.is_admin());
```

Aplicar el mismo patrón a: `categories`, `product_images`, `product_variants`, `colors`, `sizes`, `promotions`, `promotion_*`, `shipping_methods`, `settings`, `home_content`, `markets`.

Variantes del patrón:
- `promotions`: lectura pública solo si `is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())`.
- `order_events`: admin INSERT + SELECT; sin UPDATE/DELETE (append-only).

### Tablas 100% privadas

`customers`, `orders`, `order_items`, `order_events`: **sin policy SELECT para anon** → inaccesibles desde la tienda pública incluso por error de código.

### `profiles`

```sql
create policy "read_own_profile" on profiles
for select to authenticated using (id = auth.uid());
create policy "admin_manage_profiles" on profiles
for all to authenticated using (is_admin()) with check (is_admin());
```
El rol solo se eleva por SQL/dashboard (service role), nunca por una action accesible.

---

## 5. Protección de rutas

| Zona | Mecanismo |
|---|---|
| `/admin/**` | proxy.ts (cookie presente?) + layout (getUser + rol) |
| `/admin/login` | Excluido del guard; si ya hay sesión válida → redirect a `/admin` |
| API pública futura (webhooks pago) | Validación de firma del proveedor; nunca trust del body |
| Server Actions | Verificación interna propia (no dependen del layout) |

`proxy.ts` (Fase 7) — esqueleto conceptual:

```ts
// proxy.ts — Next.js 16 (reemplaza middleware; runtime Node.js)
export function proxy(request: Request) {
  const hasSession = /* cookie sb-* presente */;
  if (!hasSession && request.url.includes('/admin')) {
    return Response.redirect(new URL('/admin/login', request.url));
  }
}
export const config = { matcher: '/admin/:path*' };
```

---

## 6. Supabase Storage

- Buckets `products` y `content`: públicos en LECTURA (URLs servidas por CDN de Supabase).
- Escritura: policies que exigen `is_admin()` (insert/update/delete).
- Validación de subida en app: tipo MIME imagen, tamaño ≤ 5MB, nombre regenerado server-side (nunca confiar en el nombre del cliente).

---

## 7. Secretos y configuración

| Secreto | Dónde | Expuesto al cliente |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | env pública | sí (por diseño) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | env pública | sí (protegido por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | env privada servidor | ❌ NUNCA |
| Números WhatsApp, emails | BD (`settings`) | vía APIs públicas controladas |

Checklist anti-fuga:
- [ ] Service role solo dentro de `lib/supabase/admin.ts` marcado `import 'server-only'`.
- [ ] Ningún `process.env.SUPABASE_SERVICE_ROLE_KEY` fuera de ese módulo.
- [ ] Revisión de bundle cliente: grep periódico de claves sensibles.

---

## 8. Validación de entrada

- Toda Server Action valida y normaliza su input (tipos, rangos, longitudes, slugs) antes de tocar BD.
- IDs siempre uuid validados; cantidades enteras > 0; dinero numeric ≥ 0.
- Mensajes de error genéricos al cliente; detalle solo en logs servidor.

## 9. Checklist OWASP aplicable (resumen)

- Broken Access Control → RLS + verificación en actions ✅
- Injection → queries parametrizadas (cliente Supabase) ✅
- Security Misconfiguration → headers sugeridos en next.config (X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy mínima) — aplicar en Fase 10
- Identification/Auth failures → rate limiting de login (Supabase lo incluye; revisar umbrales)