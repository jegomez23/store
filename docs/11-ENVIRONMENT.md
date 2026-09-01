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
```

> Nota (Fase 4.5): las cuatro variables `NEXT_PUBLIC_*` son consumidas realmente por la aplicación y están verificadas contra un proyecto Supabase real. `SUPABASE_SERVICE_ROLE_KEY` puede estar presente en `.env.local`, pero **ningún código de aplicación la lee todavía** (`lib/supabase/admin.ts` no existe; se creará en Fase 7).

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
| Preview (PR) | Dev | Vercel preview automático | Dev |
| Producción CO | Proyecto Supabase CO | Vercel project "yi-co" | Real |
| Producción ES | Proyecto Supabase ES | Vercel project "yi-es" | Real |

Creación de proyectos Supabase: Fase 3. Dominios: pendiente decisión humana.

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

Requisitos: Node.js ≥ 20.9 · npm ≥ 10.

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

## 5. Despliegue (resumen; detalle operativo en Fase 10)

1. Conectar repo a Vercel (un project por mercado).
2. Configurar envs del §1 por ambiente (con `NEXT_PUBLIC_MARKET` distinto).
3. Aplicar migraciones al Supabase correspondiente.
4. Configurar dominio + `NEXT_PUBLIC_SITE_URL` definitivo.
5. Smoke test: home, producto, compra WhatsApp, admin login.

---

## 6. Mantenimiento de este documento

Cualquier variable nueva o cambio de entorno se documenta aquí en la misma tarea que la introduce (regla de sincronización de `DEVELOPMENT-WORKFLOW.md`).