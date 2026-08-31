# CURRENT-STATE — Estado real del proyecto

> ⚠️ **Este archivo debe actualizarse al final de CADA fase.** Es la primera consulta para saber dónde estamos. Describe el estado REAL del repositorio, no el deseado.

---

## STATUS

**FASE 4 — Data Layer + Catálogo Real (COMPLETADA COMO CÓDIGO, SIN VALIDACIÓN EN VIVO — ver abajo)**

Última actualización: 2026-08-31

---

## ⚠️ Limitación conocida — MÁS IMPORTANTE que en Fase 3

Este entorno sigue sin Docker/Podman y sin proyecto Supabase real (mismo diagnóstico que Fase 3). La diferencia crítica: **desde esta fase, la aplicación necesita Supabase para hacer `npm run build`, no solo para "funcionar bien".** Home y `/producto/[slug]` usan `generateStaticParams` + fetch en build-time (docs/02-ARCHITECTURE.md §3, DEC-021 — se mantuvo esa estrategia a propósito, ver `DECISIONS.md`).

**Verificado en este entorno:**
- `npm run lint` ✅ y `npx tsc --noEmit` ✅ pasan sin datos reales.
- `npm run build` **falla** con `Error [MarketResolutionError]: ... TypeError: fetch failed` (probado también con credenciales con formato válido pero sin backend real detrás — incluso así falla, porque no hay red hacia ningún Supabase real). Con las variables de entorno completamente ausentes (estado real de este repo, sin `.env.local`) falla antes, en la construcción del cliente (`supabaseUrl is required`).
- Este fallo confirma que el código llega hasta el intento de red real — no es un error de sintaxis ni de tipos, es exclusivamente la ausencia de un Supabase alcanzable.
- **Bug real que SÍ se encontró y corrigió** (no relacionado con Docker): `lib/supabase/server.ts` usa `cookies()`, que no está disponible dentro de `generateStaticParams` (corre en build-time sin request). Se creó `lib/supabase/static.ts` (cliente sin cookies, `@supabase/supabase-js` plano) para todas las lecturas públicas de catálogo — ver DEC en `docs/02-ARCHITECTURE.md` §5.

**Antes de dar esta fase por funcional de verdad:**
1. Crear `.env.local` con credenciales de un proyecto Supabase real (o local vía Docker).
2. `npm run db:start && npm run db:reset` (si hay Docker) o `supabase db push` contra el proyecto real, para aplicar las migraciones/seed de Fase 3 — **tampoco se han validado en vivo todavía**.
3. `npm run dev` y recorrer manualmente: `/`, `/producto/[slug]` real, un slug inexistente (→ 404), verificar imágenes (probablemente rotas: el seed usa rutas de Storage sin archivos subidos — ver más abajo).
4. Añadir `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` como GitHub Secrets para que `.github/workflows/ci.yml` deje de fallar en el paso de build.

---

## Resumen ejecutable

El código para servir el catálogo real desde Supabase está **completo y revisado** (data layer, Home, ficha de producto, imágenes, SEO básico, error handling) pero **no se ha ejecutado ni una sola vez contra datos reales** en este entorno. `lib/mock/products.ts` fue eliminado (cero consumidores tras el rewire) — actualmente NO hay ningún fallback funcional si Supabase no está disponible: la tienda completa depende de un Supabase real desde esta fase.

> Leyenda de estado usada en este documento: **IMPLEMENTADO** (existe y compila/funciona) · **PREPARADO** (código listo pero sin datos/uso real aún) · **PENDIENTE** (documentado, no iniciado) · **NO IMPLEMENTADO** (explícitamente fuera de alcance por ahora).

---

## Stack real detectado

| Tecnología | Versión | Notas |
|---|---|---|
| Next.js | **16.3.3** | App Router, Turbopack por defecto |
| React / React DOM | **19.2.8** | |
| TypeScript | ^5 (strict) | Alias `@/*` → raíz del proyecto |
| Tailwind CSS | **^4** | Sintaxis `@theme inline`, plugin `@tailwindcss/postcss` |
| ESLint | ^9 flat config | `eslint-config-next` core-web-vitals + typescript |
| Node.js | ≥ 20.9 requerido por Next 16 | |

### Cambios críticos de Next.js 16 que afectan todo el código futuro

- `middleware.ts` está deprecado → usar **`proxy.ts`** (runtime Node.js).
- APIs de request **siempre asíncronas**: `await params`, `await searchParams`, `await cookies()`, `await headers()`.
- Type helpers globales: `PageProps<'/ruta'>`, `LayoutProps<"/">`, `RouteContext`.
- `next/image`: `images.remotePatterns` obligatorio para dominios externos (Supabase Storage); `qualities` por defecto `[75]`.
- `revalidateTag(tag, cacheLifeProfile)` requiere segundo argumento; existen `updateTag()` y `refresh()`.
- Cache Components (`use cache`) existe pero está **desactivado** en este proyecto (ver DEC-004).

---

## Estructura actual del repositorio

```
store_ropa/
├── .github/workflows/ci.yml   # IMPLEMENTADO — lint + tsc + build; build necesita secrets Supabase (Fase 4)
├── app/
│   ├── globals.css            # IMPLEMENTADO — tokens YI vía @theme (04-UX-UI.md §2)
│   ├── layout.tsx             # IMPLEMENTADO — root layout: fuentes, metadataBase, lang="es"
│   ├── not-found.tsx          # IMPLEMENTADO (Fase 2) — 404 con identidad YI
│   └── (store)/                # IMPLEMENTADO — route group público
│       ├── layout.tsx          # Header+categorías reales + BottomNav + Footer (Fase 4)
│       ├── error.tsx           # IMPLEMENTADO (Fase 4) — error boundary del segmento
│       ├── page.tsx            # Home REAL (Supabase): hero, categorías, destacados, conceptual, CTA
│       └── producto/[slug]/page.tsx   # Ficha REAL: generateStaticParams+generateMetadata+notFound
├── components/
│   ├── ui/                     # Button, Container, Badge, Divider, SectionHeading, icons.tsx,
│   │                            # MockImage (fallback visual), RemoteImage (Fase 4, next/image
│   │                            # con fallback a MockImage si falla la carga)
│   └── store/                  # Header (recibe categorías por props, Fase 4), BottomNav, Footer,
│                                # ProductCard (datos reales), VariantPicker (variantes reales)
├── lib/
│   ├── supabase/
│   │   ├── browser.ts          # IMPLEMENTADO — cliente anon para Client Components (sin uso aún)
│   │   ├── server.ts           # IMPLEMENTADO — cliente con cookies/sesión (SIN USO — Fase 6-7)
│   │   └── static.ts           # IMPLEMENTADO (Fase 4) — cliente sin cookies, lecturas públicas.
│   │                            # admin.ts (service role) NO EXISTE aún
│   ├── markets.ts               # IMPLEMENTADO (Fase 4) — getActiveMarket(), valida contra BD
│   ├── data/                    # IMPLEMENTADO (Fase 4) — categories.ts, home.ts, products.ts
│   │                             # (getFeaturedProducts, getProductBySlug, getAllProductSlugs)
│   └── money/format.ts          # default ES/EUR (antes CO/COP temporal de Fase 2)
├── docs/                       # ← CREADO EN FASE 0, actualizado en Fases 1-4
│   ├── 01-PRODUCT.md … 11-ENVIRONMENT.md
│   ├── rules/                  # Reglas por área (7 archivos)
│   └── context/                # Sistema de contexto para agentes (8 archivos)
├── supabase/
│   ├── config.toml              # IMPLEMENTADO (Fase 3) — sin validar (sin CLI/Docker probado end-to-end)
│   ├── migrations/              # IMPLEMENTADO (Fase 3) — 15 migraciones, SIN EJECUTAR contra Postgres real
│   └── seed/                    # IMPLEMENTADO (Fase 3) — seed dev ES, SIN EJECUTAR
├── public/                     # Solo favicon
├── .env.example                # NEXT_PUBLIC_MARKET=ES (docs/11-ENVIRONMENT.md)
├── AGENTS.md                   # Bloque gestionado por next dev (NO editar entre marcadores)
├── CLAUDE.md                   # Índice + contrato de trabajo
├── README.md                   # Índice humano
├── eslint.config.mjs
├── next.config.ts              # IMPLEMENTADO (Fase 4) — images.remotePatterns derivado de
│                                # NEXT_PUBLIC_SUPABASE_URL (vacío si no está configurada)
├── postcss.config.mjs
└── tsconfig.json
```

Carpetas **deliberadamente no creadas** todavía: `lib/cart/`, `lib/checkout/`, `lib/i18n/`, `components/admin/`, `types/` (incluyendo `database.types.ts` generado — pendiente de instancia real), `proxy.ts`, `lib/supabase/admin.ts`. `lib/mock/` **fue eliminado** en esta fase (cero consumidores tras conectar Home/ficha a Supabase).

---

## Funcionalidades

| Funcionalidad | Estado |
|---|---|
| Análisis y documentación de arquitectura | ✅ Completada (Fase 0) |
| Sistema de contexto para agentes | ✅ Completada (Fase 0) |
| Design Tokens (`@theme` en globals.css) | ✅ Implementado (Fase 1) |
| Primitivos UI (Button, Container, Badge, Divider, SectionHeading, MockImage, icons) | ✅ Implementado (Fases 1-2) — sin componentes de negocio en `ui/` |
| Clientes Supabase (browser/server, anon key) | ✅ Implementado (Fase 1) — sin proyecto Supabase real conectado, sin admin.ts |
| CI (lint + typecheck + build) | ✅ Implementado (Fase 1) — `.github/workflows/ci.yml` |
| Store shell (Header, nav móvil/desktop, drawer, BottomNav, Footer) | ✅ Implementado (Fase 2) — responsive, accesible (aria-pressed, Escape, focus visible) |
| Home (con datos MOCK) | ✅ Implementado (Fase 2) — hero, categorías, destacados, sección conceptual, CTA |
| Esquema de base de datos (15 tablas, RLS, Storage) | ✅ Implementado como código (Fase 3) — **sin ejecutar contra Postgres real**, ver limitación arriba |
| Seed de desarrollo (ES operativo, CO solo `markets`) | ✅ Implementado como código (Fase 3) — mismo aviso de validación |
| `profiles` + `is_admin()` (base para auth futura) | ✅ Implementado como código (Fase 3) — sin UI de auth, sin `proxy.ts`, alta manual (DEC-020) |
| Data layer (`lib/data/`, `lib/markets.ts`) | ✅ Implementado como código (Fase 4) — **sin ejecutar contra datos reales**, ver limitación arriba |
| Home conectada a Supabase (hero/categorías/destacados reales) | ✅ Implementado como código (Fase 4) — mismo aviso; `lib/mock/` eliminado |
| Ficha de producto conectada a Supabase (variantes/imágenes/SEO real) | ✅ Implementado como código (Fase 4) — mismo aviso |
| `next/image` + Supabase Storage (`RemoteImage` con fallback) | ✅ Implementado como código (Fase 4) — imágenes del seed son rutas sin archivo real subido, se verán rotas/con fallback hasta que se suban fotos reales |
| Carrito | ❌ No iniciada — decidido localStorage (DEC-005), CTA "Añadir al carrito" visualmente deshabilitado |
| Checkout por WhatsApp | ❌ No iniciada — especificado en `06-WHATSAPP.md`, CTA "Comprar por WhatsApp" visualmente deshabilitado |
| Administrador (UI) | ❌ No iniciada — especificado en `05-ADMIN.md`, Fase 7 |
| Autenticación (UI, `proxy.ts`, sesión) | ❌ No iniciada — Fase 7. Solo la base de datos (`profiles`/`is_admin()`) existe |
| SEO técnico (metadata título/descripción/OG de producto) | ✅ Implementado (Fase 4, básico) — sitemap/robots/JSON-LD siguen pendientes (Fase 8) |
| Pagos online | 🔮 Futuro — abstracción prevista (`CheckoutChannel`, DEC-007); nada en Fase 4 la bloquea |

> Regla: "documentado" ≠ "implementado". Solo se marca ✅ lo que existe en código.

---

## Dependencias

### Instaladas

`next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8`, `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `typescript@^5`, `eslint@^9`, `eslint-config-next@16.3.3`, `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, `supabase@2.116.0` (CLI, devDependency, Fase 3 — necesaria para `db:*` scripts), tipos de React/Node.

Fase 4 no añadió dependencias nuevas (usa `@supabase/supabase-js` ya instalado desde Fase 1).

### Pendientes (instalar SOLO cuando su fase lo requiera)

Ninguna prevista para Fase 5 salvo que surja una necesidad concreta y justificada. Explícitamente **no instaladas** por decisión del usuario (filosofía minimum viable architecture): Zustand, Framer Motion, shadcn/ui, React Hook Form, Zod. Ver regla de dependencias en `/docs/rules/frontend.md`.

---

## Configuración pendiente conocida

- [ ] **Validar TODO en vivo (Fase 3 + Fase 4 juntas)** — `npm run db:reset` con Docker (o proyecto Supabase real + `supabase db push`), luego `npm run dev` y recorrer `/`, `/producto/[slug]`, slug inexistente, imágenes. Nada de esto se ha ejecutado ni una vez.
- [ ] Proyecto Supabase real (creación en supabase.com, credenciales) — sigue sin existir; acción humana fuera de este repo.
- [ ] GitHub Secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — sin ellos, `.github/workflows/ci.yml` falla en el paso `npm run build` (DEC-021).
- [ ] Subir imágenes reales a los buckets `products`/`content` — el seed de Fase 3 solo referencia rutas, sin archivos; `RemoteImage` cae a `MockImage` mientras tanto.
- [ ] `lib/supabase/admin.ts` (service role) — se crea cuando exista la primera necesidad real server-only (Fase 7).
- [ ] `types/database.types.ts` generado con `npm run db:types` — pendiente de instancia real.
- [ ] `proxy.ts` — Fase 7, admin.
- [ ] Suite de tests formal (runner) — Fase 9. `lib/money/format.ts`, `lib/data/*` siguen sin cobertura (sin runner disponible).
- [ ] Assets de marca reales (logo, fotografías) — pendiente de Juan.
- [ ] Copy final aprobado — pendiente de Juan.
- [ ] Idioma único con textos centralizados — DEC-013 resuelta (español único), pero `lib/i18n/` sigue sin crearse; strings visibles marcados `TODO(i18n)`.
- [ ] `/categoria/[slug]` (listado real) — sigue sin existir; Home enlaza a un ancla, no a una página de categoría (Fase 4 solo pidió Home + ficha).

---

## Próximos pasos (según ROADMAP)

→ **FASE 5 — Carrito**: `lib/cart/` (contexto+reducer+localStorage, DEC-005), drawer/página `/carrito`, activar el CTA "Añadir al carrito" (hoy deshabilitado). Requiere primero validar en vivo Fases 3-4 (ver arriba) para no construir sobre datos nunca probados. Detalle: `10-ROADMAP.md`.

---

## Historial de estados

| Fecha | Fase | Nota |
|---|---|---|
| 2026-08-26 | Fase 0 | Documentación y sistema de contexto completados |
| 2026-08-31 | Fase 1 | Cimientos técnicos: clientes Supabase (anon, sin admin), tokens YI, primitivos UI base, `.env.example`, CI mínimo (GitHub Actions). Cero funcionalidad de negocio. DEC-013/DEC-014 siguen abiertas sin bloquear. |
| 2026-08-31 | Fase 2 | Store shell + Home + ficha de producto navegables con datos mock. `components/store/` creado. `lib/mock/products.ts` (no es `lib/data/`). `lib/money/format.ts` adelantado (mínimo, justificado por regla de arquitectura). CTAs de compra deshabilitados a propósito. DEC-016 (mantener Geist). Cero Supabase/carrito/checkout/admin real. |
| 2026-08-31 | Fase 3 | DEC-013 (español único) y DEC-014 (ES mercado inicial) resueltas por Juan. Esquema completo (15 migraciones) + RLS + Storage buckets. Seed dev solo ES operativo (CO solo fila de `markets`, inactiva). DEC-019/DEC-020 resueltas. CLI `supabase` instalado + scripts `db:*`. **Sin Docker: migraciones/seed nunca ejecutados contra Postgres real.** La app seguía sirviendo `lib/mock/`. |
| 2026-08-31 | Fase 4 | Data layer real (`lib/markets.ts`, `lib/data/{categories,home,products}.ts`) conectando Home y `/producto/[slug]` a Supabase. `lib/mock/` eliminado. Nuevo `lib/supabase/static.ts` (bug real encontrado: `cookies()` no funciona dentro de `generateStaticParams`, corregido). `RemoteImage` (fallback a `MockImage`). `next.config.ts`: `images.remotePatterns` derivado de env. SEO básico (`generateMetadata` en ficha). `error.tsx` del segmento store. DEC-021 (mantener SSG/ISR pese a que rompe el build sin Supabase real — no se cambia arquitectura para ocultar la limitación). **`npm run build` falla en este entorno** (confirmado con y sin credenciales falsas: llega hasta el intento de red real y falla solo por falta de backend alcanzable) — `lint`/`tsc` sí pasan. CI necesitará secrets para pasar. Nada de esto se ha probado contra datos reales. |