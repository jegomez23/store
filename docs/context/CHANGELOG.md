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

## 2026-09-01 — Fase 4.5: validación real contra Supabase + hardening

**What changed:**

Primera ejecución real de todo lo construido en Fases 3-4 contra un proyecto Supabase de verdad (PostgreSQL 17.6). No se añadió ninguna funcionalidad de negocio.

- **Migraciones aplicadas por primera vez**: las 15 de Fase 3 se aplicaron limpiamente sobre un proyecto vacío vía `supabase link` + `supabase db push` (flujo remoto, sin Docker). Verificadas contra el catálogo del sistema: 18 tablas, RLS en las 18, PK/FK/UNIQUE/CHECK, índices parciales, triggers y buckets de Storage coinciden con `03-DATABASE.md`.
- **Seed hecho idempotente** (`04`, `05`, `06`): antes fallaba o duplicaba filas al reejecutarse. Ahora usa `on conflict do nothing` donde hay constraint e `insert ... select ... where not exists` donde no la hay. Probado reejecutando los 6 archivos: 0 errores, 0 duplicados.
- **`types/database.types.ts` generado** desde el esquema real (`npm run db:types`, ahora `--linked`). Los tres clientes Supabase se tipan con `Database`.
- **`lib/data/products.ts` sin tipos manuales**: se eliminaron las interfaces `RawImage`/`RawVariant`, los casts `as RawVariant[]` y el helper `oneOrNull()` (existía solo porque, sin tipos generados, no se podía inferir la cardinalidad de los embeds). Ahora los tipos de fila se derivan con `QueryData<typeof query>`. Verificado con aserciones de tipo: nada degrada a `any`, `colors`/`sizes` se infieren como objeto nullable (no array) y un nombre de columna inválido rompe la compilación.
- **DEC-022** (migración `0016`): la lectura pública de `categories`/`products`/`product_images`/`product_variants` no comprobaba que el mercado estuviera activo, aunque `03-DATABASE.md` §3 lo exigía. Un producto del mercado CO (inactivo) era legible con la anon key. Corregido con `public.is_active_market()`.
- **DEC-023** (migración `0017`): `anon` y `authenticated` tenían TRUNCATE y TRIGGER sobre las 18 tablas (grants por defecto de Supabase). RLS no filtra esos privilegios. Revocados, más `ALTER DEFAULT PRIVILEGES` para las tablas futuras.
- **Bug de rutas de Storage corregido**: el seed guardaba `products/<slug>/01-main.jpg` en `product_images.url`, pero `getPublicUrl()` ya antepone el bucket → generaba `.../public/products/products/...`, rota de forma permanente. Corregido en el seed y en las filas ya aplicadas.
- **Bug de formato de precio corregido** (`lib/money/format.ts`): `maximumFractionDigits: 0` se aplicaba a todas las monedas, así que el catálogo real en euros mostraba «90 €» en vez de «89,90 €». Ahora solo las monedas de convención sin decimales (COP y similares) fuerzan 0 decimales.
- **404 del segmento público** (`app/(store)/not-found.tsx`, nuevo): sin él, `notFound()` desde la ficha de producto renderizaba el boundary FUERA del root layout y devolvía un documento con `<body>` vacío.
- **Seed: productos marcados `is_featured`**: ningún producto lo estaba, así que la sección "destacados" de Home salía vacía con datos reales.
- `supabase/config.toml`: `major_version` 15 → 17 (versión real del proyecto).
- `package.json`: `db:types` apuntaba a `lib/supabase/database.types.ts`, contradiciendo `02-ARCHITECTURE.md` y `docs/rules/architecture.md` #7 (`types/`). Corregido; añadidos `db:types:local`, `db:push`, `db:push:seed`.
- `.github/workflows/ci.yml`: paso de preflight que falla con un mensaje claro si faltan los GitHub Secrets, sin imprimir sus valores.
- `docs/rules/database.md`: reglas nuevas 13, 14, 18 y 19 (mercado activo, revoke, idempotencia del seed, rutas de bucket) y renumeración de la lista, que tenía índices duplicados.

**Why:**

Antes de construir el carrito (Fase 5) había que comprobar que la base sobre la que se apoya existe de verdad y es segura. Nada de Fases 3-4 se había ejecutado ni una vez contra datos reales.

**Impact:**

- **`npm run build` pasa por primera vez.** Genera Home + las 4 fichas de producto como estáticas con ISR 5 min, tal y como especificaba DEC-021.
- **RLS validado empíricamente, no por lectura de SQL:** 78 comprobaciones con anon, con un usuario autenticado sin rol y con un admin temporal (creado y eliminado durante la prueba), más 10 sobre Storage. Incluye un intento explícito de escalada de privilegios, denegado. Recuento de filas idéntico antes y después.
- La base de datos quedó en el estado exacto del seed: todas las filas de prueba y el usuario temporal fueron eliminados y verificados.
- Ninguna policy se debilitó para hacer funcionar la aplicación; las dos correcciones de seguridad van en la dirección contraria.
- Sin funcionalidad de negocio nueva: cero carrito, checkout, WhatsApp, admin y auth.

---

## 2026-09-01 — FASE 5: Carrito real (estado cliente + persistencia local)

**What changed:**

- **`lib/cart/`** (nuevo): `types.ts` (solo tipos), `reducer.ts` (lógica pura), `storage.ts` (localStorage versionado) y `context.tsx` (`CartProvider` + `useCart`).
  - Acciones: `ADD_ITEM`, `REMOVE_ITEM`, `UPDATE_QUANTITY`, `CLEAR_CART`, `HYDRATE`.
  - La identidad de una línea es **`variantId`** y solo eso; dos variantes del mismo producto son líneas distintas y añadir la misma variante dos veces fusiona cantidades.
  - El reducer es la **única autoridad** sobre qué es un carrito válido: `HYDRATE` recibe el contenido de localStorage como `unknown` y lo sanea, para que `storage.ts` no duplique validación.
  - `status: 'pending' | 'ready'` vive en el estado del reducer en vez de en un `useState` aparte, para no llamar a `setState` dentro de un efecto (regla `react-hooks/set-state-in-effect` de React 19).
- **Persistencia**: clave versionada `yi-store:cart:v1` con envoltorio `{version, marketId, lines}`. JSON corrupto, versión desconocida o carrito de otro mercado → se ignora, se limpia la entrada y la app sigue con carrito vacío. Todas las funciones son no-op sin `window` (SSR/build).
- **`/carrito`** (nuevo): shell Server Component + `CartContents` client. Estados vacío, con líneas, skeleton de carga y resumen con subtotal/total. `robots: noindex`.
- **Ficha de producto**: los CTA dejaron de estar deshabilitados. Nuevo `AddToCartForm` que resuelve (color + talla) → **variante concreta** antes de añadir, con validación inline si falta elegir. `VariantPicker` pasa a ser un componente **controlado** (antes guardaba color/talla sin resolver la variante, que es lo que el carrito necesita).
- **Header y BottomNav**: el icono de carrito pasa de botón deshabilitado a enlace real a `/carrito`, con badge de **unidades totales** (2 camisetas + 1 sudadera = 3) y `aria-label` que anuncia la cantidad.
- **`components/ui/QuantityStepper.tsx`** (nuevo): stepper genérico, sin conocimiento del carrito. Iconos `MinusIcon`/`PlusIcon`/`TrashIcon` añadidos a `icons.tsx`.
- **`lib/data/products.ts`**: `getProductBySlug` ahora devuelve también `products.id`, necesario para `CartLine.productId`.
- **Tests**: 108 tests con el runner nativo de Node (DEC-025), sin dependencias nuevas — reducer, persistencia y un flujo completo que simula recargar la página.
- **DEC-024**: el carrito pertenece a un único mercado; el de otro mercado se descarta en vez de mezclarse o migrarse.
- **DEC-025**: runner de tests `node:test` + type stripping. Resuelve la contradicción entre `rules/testing.md` (tests en la misma fase que la lógica crítica) y `10-ROADMAP.md` (runner en Fase 9).
- **Bug corregido durante la fase**: una cantidad enorme en localStorage (`99999`) caía a 1 en vez de recortarse al stock/tope, al contrario que el resto de rutas. Detectado por el test de flujo, no por lectura del código.

**Why:**

Ejecutar Fase 5 del roadmap: un carrito local robusto y persistente, listo para que Fase 6 le conecte el checkout.

**Impact:**

- **El carrito NO es autoridad de nada.** `unitPrice` y `stockSnapshot` son snapshots de UX guardados en localStorage, que el usuario puede editar. Hay un test que documenta explícitamente que un precio manipulado se restaura tal cual: **Fase 6 debe reconstruir el pedido en servidor contra Supabase** (precio, stock y promociones reales) antes de aceptarlo.
- El carrito no toca stock: no decrementa ni reserva inventario.
- Desacoplado del checkout (DEC-007): `selectCheckoutItems()` expone solo `{variantId, quantity}` — exactamente `CheckoutInput.items` de `06-WHATSAPP.md` §3, deliberadamente **sin precio**. Un test estructural falla si algún archivo de `lib/cart/` llega a importar WhatsApp, Stripe, Supabase o checkout.
- El CTA "Finalizar compra" queda **visible pero deshabilitado**: habilitarlo exigiría inventar aquí una ruta o una llamada a WhatsApp, justo el acoplamiento que DEC-007 prohíbe.
- Sin cambios en Supabase: ni tablas, ni migraciones, ni policies, ni seed.
- `tsconfig.json`: `allowImportingTsExtensions: true` (necesario para el runner nativo; seguro con `noEmit`).

---

## 2026-09-01 — FASE 6: Checkout + WhatsApp + creación segura de pedidos

**What changed:**

Primer checkout funcional de YI Store. El flujo completo producto → variante → carrito → checkout → pedido real → mensaje → enlace de WhatsApp funciona de extremo a extremo contra Supabase real.

- **Migración `0018_checkout_create_order.sql`**:
  - `public.create_order(...)`: función `SECURITY DEFINER` que valida y escribe **todo el pedido en una sola transacción**. Recibe únicamente `variant_id` + `quantity` + datos de contacto + `client_request_id`; resuelve precio, nombre, color, talla, SKU, stock y totales desde PostgreSQL. Se invoca con la **anon key** (`revoke all from public` + `grant execute to anon, authenticated`).
  - `order_counters (market_id, last_number)`: correlativo de `order_number` por mercado.
  - `orders.client_request_id` + `orders.client_request_fingerprint` con índice UNIQUE parcial.
- **`lib/checkout/`** (nuevo): `types.ts` (separa `CheckoutInput` no confiable de `TrustedOrder` del servidor), `errors.ts` (14 códigos de dominio + copy de usuario), `validation.ts` (pura), `create-order.ts` (envoltura fina sobre la RPC), `channel.ts` (`getCheckoutChannel()`), `storage-key.ts`.
- **`lib/whatsapp/`** (nuevo): `phone.ts` (normalización E.164 y **único** constructor de `wa.me`), `message.ts` (`buildOrderMessage()`, pura, plantillas de `06-WHATSAPP.md` §2), `channel.ts` (`WhatsAppChannel`).
- **`lib/data/settings.ts`** (nuevo): fuente única del `whatsapp_number` del mercado activo.
- **UI**: `/checkout` (shell server + `CheckoutForm` client + Server Action) y `/pedido/[numero]` (confirmación). El CTA del carrito deja de estar deshabilitado; la ficha de producto recupera `COMPRAR POR WHATSAPP` (copy de `04-UX-UI.md` §166) que añade la variante y lleva a `/checkout`.
- **Tests**: +102 (227 en total). Incluye **40 de integración contra el Supabase real llamando a la RPC con la anon key**: precio manipulado, stock manipulado, variante inexistente/inactiva, producto eliminado/en draft, producto de otro mercado, mercado inactivo, stock insuficiente, **concurrencia real** (10 compras simultáneas contra 3 unidades → exactamente 3 ganan) e **idempotencia real** (doble submit, retry, dos pestañas, misma clave con payload distinto).
- **DEC-026** (RPC en vez de `service_role`), **DEC-027** (`YI-ES-000001`, cierra la decisión abierta de Juan), **DEC-028** (idempotencia con fingerprint), **DEC-029** (sin Zod), **DEC-030** (teléfono y nombre obligatorios).

**Why:**

Ejecutar Fase 6 del roadmap y cerrar la primera venta real. El reto no era la UI sino el modelo de confianza: el carrito vive en localStorage y Fase 5 ya documentó que un precio manipulado se restaura tal cual.

**Impact:**

- **Un atacante no puede cambiar el precio de un pedido.** Verificado: se envía la variante de 89,90 € declarando 1 € y el pedido guardado dice 89,90 €. El precio no se puede falsificar porque `create_order` **no lo recibe**; inyectar un total a nivel de pedido devuelve 404 porque no existe tal parámetro.
- **Sin `service_role` en la aplicación**: 0 ocurrencias de la clave en los 221 archivos del build. Las tablas de pedidos siguen sin policies públicas de INSERT; `anon` no puede leerlas ni escribirlas directamente.
- **Sin overselling**: el decremento usa `where stock >= qty` + recuento de filas, dentro de la transacción. Si una línea falla, se revierte el stock de las demás.
- **Sin pedidos duplicados**: la garantía la da un índice UNIQUE en PostgreSQL, no el estado del botón.
- El pedido nace `pending` y **jamás** pasa a `paid` automáticamente.
- `lib/cart/` no se tocó: sigue sin conocer WhatsApp, checkout ni Supabase (test estructural incluido).
- **Sin dependencias nuevas** (Zod descartado con justificación).
- **Fuera de alcance deliberado**: promociones y envío (`discount_total = 0`, `shipping_total = 0`) — no están en las tareas de Fase 6 del roadmap y la regla "promoción más favorable gana" sigue pendiente de Juan.
- **Contradicción resuelta, no ocultada**: `06-WHATSAPP.md` declaraba `customer` opcional pero el esquema lo exige NOT NULL. Se corrigió el documento (DEC-030).
- **Discrepancia documentada sin tocar la BD**: `order_items` no guarda la imagen del producto, así que un pedido histórico no puede mostrarla. No se añadió columna: ni el mensaje ni el admin la necesitan.

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