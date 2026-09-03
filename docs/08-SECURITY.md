# 08 — SECURITY: Autenticación, autorización y protección de datos

> Modelo de seguridad completo. Principio rector (DEC-009): **la seguridad vive en la base de datos (RLS), no en ocultar rutas**.
>
> **Estado real (Fase 7, 2026-09-02): §2, §3, §4, §5 y §7 están IMPLEMENTADOS y VALIDADOS CONTRA EL PROYECTO SUPABASE REAL.** §6 (Storage) sigue validado desde Fase 4.5 pero **sin uso**: el panel no sube imágenes todavía, y los buckets siguen sin `file_size_limit`/`allowed_mime_types`.
>
> **Validación de Fase 7** (sobre el build de producción servido con `next start`, contra la instancia real, con un admin, un autenticado sin rol y anónimo — todos los usuarios de prueba creados y eliminados):
> - **39 comprobaciones de RLS** con controles positivos de admin: anon y authenticated-sin-rol no leen ni una fila de `orders`/`order_items`/`order_events`/`customers`/`order_counters`, no mutan pedidos, no tocan catálogo ni stock, no pueden autoelevarse a admin y no leen perfiles ajenos. El admin sí puede todo lo necesario. `order_events` sigue siendo append-only **incluso para el admin** (UPDATE y DELETE rechazados).
> - **38 comprobaciones de sesión**, incluido el caso que motivó DEC-031: token marcado como caducado → la respuesta trae `Set-Cookie` con un `access_token` distinto y la siguiente request mantiene la sesión.
> - **78 comprobaciones end-to-end del panel**, incluidas invocaciones **directas a una Server Action sin pasar por la UI y sin JavaScript** (reproduciendo el `$ACTION_REF`/`$ACTION_n:0` de progressive enhancement): con **control positivo** —el admin sí muta por ese camino— y comprobando que un autenticado sin rol y un anónimo no mutan nada.
> - **28 tests de integración** de la máquina de estados y la devolución de stock.
> - **0 ocurrencias** de la service role key (ni de su nombre de variable) en los 466 archivos del build; 0 en `.next/static/`. `lib/supabase/admin.ts` sigue sin existir.
> - Dos debilidades reales corregidas: la cookie de sesión **no era `httpOnly`** (default de `@supabase/ssr`) y el guard del layout **no impedía que la página hermana se renderizase** en RSC. Ninguna policy se debilitó.
>
> **Validación previa de Fase 4.5** (sigue vigente):
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
| Admin manipulando el estado de un pedido | El cliente solo propone `order_id`, estado y nota. `admin_update_order_status` (0019) valida la transición con la fila bloqueada; `paid` exige `p_payment_confirmed`; `delivered`/`cancelled` son terminales (DEC-032) |
| Devolución doble de stock al cancelar | La cancelación solo procede desde un estado no cancelado y con `select … for update`; verificado con 10 cancelaciones simultáneas (DEC-033) |
| Robo de la sesión del admin por XSS | Cookie de sesión forzada a `httpOnly` en `lib/supabase/cookies.ts` (la librería trae `httpOnly: false`) — DEC-031 |
| Open redirect desde `/admin/login?next=` | `safeAdminRedirect()`: solo rutas internas de `/admin` |
| Un admin escribiendo en un mercado no lanzado | Las policies de admin de catálogo y contenido exigen `is_active_market(market_id)` en USING y WITH CHECK (DEC-035). Verificado: crear en CO y mover un producto de ES a CO son rechazados por PostgreSQL |
| Subida de un archivo malicioso disfrazado de imagen | Validación por **magic bytes**, no por `File.type` ni por `allowed_mime_types` (ambos confían en lo que declara el cliente); `sharp` re-codifica, así que el objeto del bucket lo genera el servidor (DEC-036). SVG excluido a propósito |
| Escritura en la carpeta de otro producto | La ruta la compone el servidor con el slug leído de la BD, y el borrado comprueba pertenencia antes de tocar Storage |
| Manipulación del carrito en localStorage | El checkout ignora precio y stock del cliente: `create_order` los resuelve en PostgreSQL (DEC-026) |
| Pedidos duplicados por doble clic/recarga | Idempotencia garantizada por un índice UNIQUE en BD, no por el estado del botón (DEC-028) |

---

## 2. Autenticación

- Proveedor: **Supabase Auth** (email + contraseña). Implementado en Fase 7: `/admin/login`.
- Sesión: JWT en cookie gestionada por `@supabase/ssr` (cookies async en Next 16).
- **`httpOnly` es nuestro, no de la librería.** `@supabase/ssr` trae `httpOnly: false` en sus `DEFAULT_COOKIE_OPTIONS` (su cliente de navegador necesita leer la cookie) y **no** marca `Secure` en absoluto. Se comprobó sirviendo el build: la cabecera llegaba sin `HttpOnly`. `lib/supabase/cookies.ts` fuerza `httpOnly: true` y deriva `Secure` del protocolo de `NEXT_PUBLIC_SITE_URL`; lo aplican `server.ts` y `proxy.ts`. Es posible porque el panel es 100% server-side. Ver DEC-031.
- Clientes:
  - `lib/supabase/server.ts` → componentes/actions (lee cookies del request, anon key + sesión).
  - `lib/supabase/proxy.ts` → renovación de sesión dentro de `proxy.ts` (anon key).
  - `lib/supabase/static.ts` → lecturas públicas sin cookies (catálogo, checkout).
  - `lib/supabase/browser.ts` → interacciones client-side. **Sin consumidor real**; el panel no lo usa.
  - `lib/supabase/admin.ts` → service role. **NO EXISTE**: ninguna ruta de la aplicación la necesita (DEC-026, DEC-034). Si algún día se creara, debe llevar `import 'server-only'`.
- Alta de admins: manual (SQL o dashboard Supabase). No hay self-signup hacia roles ni UI de registro (DEC-020).
- Logout: `logoutAction` revoca la sesión en Supabase y limpia cookies (solo posible desde una Server Action).
- Autenticarse **no** es autorizarse: tras un login correcto se comprueba `is_admin()` y, si la cuenta no lo es, se cierra la sesión inmediatamente. Los mensajes de error del login son genéricos a propósito (no permiten enumerar cuentas).

---

## 3. Autorización

### Roles
v1: un único rol `admin` en `profiles.role`. El esquema admite añadir `editor`/`viewer` después sin migración destructiva.

### Verificación en capas

```
1. proxy.ts                    → MANTIENE LA SESIÓN VIVA (refresh + cookies) y,
                                 si no hay sesión, redirige al login        (UX)
2. app/admin/(panel)/layout    → getUser() + is_admin(): QUIÉN eres          (real, obligatoria)
3. Server Actions              → re-verifican en CADA mutación: QUÉ puedes   (real, obligatoria)
4. RLS PostgreSQL              → lo impide aunque todo lo anterior falle     (real, definitiva)
```

Regla: las capas 1–2 son UX/rendimiento; la autoridad es 3–4. Ninguna acción confía solo en el frontend.

**La capa 1 no comprueba el rol y no debe hacerlo** (DEC-031). `proxy.ts` existe porque un Server Component no puede escribir cookies y alguien tiene que persistir el token renovado; que además redirija es cortesía. Borrar `proxy.ts` entero **no da acceso a ningún dato administrativo** — verificado empíricamente, no deducido (ver DEC-031 §Consequences).

Corolario que los propios docs de Next 16 subrayan: una Server Function es un POST a la ruta donde se usa, así que **un cambio de `matcher` o mover una action de archivo puede sacarla de la cobertura del proxy sin que nada falle a la vista**. Por eso la capa 3 (`requireAdmin()` en `lib/admin/auth.ts`) es obligatoria en toda mutación, sin excepción.

**El layout NO frena a la página** (hallazgo real de Fase 7): en RSC layout y página se renderizan **en paralelo**. Que el layout devuelva "Acceso denegado" sin pintar sus `children` no impide que la página hermana se haya renderizado, y su payload viaja en el HTML. Se comprobó sirviendo el build. No filtraba ningún dato —RLS devolvía 0 filas— pero por eso **cada función de `lib/data/admin/` lleva su propio `requireAdmin()`** y devuelve vacío si falla (DEC-034). Una pantalla de admin nueva debe llevar ese guard en su función de datos; no basta con estar bajo el layout.

`getAdminAccess()` (`lib/admin/auth.ts`) es la única puerta a la identidad: `getUser()` + la función SQL `public.is_admin()`, envuelto en `cache()` para no repetir red dentro de la misma request. **El criterio de rol no se reimplementa en TypeScript**; si `is_admin()` cambia, el código lo hereda. Ante un error de esa comprobación se deniega, nunca se degrada a permitir.

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
| `/admin/**` | proxy.ts (refresh de sesión + redirect si no hay sesión) + `(panel)/layout.tsx` (getUser + `is_admin()`) |
| `/admin/login` | Fuera del route group protegido (`(auth)`), nunca redirigido por el proxy. Si hay sesión **de admin** → redirect a `/admin`; si hay sesión sin rol, se muestra el motivo en vez de redirigir (evita el bucle login → /admin → login) |
| Sesión válida sin rol admin | El layout renderiza "Acceso denegado" + logout. **No** se redirige |
| `?next=` del login | `safeAdminRedirect()`: solo rutas internas de `/admin`. Rechaza absolutas, `//host` y backslashes (open redirect) |
| API pública futura (webhooks pago) | Validación de firma del proveedor; nunca trust del body |
| Server Actions | `requireAdmin()` propio en cada una (no dependen del layout ni del proxy) |

Estructura de rutas (los route groups no cambian ninguna URL):

```
app/admin/(auth)/login/page.tsx     → /admin/login   PÚBLICA (sin guard)
app/admin/(panel)/layout.tsx        → guard real: getUser() + is_admin()
app/admin/(panel)/page.tsx          → /admin         PROTEGIDA
```

`05-ADMIN.md` §2 situaba el guard en `app/admin/layout.tsx`; ahí envolvería también al login y se redirigiría a sí mismo en bucle. Los route groups resuelven eso sin cambiar URLs (DEC-031).

`proxy.ts` real (Fase 7) — lo esencial:

```ts
// proxy.ts — Next.js 16 (reemplaza middleware; runtime Node.js por defecto)
export async function proxy(request: NextRequest) {
  const { user, response } = await refreshSession(request); // getUser() + cookies renovadas
  if (user || request.nextUrl.pathname === "/admin/login") return response;
  return withSessionCookies(response, NextResponse.redirect(loginUrl)); // no perder el refresh
}
export const config = { matcher: "/admin/:path*" };
```

Detalles que no son opcionales:
- `refreshSession` usa `getUser()`, **nunca `getSession()`**: el segundo solo decodifica la cookie.
- Las cookies renovadas deben copiarse también al redirect, o se pierde el refresh justo cuando más falta hace.
- El proxy **no** llama a `is_admin()`.
- El `matcher` deja fuera toda la tienda pública (verificado: ni una `Set-Cookie` en `/`, `/carrito`, `/checkout`, `/producto/*`, `/pedido/*`).

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
- Security Misconfiguration → **HECHO en Fase 9** (DEC-042): `next.config.ts` sirve `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` mínima en todas las rutas (verificado por HTTP en home, ficha y login). ⬜ `Content-Security-Policy` y `Strict-Transport-Security` quedan para el **deploy (Fase 11)**: la CSP exige calibrarse en un navegador real —Next inyecta scripts inline y Tailwind estilos inline— y HSTS necesita el dominio HTTPS definitivo
- `robots.txt` (Fase 9) deniega `/admin`, `/api`, `/carrito`, `/checkout` y `/pedido`. **No es un control de acceso**: es una petición a los crawlers que se portan bien. Lo que impide entrar al panel sigue siendo `proxy.ts` → layout con `is_admin()` → `requireAdmin()` → RLS. Verificado en la misma ejecución: con `robots.txt` publicado, un anónimo sigue recibiendo un redirect al login en `/admin` y `/admin/pedidos`
- El `sitemap.xml` solo lista contenido público (home y fichas publicadas). Un borrador o un producto eliminado no puede aparecer: se filtra en la query Y lo tapa RLS (comprobado con la clave anónima)
- Identification/Auth failures → rate limiting de login (Supabase lo incluye; revisar umbrales)