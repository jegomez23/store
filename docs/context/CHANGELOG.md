# CHANGELOG — Cambios relevantes del proyecto

> Solo cambios con impacto: arquitectura, funcionalidad importante, schema, UX relevante, estrategia comercial, mercado, decisiones que alteren comportamiento. NO registrar cada pequeño cambio.

---

## 2026-08-26 — FASE 0: Sistema de contexto y documentación base

**What changed:**
- Creado el sistema de contexto para agentes IA (`docs/context/`: PROJECT-CONTEXT, CURRENT-STATE, DECISIONS, DOMAIN-MODEL, DEVELOPMENT-WORKFLOW, KNOWN-CONSTRAINTS, CHANGELOG, AI-DEVELOPMENT).
- Creada la documentación técnica profunda (`docs/01–11`).
- Creadas las reglas por área (`docs/rules/`).
- Reescritos `CLAUDE.md` (contrato de trabajo para agentes) y `README.md` (índice humano).

**Why:**
- Establecer una fuente de verdad navegable que permita a cualquier agente futuro trabajar sin depender de conversaciones previas.

**Impact:**
- Ningún cambio de código ni de configuración de aplicación. El scaffold sigue intacto.
- A partir de ahora, toda tarea debe seguir el workflow de `DEVELOPMENT-WORKFLOW.md`.

---

## 2026-08-31 — FASE 1: Base técnica del proyecto

**What changed:**
- Clientes Supabase preparados (`lib/supabase/browser.ts`, `lib/supabase/server.ts`) con anon key; sin `admin.ts` (service role no usada aún).
- Instaladas `@supabase/supabase-js` y `@supabase/ssr` (únicas dependencias nuevas).
- Tokens de marca YI implementados en `app/globals.css` vía `@theme` (cream, black, grises, rojo acento, verde WhatsApp); eliminada la variante dark del boilerplate (DEC-010: light-only en v1).
- Primitivos UI base en `components/ui/`: `Button`, `Container`, `Badge`, `Divider`, `SectionHeading`. Sin componentes de negocio.
- `app/layout.tsx` y `app/page.tsx` actualizados: `lang="es"`, `metadataBase`, marca "YI" + tagline, placeholder sin catálogo. Boilerplate de create-next-app (SVGs, copy genérico) eliminado.
- `.env.example` creado (plantilla sin secretos); `.gitignore` ajustado para no ignorarlo (`!.env.example`).
- CI mínimo: `.github/workflows/ci.yml` (lint + typecheck + build en push/PR a `main`). DEC-015.
- Regla de testing incremental documentada en `docs/rules/testing.md` y referenciada en Fase 9 del roadmap: la lógica crítica (money, cart, mensajes WhatsApp, promociones, stock, pedidos) se testea en la fase que la construye, no se difiere.

**Why:**
- Ejecutar Fase 1 del roadmap: cimientos técnicos verificables antes de cualquier funcionalidad de negocio.

**Impact:**
- Cero funcionalidad de negocio (catálogo, carrito, checkout, admin, RLS) — explícitamente fuera de alcance.
- No se creó `types/`, `lib/data/`, `lib/cart/`, `lib/checkout/`, `lib/money/`, `lib/i18n/`, `components/store/`, `components/admin/` ni `proxy.ts`: se crean en la fase que primero los necesite con código real, evitando abstracción prematura.
- DEC-013 (idioma) y DEC-014 (mercado inicial CO/ES) permanecen `Proposed`, sin bloquear Fase 1; bloquean Fase 3 (seed).
- `lint`, `tsc --noEmit` y `build` verdes.

---

## 2026-08-31 — FASE 2: Design System + Store Shell

**What changed:**
- Reestructuradas las rutas públicas bajo el route group `app/(store)/` (`02-ARCHITECTURE.md` §2): `layout.tsx` (Header + BottomNav + Footer), `page.tsx` (Home), `producto/[slug]/page.tsx` (ficha). `app/page.tsx` raíz eliminado (route group sirve `/` directamente).
- `components/store/`: `Header` (hamburguesa + drawer móvil, nav horizontal desktop, cierre por backdrop/Escape/botón), `BottomNav` (móvil, resalta ruta activa), `Footer`, `ProductCard`, `VariantPicker` (color/talla, estado local, `aria-pressed`, tallas agotadas deshabilitadas).
- `components/ui/`: `MockImage` (placeholder visual sin Supabase Storage), `icons.tsx` (Menu/Close/Cart/Chevron/Home/Grid, SVG inline propios).
- `lib/mock/products.ts`: 6 productos + 5 categorías mock, explícitamente separado de `lib/data/` (que sigue sin crearse — reservado a Supabase real, Fase 4).
- `lib/money/format.ts`: `formatPrice()` mínimo sobre `Intl.NumberFormat` — adelantado respecto al plan porque `docs/rules/architecture.md` #15 prohíbe formatear dinero fuera de `lib/money/` y la Home/ficha ya necesitaban mostrar precios.
- Home con datos mock: hero, categorías (visual), destacados (`ProductCard` × 4), sección conceptual de marca, CTA final.
- Ficha de producto mock con `generateStaticParams` (6 rutas estáticas), galería mock, `VariantPicker`, CTAs "Comprar por WhatsApp"/"Añadir al carrito" **deliberadamente `disabled`** (sin checkout/carrito real).
- `app/not-found.tsx` con identidad YI.
- DEC-016: mantener Geist Sans/Mono (evaluado, sin tipografía externa).

**Why:**
- Ejecutar Fase 2 del roadmap: validar identidad visual y UX navegable con datos mock, sin tocar Supabase/negocio.

**Impact:**
- Cero Supabase para productos, cero migraciones, cero auth, cero carrito/checkout/admin funcional — todo explícitamente fuera de alcance.
- Todos los enlaces de navegación resuelven a rutas reales o anclas dentro de la misma página (sin `<a>` rotos); "Categorías" es una ancla a la sección de Home, no un listado real (Fase 4).
- `lint`, `tsc --noEmit` y `build` verdes; verificación manual vía `curl` contra `next dev` (home, ficha de producto, 404) — sin navegador headless disponible en este entorno para captura visual.

---

## 2026-08-31 — FASE 3: Supabase + Database + Security

**What changed:**
- DEC-013 (español único) y DEC-014 (mercado inicial = España) resueltas por Juan y registradas.
- 15 migraciones versionadas en `supabase/migrations/`: extensiones + `set_updated_at()` · `profiles` + `is_admin()` (SECURITY DEFINER) · `markets` · `colors`/`sizes` (renombrado `group`→`size_group`) · `categories` (self-ref, trigger de profundidad máx. 2 niveles) · `products` (índices parciales para catálogo público/destacados/nuevos) · `product_images` · `product_variants` (color/talla nullable, DEC-019) · `promotions` + pivotes · `customers` (100% privada) · `orders`/`order_items`/`order_events` (100% privadas, `order_events` append-only con REVOKE explícito) · `shipping_methods` · `settings` (lectura pública condicionada a `markets.is_active`) · `home_content` · Storage (buckets `products`/`content` + policies).
- RLS habilitado en TODAS las tablas, sin excepciones (DEC-009). Patrón: público lee solo activo/publicado, admin gestiona vía `is_admin()`.
- Seed de desarrollo en `supabase/seed/` (6 archivos): `markets` (ES activo, CO inactivo — soportado arquitectónicamente sin seed operativo), colores/tallas globales, 4 categorías + 4 productos + variantes + imágenes placeholder para ES, settings + 2 métodos de envío ES, 1 bloque de home content ES.
- `supabase/config.toml` (config CLI local, sin validar contra CLI real ejecutándose).
- DEC-019 (variantes sin color/talla: nullable, ya recomendado en `03-DATABASE.md`) y DEC-020 (alta de admin manual, sin trigger de auto-creación en `auth.users` — resuelve ambigüedad de `DOMAIN-MODEL.md`) aceptadas.
- `supabase` (CLI) instalado como devDependency; scripts `db:start`/`db:stop`/`db:reset`/`db:lint`/`db:types` en `package.json`.
- `.env.example`: `NEXT_PUBLIC_MARKET=ES` (antes sin valor, DEC-014 ahora resuelta); `SUPABASE_SERVICE_ROLE_KEY` comentado (sigue sin uso).
- `.gitignore`: artefactos locales del CLI de Supabase (`.branches`, `.temp`, `.env`).

**Why:**
- Ejecutar Fase 3 del roadmap: primera infraestructura de datos real, sin construir todavía UI de negocio sobre ella (catálogo conectado es Fase 4).

**Impact:**
- **Limitación importante:** este entorno no tiene Docker/Podman — `supabase start` fallló (`docker: command not found`). Las migraciones y el seed se revisaron manualmente pero **nunca se ejecutaron contra un Postgres real**. No se generaron tipos TypeScript (`db:types` requiere instancia real). Documentado explícitamente en `docs/context/CURRENT-STATE.md` — no se ocultó ni se inventó un resultado de validación.
- La aplicación (`app/(store)/`) sigue sirviendo `lib/mock/products.ts`; nada se conectó a Supabase todavía — cero riesgo de romper la Fase 2.
- Cero checkout, cero pagos, cero admin UI, cero auth UI, cero carrito — fuera de alcance explícito de esta fase.
- `lint`, `tsc --noEmit` y `build` verdes (sin cambios en código de aplicación, solo config/migraciones/docs).

---

## 2026-08-31 — FASE 4: Data Layer + Catálogo Real

**What changed:**
- `lib/markets.ts`: `getActiveMarket()` resuelve `NEXT_PUBLIC_MARKET` y lo valida contra la tabla `markets` (docs/07-MULTI-MARKET.md §4), memoizado por request con `cache()`.
- `lib/data/categories.ts`, `lib/data/home.ts`, `lib/data/products.ts` (`getFeaturedProducts`, `getProductBySlug`, `getAllProductSlugs`): capa de acceso a datos real sobre Supabase, todas memoizadas por request.
- `lib/supabase/static.ts` (nuevo): cliente Supabase sin cookies para lecturas públicas. **Motivo real, no estético:** `generateStaticParams` corre en build-time sin request/cookies — el cliente `server.ts` existente lanza error ahí. Confirmado con un build real (ver Validaciones).
- `app/(store)/page.tsx` (Home) y `app/(store)/producto/[slug]/page.tsx` (ficha) conectados a Supabase: `generateStaticParams`, `generateMetadata` (SEO básico), `revalidate = 300` (docs/02-ARCHITECTURE.md §3, sin cambios de estrategia).
- `app/(store)/layout.tsx` pasa categorías reales a `Header` (antes importaba el mock directamente).
- `components/ui/RemoteImage.tsx` (nuevo): `next/image` con fallback a `MockImage` si no hay `src` o falla la carga (`onError`, client component mínimo).
- `components/store/ProductCard.tsx` y `VariantPicker.tsx` adaptados a las formas de datos reales (`CatalogProduct`, `ProductVariantOption`) — sin duplicar formateo de precio (sigue en `lib/money/`).
- `next.config.ts`: `images.remotePatterns` derivado del hostname de `NEXT_PUBLIC_SUPABASE_URL` (vacío si no está configurada — sin hardcodear ningún project-ref).
- `app/(store)/error.tsx` (nuevo): error boundary del segmento público — necesario ahora que existen fallos reales de I/O (antes todo era mock, nunca fallaba).
- `lib/mock/products.ts` **eliminado** (cero consumidores tras el rewire).
- `lib/money/format.ts`: defaults cambiados de COP/es-CO (temporal Fase 2) a EUR/es-ES (DEC-014).
- `.github/workflows/ci.yml`: el paso de build ahora inyecta `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` desde GitHub Secrets.
- DEC-021: se documentó y aceptó mantener SSG+ISR (no cambiar a `force-dynamic`) aunque eso signifique que el build falla sin Supabase real — evitar "arreglar" el build ocultando la limitación real.

**Why:**
- Ejecutar Fase 4 del roadmap: sustituir los mocks de Fase 2 por el catálogo real construido en Fase 3.

**Impact — LIMITACIÓN IMPORTANTE:**
- Sin Docker/proyecto Supabase real en este entorno (mismo diagnóstico que Fase 3), **`npm run build` falla**. Se investigó activamente en vez de asumir: primero reveló un bug real (`cookies()` en `generateStaticParams`, corregido con `lib/supabase/static.ts`); después, con credenciales de formato válido pero sin backend real, confirmó que el único fallo restante es de red/credenciales (`fetch failed`), no de código. `lint` y `tsc --noEmit` sí pasan limpios.
- La aplicación ya NO tiene fallback a datos mock: sin Supabase real, la tienda no funciona en absoluto (antes, en Fase 2-3, la UI seguía siendo navegable con mocks). Esto es intencional (instrucción explícita de Fase 4: eliminar mocks una vez conectada la implementación real) pero es un cambio de riesgo operativo real que el usuario debe conocer.
- Ninguna funcionalidad de negocio (carrito, checkout, WhatsApp, admin, auth) fue tocada.

---

<!-- Plantilla para futuras entradas:

## YYYY-MM-DD — Nombre del cambio

**What changed:**
...

**Why:**
...

**Impact:**
...
-->