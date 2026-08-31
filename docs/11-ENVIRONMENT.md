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

> Nota (Fase 3): `NEXT_PUBLIC_MARKET` sigue sin ser leído por ningún código de aplicación (`lib/markets.ts` no existe todavía) — la variable está documentada/preparada, no consumida.

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

### Base de datos local (Fase 3)

```bash
npm run db:start   # levanta Postgres/Studio local vía Supabase CLI (requiere Docker Desktop o Podman)
npm run db:reset   # reaplica supabase/migrations/ + supabase/seed/*.sql desde cero
npm run db:lint    # valida el esquema local (tipos, advertencias)
npm run db:types   # genera lib/supabase/database.types.ts desde el esquema local
npm run db:stop    # detiene los contenedores locales
```

**Requiere Docker Desktop (o Podman) instalado y corriendo.** El CLI (`supabase`, devDependency) está instalado, pero estos comandos **no se pudieron ejecutar/validar en el entorno donde se escribieron las migraciones de Fase 3** (sin Docker/Podman disponible ahí) — las migraciones se revisaron manualmente pero no se aplicaron contra un Postgres real. Ejecuta `npm run db:reset` en tu máquina antes de confiar en ellas en producción.

---

## 4. Checklist de setup desde cero (nueva máquina)

1. Clonar repo.
2. `npm install`.
3. Copiar `.env.example` → `.env.local` y rellenar con credenciales del proyecto Supabase dev (o de tu stack local, paso 4).
4. (Opcional, recomendado) `npm run db:start && npm run db:reset` — requiere Docker. Aplica `supabase/migrations/` + seed ES.
5. `npm run dev` → http://localhost:3000.
6. Verificar lint+tsc: `npm run lint && npx tsc --noEmit`.

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