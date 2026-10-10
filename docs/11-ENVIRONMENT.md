# 11 — ENVIRONMENT: Entornos, variables y configuración

> Cómo configurar y ejecutar el proyecto en cada ambiente.

---

## 1. Variables de entorno

### Plantilla `.env.local`

**Implementado (Fase 1):** `.env.example` existe en la raíz del repo con esta plantilla (sin valores reales). Copiarlo a `.env.local` y rellenar. Las credenciales reales de Supabase aún no existen — proyecto se crea en Fase 3.

```bash
# ── Supabase ─────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# SOLO servidor. Jamás exponer al cliente (ver 08-SECURITY.md §7)
# SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# ── Mercado / sitio ──────────────────────────────────────
# Mercado activo del deploy: 'ES' | 'CO' (DEC-008/DEC-014 — ES es el inicial)
NEXT_PUBLIC_MARKET=ES
# URL pública canónica (metadataBase, sitemap, OG)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ── Asistente de catálogo (incremento 21) — OPCIONAL ─────
# Sin ella el panel funciona igual: «Analizar foto» sale desactivado y la
# ficha se rellena a mano. SOLO servidor, jamás NEXT_PUBLIC_.
# Y recuerda: además hay que encender el interruptor en /admin/ajustes.
# GEMINI_API_KEY=<api-key>
# GEMINI_PRODUCT_MODEL=gemini-3.5-flash
```

> **`GEMINI_API_KEY` es la única variable OPCIONAL del proyecto** (incremento 21, DEC-087). El proveedor es Gemini en su **tramo gratuito permanente** —sin tarjeta; se saca en <https://aistudio.google.com/apikey>—, y se habla con él por `fetch`: **cero dependencias**.
>
> ⚠️ **La clave NO basta.** El asistente exige además que el interruptor «Ayuda con IA» esté encendido en `/admin/ajustes` (`settings.ai_assist_enabled`, migración 0045), y **nace apagado**. Las dos condiciones las resuelve `resolveAssistantAvailability`, que distingue «apagada» de «sin proveedor» porque se arreglan en sitios distintos.
>
> Sin cualquiera de las dos, la pantalla de alta lo dice y no se simula ningún resultado (DEC-084, `docs/context/AI-DEVELOPMENT.md` §29).

> `SUPABASE_SERVICE_ROLE_KEY` solo la leen las suites de integración desde `.env.local`: **ningún código de la aplicación la usa** (`lib/supabase/admin.ts` no existe; el panel trabaja con la sesión del administrador y RLS). No se configura en Vercel. Tabla por entorno de Vercel en §5.2.

### Reglas

| Regla | Detalle |
|---|---|
| Prefijo `NEXT_PUBLIC_` | Solo lo seguro para cliente (URL/anon key/market/site-url) |
| Service role | Sin prefijo público; accesible solo en servidor |
| Nada comercial en env | WhatsApp, precios, textos → BD (`settings`), no variables |
| `.env*` en `.gitignore` | Ya cubierto por el .gitignore del scaffold (verificar en Fase 1) |
| Un `.env.local` por proyecto | Cada mercado/deploy tiene sus valores en Vercel |

---

## 2. Ambientes

| Ambiente | Supabase | Vercel | Datos |
|---|---|---|---|
| Local dev | Proyecto Supabase **dev** compartido o local | `npm run dev` | Seed de prueba |
| Preview (PR) | Proyecto de pruebas (hoy `store`, con seed) | Vercel preview automático | Pruebas |
| Producción CO | Proyecto Supabase CO | Vercel project "yi-co" | Real |
| Producción ES | Proyecto Supabase ES | Vercel project "yi-es" | Real |

Hoy solo existe el proyecto de pruebas; el de producción está **por crear** (§5.3). Dominio: pendiente de decisión de Juan.

---

## 3. Comandos locales

```bash
npm install          # instalar dependencias
npm run dev          # desarrollo (Turbopack, Next 16)
npm run build        # build producción (Turbopack)
npm run start        # servir build
npm run lint         # ESLint CLI (next lint NO existe en 16)
npx tsc --noEmit     # chequeo de tipos
```

Requisitos: Node.js 22.x (fijado en `engines`; Next 16 exige ≥ 20.9) · npm ≥ 10.

### Base de datos — proyecto Supabase REAL (flujo validado en Fase 4.5)

Este es el flujo que se usó realmente para aplicar el esquema, y el único validado end-to-end. **No requiere Docker.**

```bash
npx supabase login                                  # una vez por máquina (abre el navegador)
npx supabase link --project-ref <project-ref>       # enlaza el repo con el proyecto remoto
npm run db:push                                     # aplica supabase/migrations/ pendientes
npm run db:push:seed                                # aplica migraciones + supabase/seed/*.sql
npm run db:types                                    # genera types/database.types.ts desde el proyecto enlazado
```

Notas operativas comprobadas:

- `db:push` es incremental: registra lo aplicado en `supabase_migrations.schema_migrations` y no repite migraciones.
- `db:push:seed` **omite los archivos de seed ya aplicados** (los rastrea por hash). Para forzar la reejecución de un seed concreto: `npx supabase db query --linked -f supabase/seed/04_products_es.sql`. El seed es idempotente, así que reejecutarlo es seguro (regla 18 de `docs/rules/database.md`).
- `npx supabase db query --linked "<SQL>"` ejecuta SQL arbitrario contra el proyecto enlazado vía Management API — útil para inspeccionar el esquema real y las policies sin Docker ni contraseña de BD.
- **Antes de aplicar nada a un proyecto que no esté vacío**, inspecciona su contenido primero (regla de la Fase 4.5: no se destruyen datos reales sin verificar qué contienen).

### Base de datos local (Docker) — alternativa, SIN validar

```bash
npm run db:start       # levanta Postgres/Studio local vía Supabase CLI (requiere Docker Desktop o Podman)
npm run db:reset       # reaplica supabase/migrations/ + supabase/seed/*.sql desde cero
npm run db:lint        # valida el esquema local (tipos, advertencias)
npm run db:types:local # genera types/database.types.ts desde el esquema local
npm run db:stop        # detiene los contenedores locales
```

**Requiere Docker Desktop (o Podman) instalado y corriendo.** Este stack local **sigue sin probarse**: ningún entorno de desarrollo del proyecto ha tenido Docker hasta ahora. `supabase/config.toml` fija `major_version = 17` para reproducir la versión del proyecto real (PostgreSQL 17.6).

> Los tipos generados viven en `types/database.types.ts` (`02-ARCHITECTURE.md` §estructura y `docs/rules/architecture.md` #7). Hasta Fase 4.5 el script `db:types` apuntaba por error a `lib/supabase/database.types.ts`; corregido.

---

## 4. Checklist de setup desde cero (nueva máquina)

1. Clonar repo.
2. `npm install`.
3. Copiar `.env.example` → `.env.local` y rellenar con credenciales del proyecto Supabase dev.
4. Aplicar esquema + seed: `npx supabase login && npx supabase link --project-ref <ref> && npm run db:push:seed` (flujo remoto, sin Docker). Alternativa con Docker: `npm run db:start && npm run db:reset`.
5. `npm run db:types` → regenera `types/database.types.ts`.
6. `npm run dev` → http://localhost:3000.
7. Verificar lint+tsc+build: `npm run lint && npx tsc --noEmit && npm run build`.

## 4.1. GitHub Secrets requeridos por CI

`.github/workflows/ci.yml` necesita estos **repository secrets** (Settings → Secrets and variables → Actions). Sin ellos el workflow falla en el paso de preflight con un mensaje explícito (DEC-021):

| Secret | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase con `supabase/migrations/` aplicadas |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key de ese mismo proyecto |

`NEXT_PUBLIC_MARKET` y `NEXT_PUBLIC_SITE_URL` van en claro en el workflow (no son secretos). **Configuración externa pendiente:** estos dos secrets siguen sin crearse — es una acción manual en GitHub, fuera de este repo.

---

## 5. Despliegue en Vercel (fase final, DEC-089 y DEC-090)

> Estado a 2026-10-10: **el repositorio está listo para un Preview; no hay ningún proyecto de Vercel creado ni ningún despliegue hecho.** Nada de este apartado está verificado en Vercel todavía: lo verificado es el build, los tests y el E2E en local contra el build servido.

### 5.1. Proyecto

- **Framework:** Next.js (autodetectado). **Root directory:** la raíz del repositorio. **Install:** `npm ci` (por defecto, hay `package-lock.json`). **Build:** `npm run build` (por defecto). **Output:** por defecto. **No hace falta `vercel.json`.**
- **Node 22.x**, fijado en `engines` de `package.json`: es la versión con la que pasan local y CI. Vercel usaría otra por defecto.
- **Región de las Functions = la del proyecto de Supabase.** Vercel ejecuta por defecto en `iad1` (EE. UU.); el proyecto de Supabase actual está en `eu-central-1` (Fráncfort), así que cada consulta del render, de la regeneración ISR y de cada Server Action cruzaría el Atlántico. Se configura en *Project → Settings → Functions → Function Region* (`fra1` para Fráncfort). Si producción usa otro proyecto de Supabase en otra región, manda esa.
- **Vercel Toolbar en Preview:** carga un script de `vercel.live`, que la CSP bloquea (a propósito: DEC-086 no añade dominios de terceros). Verás errores de CSP en la consola **solo en Preview**. Se desactiva en *Project → Settings → General → Vercel Toolbar*; **no amplíes la CSP por esto**.
- **Deployment Protection:** los Preview quedan protegidos por defecto (hay que iniciar sesión en Vercel para verlos). Está bien así.
- **Límite de cuerpo: 4,5 MB por petición** (`413 FUNCTION_PAYLOAD_TOO_LARGE`). El panel reduce las fotos en el navegador para caber (DEC-089) y `next start` en local aplica el mismo tope.
- **Image Optimization:** `next/image` usa la de Vercel, que tiene cuota según el plan. No se ha medido el consumo.

### 5.2. Variables por entorno

Las `NEXT_PUBLIC_*` se escriben en el código **al construir**: cambiarlas exige volver a desplegar. Con `VERCEL=1`, el build **falla** si falta alguna de las cuatro primeras, y en cualquier entorno si un secreto lleva `NEXT_PUBLIC_` (`lib/security/deploy-env.ts`, DEC-090). El mensaje solo dice nombres, nunca valores.

| Variable | Uso | Development (local) | Preview | Production | Tipo |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase: datos, Auth, Storage, CSP. Build y ejecución | proyecto de pruebas | proyecto de **pruebas/staging** | proyecto de **producción** | pública · obligatoria |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key del MISMO proyecto | ídem | ídem | ídem | pública (la protege RLS) · obligatoria |
| `NEXT_PUBLIC_SITE_URL` | canonical, sitemap, robots, OG, enlace de recuperación, cookie `Secure`, HSTS | `http://localhost:3000` | https: la `.vercel.app` del proyecto | https: **el dominio definitivo** | pública · obligatoria en Vercel |
| `NEXT_PUBLIC_MARKET` | mercado del despliegue | `ES` | `ES` | `ES` (o `CO` en el proyecto de Colombia) | pública · obligatoria en Vercel |
| `GEMINI_API_KEY` | asistente de alta de producto (DEC-087) | opcional | opcional | opcional | **secreta** · solo servidor |
| `GEMINI_PRODUCT_MODEL` | modelo de Gemini | opcional | opcional | opcional | no secreta · solo servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo** tests de integración | `.env.local` | **NO** | **NO** | **secreta** · no la lee la app |

- **No hay ninguna clave de Anthropic**: el asistente usa Gemini desde el incremento 21.
- **Comprobar sin revelar valores:** en *Settings → Environment Variables* se ven los nombres y los entornos sin mostrar el valor; con la CLI, `vercel env ls` lista nombres y entornos. En el sitio desplegado: `view-source` → `<link rel="canonical">` y `/robots.txt` deben llevar el dominio, y `/admin/ajustes` dice si el asistente tiene proveedor.
- **Preview y Production no comparten proyecto de Supabase.** El Preview puede tocar datos; producción no se usa para probar.

### 5.3. Supabase de producción

Hoy existe **un solo** proyecto (`store`, `eu-central-1`), con las 47 migraciones aplicadas **y el seed de desarrollo** (productos, precios y textos de prueba). Sirve para Preview; **no es producción**.

1. Crear un proyecto nuevo en Supabase (región próxima a los clientes; luego la misma en Vercel, §5.1).
2. `npx supabase link --project-ref <ref-de-producción>` y `npm run db:push` — **sin `--include-seed`**: el seed tiene datos inventados (DEC-014). Vuelve a enlazar después el proyecto de pruebas para no aplicar cambios de desarrollo a producción por error.
3. Datos mínimos sin los que la tienda no arranca (por el SQL Editor):
   - `supabase/seed/01_markets.sql` tal cual (países y monedas, no hay datos comerciales). Sin la fila del mercado, el build falla.
   - La fila de `settings` del mercado — el panel la edita pero no la crea:
     ```sql
     insert into public.settings (market_id, store_name, whatsapp_number, policies)
     values ('ES', '<nombre real de la tienda>', '34600000000', '{}'::jsonb);
     ```
     El número es el del seed **a propósito**: con él la tienda no vende (DEC-065) hasta que se ponga el real en `/admin/ajustes`.
   - Categorías, colores, tallas, métodos de entrega y productos se crean desde el panel. **No ejecutes `03`–`06`.**
4. Administrador: crear el usuario en *Authentication → Users* e insertar su fila en `public.profiles` (`role = 'admin'`).
5. *Authentication → URL Configuration*: **Site URL** = `NEXT_PUBLIC_SITE_URL`; **Redirect URLs**: `<sitio>/admin/reset-password` y `<sitio>/admin/auth/confirm`. Plantilla del email de recuperación con `{{ .TokenHash }}` y **SMTP propio** (`docs/05-ADMIN.md` §2.1): sin SMTP el correo no llega.
6. Nunca ejecutar `npm test` contra producción: las suites de integración crean y borran datos con la service role.

### 5.4. Orden de despliegue

1. Configurar las variables de **Preview** (§5.2) y la región (§5.1).
2. Desplegar Preview (push a una rama o *Deploy* desde el dashboard).
3. Smoke tests en el Preview (§5.5).
4. Logs (*Deployments → Logs*), cabeceras (`curl -I <preview>`: CSP, HSTS, `X-Frame-Options`) y consola sin errores de CSP (con la Toolbar desactivada).
5. Confirmar que apunta al Supabase correcto: la CSP de la respuesta lleva el host de Supabase, y debe ser el de pruebas.
6. Comprobar que no se ha tocado nada real.
7. **Solo después**, Production: proyecto de Supabase de producción (§5.3), variables de Production, dominio y `NEXT_PUBLIC_SITE_URL` definitiva, desplegar y repetir el smoke **sin crear pedidos reales**.

**No conectar un dominio, cambiar DNS ni promover a producción sin autorización explícita de Juan.** HSTS se emite en cuanto `NEXT_PUBLIC_SITE_URL` es https, sin `preload` (DEC-086).

### 5.5. Smoke test

- **Tienda:** `/` (200, `cache-control: s-maxage=300`), una ficha, imágenes de Storage, `/carrito`, `/checkout` (`no-store`), `/robots.txt` y `/sitemap.xml` con el dominio, `/opengraph-image` (200), una URL inexistente (404).
- **Checkout:** con el número del seed, `/checkout` dice que la tienda no vende — esperado. Para probar una compra en Preview, número de prueba temporal y restaurarlo después; nunca en producción.
- **Panel:** `/admin` sin sesión → 307 a `/admin/login`; login; subir **una foto de móvil real de más de 4,5 MB** y un lote de 3 (DEC-089); alta con foto; logo; inventario; pedidos; ajustes. Sin scroll horizontal a 390 px.
- **Recuperación de contraseña:** enviar el email y seguir el enlace (exige SMTP y las Redirect URLs de §5.3).

---

## 6. Mantenimiento de este documento

Cualquier variable nueva o cambio de entorno se documenta aquí en la misma tarea que la introduce (regla de sincronización de `DEVELOPMENT-WORKFLOW.md`).