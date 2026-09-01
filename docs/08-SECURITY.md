# 08 — SECURITY: Autenticación, autorización y protección de datos

> Modelo de seguridad completo. Principio rector (DEC-009): **la seguridad vive en la base de datos (RLS), no en ocultar rutas**.
>
> **Estado real:** §4 (RLS) y §6 (Storage) están **implementados y VALIDADOS CONTRA EL PROYECTO SUPABASE REAL** (Fase 4.5, 2026-09-01). §2 (Auth), §3 (autorización en capas 1-3) y §5 (protección de rutas / `proxy.ts`) siguen **sin implementar** — se construyen en Fase 7 junto al panel admin; la Fase 3 dejó preparada la tabla `profiles` + `is_admin()` (capa 4, la definitiva) y la Fase 4.5 comprobó que esa capa funciona de verdad.
>
> **Resultado de la validación de Fase 4.5** (ejecutada contra la instancia real con anon key, un usuario autenticado sin rol y un admin temporal creado y eliminado durante la prueba):
> - **anon** lee el catálogo público permitido y **no obtiene ni una fila** de `customers`, `orders`, `order_items`, `order_events` ni `profiles`. Todos sus INSERT fueron rechazados (401/403, `42501`); UPDATE y DELETE afectaron 0 filas. Recuento de filas idéntico antes y después de la batería de escritura.
> - **authenticated sin rol admin** se comporta igual que anon: sin acceso a tablas privadas, sin escritura en catálogo. **Intento explícito de escalada de privilegios** (auto-insertarse en `profiles` con `role='admin'`) → denegado (403). El alta de admin solo es posible fuera de banda (service role / SQL), como exige DEC-020.
> - **admin** puede leer las tablas privadas y escribir en `products`, `categories`, `product_variants`, `product_images`, `promotions`, `settings`, `shipping_methods`, `home_content`, `customers` y `orders`.
> - **`order_events` es append-only de verdad:** el admin puede INSERT y SELECT, pero UPDATE y DELETE le son rechazados (403, `42501`) por el `REVOKE` de la migración 0011 — la restricción no depende solo de las policies.
> - **Storage:** lectura pública en `products`/`content`; `anon` no puede subir ni borrar; escritura solo con credencial admin/service role.
> - **Corregidas dos debilidades reales** encontradas en el proceso: DEC-022 (el catálogo de un mercado inactivo era público) y DEC-023 (TRUNCATE/TRIGGER concedidos a `anon`). Ninguna policy se debilitó para hacer funcionar la aplicación.

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
| Enumeración de pedidos por número | `order_number` es correlativo y adivinable (DEC-027), así que **no existe ningún endpoint que devuelva un pedido por su número**. `/pedido/[numero]` no consulta la BD: pinta lo que dejó el propio checkout en `sessionStorage` |
| Manipulación del carrito en localStorage | El checkout ignora precio y stock del cliente: `create_order` los resuelve en PostgreSQL (DEC-026) |
| Pedidos duplicados por doble clic/recarga | Idempotencia garantizada por un índice UNIQUE en BD, no por el estado del botón (DEC-028) |

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
- Tablas con `market_id` y lectura pública (`categories`, `products`, y a través de ellas `product_images`/`product_variants`): añadir `public.is_active_market(market_id)` — un mercado inactivo no expone su catálogo (DEC-022, migración `0016`).
- `promotions`: lectura pública solo si `is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())`.
- `order_events`: admin INSERT + SELECT; sin UPDATE/DELETE (append-only). El `REVOKE UPDATE, DELETE` es obligatorio además de las policies.

### Privilegios de tabla (no cubiertos por RLS)

RLS filtra SELECT/INSERT/UPDATE/DELETE, pero **no** TRUNCATE ni TRIGGER. Supabase concede ALL PRIVILEGES a `anon`/`authenticated` por defecto, así que toda migración que cree una tabla en `public` debe incluir:

```sql
revoke truncate, trigger on public.<tabla> from anon, authenticated;
```

Aplicado retroactivamente a las 18 tablas en `0017` (DEC-023).

### Escrituras públicas controladas: `create_order` (Fase 6, DEC-026)

Las tablas de pedidos **siguen sin ninguna policy pública de INSERT**. El único
camino por el que un cliente anónimo puede escribir en ellas es una función
`SECURITY DEFINER`:

```sql
create function public.create_order(...) returns jsonb
  language plpgsql security definer set search_path = public;
revoke all on function public.create_order(...) from public;
grant execute on function public.create_order(...) to anon, authenticated;
```

Por qué esto NO es un agujero:

- El cliente solo puede enviar `variant_id`, `quantity` y sus datos de contacto.
  **El precio no se recibe**: la función lo lee de `product_variants`. Un total
  inyectado ni siquiera tiene parámetro por el que entrar (la llamada falla con 404).
- Valida mercado activo, variante activa, producto publicado y no borrado, y
  que la variante pertenezca al mercado.
- Descuenta stock con guard atómico; sin stock no hay pedido.
- Todo ocurre en una transacción: cualquier error revierte también el stock.
- El pedido nace `pending`. **Nunca `paid`.**

Verificado contra la instancia real (40 tests de integración con la anon key):
precio manipulado → se guarda el precio real; `anon` no puede leer ni insertar
directamente en `orders`/`order_items`/`order_events`/`customers`.

**Riesgo residual aceptado:** al ser un endpoint público sin autenticación,
alguien puede crear pedidos basura que consuman stock. Es inherente a un
checkout sin login; la mitigación (rate limiting / bot protection) corresponde
a Fase 10.

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

Checklist anti-fuga (verificado en Fase 4.5, 2026-09-01):
- [x] Service role solo dentro de `lib/supabase/admin.ts` marcado `import 'server-only'` — el módulo **aún no existe**; ninguna ruta de código de aplicación lee la clave todavía.
- [x] Ningún `process.env.SUPABASE_SERVICE_ROLE_KEY` en `app/`, `components/`, `lib/`, `types/` ni `next.config.ts`. Las únicas env vars leídas por la app son las cuatro `NEXT_PUBLIC_*`.
- [x] Revisión del bundle: 246 archivos de `.next/` escaneados, **0 ocurrencias** de la service role key (0 también en `.next/static/`). La anon key aparece, como es esperado por diseño (pública, protegida por RLS).
- [x] Sin claves ni JWT hardcodeados en el repo; sin `project-ref` hardcodeado (el host de imágenes se deriva de `NEXT_PUBLIC_SUPABASE_URL`).
- [x] `.env.local` ignorado por git y nunca commiteado (comprobado en el historial completo); solo `.env.example` está versionado, sin valores.
- [x] Sin `any`, `as any`, `as unknown as`, `@ts-ignore` ni `@ts-expect-error` en `app/`, `components/`, `lib/` ni `types/`.

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