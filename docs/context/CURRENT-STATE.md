# CURRENT-STATE — Estado real del proyecto

> ⚠️ **Este archivo debe actualizarse al final de CADA fase.** Es la primera consulta para saber dónde estamos. Describe el estado REAL del repositorio, no el deseado.

---

## STATUS

**FASE 6 — Checkout + WhatsApp (COMPLETADA)**

Última actualización: 2026-09-01

---

## Fase 6 — Estado por categoría

### ✅ IMPLEMENTADO (existe, se ejecuta y está verificado)

| Pieza | Verificación |
|---|---|
| `create_order` (migración `0018`, `SECURITY DEFINER`) | 40 tests de integración **llamando a la RPC con la anon key** |
| Precio, stock, nombre, color, talla y totales resueltos en PostgreSQL | Precio manipulado (1 € sobre una variante de 89,90 €) → el pedido guarda 89,90 € |
| Decremento de stock atómico sin overselling | 10 compras simultáneas contra 3 unidades → exactamente 3 tienen éxito, stock final 0 |
| Atomicidad | Si una línea falla, el stock de las otras se revierte |
| Idempotencia por `client_request_id` + fingerprint | Doble submit, 3 reintentos y 3 pestañas simultáneas → **un solo pedido**, stock descontado una vez |
| Clave reutilizada con payload distinto | `IDEMPOTENCY_KEY_REUSED` sin modificar absolutamente nada |
| `order_number` correlativo por mercado (`YI-ES-000001`) | Números consecutivos verificados |
| `orders` + `order_items` (snapshots) + `order_events` | Comprobados en BD tras cada pedido |
| Cliente creado/reutilizado por `(market_id, phone)` | Dos pedidos del mismo teléfono → un solo `customer` |
| `CheckoutChannel` + `WhatsAppChannel` (DEC-007) | La UI solo usa `getCheckoutChannel()` |
| `buildOrderMessage()` + `buildWhatsAppUrl()` | Mensaje y enlace generados con datos reales de BD |
| Número de WhatsApp desde `settings` | Verificado: no aparece hardcodeado ni en el HTML servido |
| `/checkout` y `/pedido/[numero]` | 20 comprobaciones HTTP sobre el build de producción |
| RLS intacta | `anon` no lee ni inserta en `orders`/`order_items`/`order_events`/`customers` |
| Sin `service_role` en la app | 0 ocurrencias de la clave en los 221 archivos del build |

### 🟡 PREPARADO (código listo, sin uso real todavía)

- Líneas de **descuento y envío** en el mensaje de WhatsApp: solo se imprimen si el importe es > 0. Hoy siempre valen 0.
- `OnlinePaymentChannel` (Fase 11): la interfaz y la factory ya existen; solo falta la implementación.
- `lib/supabase/server.ts` y `browser.ts`: siguen sin consumidor real (Fase 7).

### ⬜ PENDIENTE

- Panel admin para ver y gestionar los pedidos (Fase 7). **Hoy un pedido creado solo se puede consultar con la service role key o desde el dashboard de Supabase.**
- Promociones y cálculo de envío (regla "promoción más favorable" pendiente de Juan).
- GitHub Secrets de CI · fotografías reales · `/categoria/[slug]` · `lib/i18n/`.

### ❌ NO IMPLEMENTADO (fuera de alcance deliberado)

- Pagos online, Stripe/MercadoPago/Wompi.
- Login/cuentas de cliente e historial de pedidos.
- Emails, SMS, tracking, analytics.
- Cupones canjeables en la compra.

### ⚠️ DEUDA TÉCNICA

- **Sin navegador automatizado en este entorno**: el recorrido con clics reales en un navegador **NO está validado**. Lo que sí se validó: la cadena completa RPC → `TrustedOrder` → mensaje → `wa.me` con el código de producción, y 20 comprobaciones HTTP sobre el build servido.
- `order_items` **no guarda la imagen** del producto: un pedido histórico no puede mostrar la foto (documentado en `03-DATABASE.md`, sin cambiar el esquema).
- `create_order` es un endpoint público sin autenticación: se pueden crear pedidos basura que consuman stock. Inherente a un checkout sin login; mitigación (rate limiting) prevista para Fase 10.
- `is_admin()` e `is_active_market()` conservan `EXECUTE` para PUBLIC (herencia de Fases 3/4.5). Es necesario para que las policies se evalúen, y ambas son inocuas para un anónimo, pero no está acotado a `anon`/`authenticated`.
- Cobertura: `lib/checkout/`, `lib/whatsapp/` y `lib/cart/` tienen tests; `lib/money/` y `lib/data/` siguen sin ellos.
- El stock **no se restaura** al cancelar un pedido: la acción compensatoria es del admin (Fase 7).

---

## Fase 5 (histórico) — Qué se construyó

Carrito local funcional, persistente y desacoplado del checkout. Sin cambios en Supabase.

| Comprobación | Resultado |
|---|---|
| `lib/cart/` (types, reducer, storage, context) | ✅ Reducer puro; sin `window`/Supabase/WhatsApp dentro |
| Acciones ADD / REMOVE / UPDATE / CLEAR / HYDRATE | ✅ Con validación defensiva de cada entrada |
| Identidad de línea = `variantId` | ✅ Duplicados fusionados; variantes distintas = líneas distintas |
| Persistencia `yi-store:cart:v1` | ✅ Envoltorio versionado `{version, marketId, lines}` |
| JSON corrupto / versión desconocida | ✅ Se ignora, se limpia la entrada, la app sigue viva |
| `/carrito` | ✅ Vacío, con líneas, skeleton, subtotal y total |
| Contador en Header y BottomNav | ✅ Unidades totales, no líneas |
| Ficha → carrito | ✅ Exige variante resuelta (color+talla según DEC-019) |
| `npm test` | ✅ **108 tests** (runner nativo de Node, DEC-025) |
| `npm run lint` · `npx tsc --noEmit` · `npm run build` | ✅ Los tres pasan |
| Validación HTTP sobre el build de producción | ✅ 20 comprobaciones sobre `next start` |
| Cambios en base de datos | ✅ Ninguno (ni tablas, ni migraciones, ni policies, ni seed) |

**Límite de seguridad, explícito:** el carrito **no es autoridad de nada**. `unitPrice` y `stockSnapshot` son snapshots de UX guardados en localStorage y editables por el usuario. Hay un test que documenta que un precio manipulado se restaura tal cual. **Fase 6 debe reconstruir el pedido en servidor contra Supabase antes de aceptarlo** (precio, stock y promociones reales).

**Contrato con el futuro checkout (DEC-007):** `selectCheckoutItems()` devuelve solo `{variantId, quantity}` — exactamente `CheckoutInput.items` de `06-WHATSAPP.md` §3, sin precio a propósito. Un test estructural falla si algún archivo de `lib/cart/` importa WhatsApp, Stripe, Supabase o checkout.

**Bug encontrado y corregido en esta fase:** una cantidad enorme en localStorage (`99999`) caía a 1 en vez de recortarse al stock/tope, al contrario que el resto de rutas. Lo detectó el test de flujo completo, no la lectura del código.

### No verificado en esta fase

- **Sin navegador automatizado en este entorno** (la extensión de Chrome no está instalada). El comportamiento en el DOM real —clic en "Añadir", el badge cambiando, la recarga de página— **no se ha visto en un navegador**. Lo que sí se comprobó: el flujo equivalente a nivel de lógica (añadir → persistir → recargar → hidratar) con tests que ejercitan reducer y storage juntos, y 20 comprobaciones HTTP sobre el build de producción (SSR de `/carrito`, CTA activo en la ficha, enlaces y labels del contador). Queda pendiente un recorrido manual en navegador.

---

## Fase 4.5 (histórico) — la validación que hizo posible esta fase

Fases 3 y 4 se escribieron sin poder ejecutarlas nunca (ni Docker ni proyecto Supabase real). La Fase 4.5 conectó el repo a un proyecto Supabase real (PostgreSQL 17.6) y ejecutó todo por primera vez.

**Verificado contra la instancia real (2026-09-01):**

| Comprobación | Resultado |
|---|---|
| Conexión a Supabase real | ✅ Las 4 `NEXT_PUBLIC_*` presentes y funcionando |
| 17 migraciones aplicadas (`supabase db push`) | ✅ Limpias sobre proyecto vacío |
| Esquema real vs `03-DATABASE.md` | ✅ 18 tablas, RLS en las 18, PK/FK/UNIQUE/CHECK, índices parciales, triggers, buckets |
| Seed idempotente | ✅ Los 6 archivos reejecutados: 0 errores, 0 duplicados |
| `types/database.types.ts` generado | ✅ Desde el esquema real; los 3 clientes tipados con `Database` |
| Data layer con tipos reales | ✅ Sin `any`, sin casts, sin interfaces `Raw*` manuales |
| RLS (anon / authenticated / admin) | ✅ 78 comprobaciones, incluido un intento de escalada de privilegios denegado |
| Storage | ✅ Buckets públicos en lectura, escritura solo admin |
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| **`npm run build`** | ✅ **Pasa por primera vez** (Home + 4 fichas SSG con ISR 5 min) |
| Home / ficha / 404 sobre el build de producción | ✅ 34 comprobaciones HTTP sobre `next start` (build de producción) |
| Auditoría de secretos | ✅ 0 ocurrencias de la service role key en el bundle |

**Bugs reales encontrados y corregidos en esta fase** (ninguno era teórico — todos aparecieron al ejecutar):

1. **Rutas de Storage rotas**: el seed guardaba `products/<slug>/01-main.jpg` en `product_images.url`, pero `getPublicUrl()` ya antepone el bucket → URLs `.../public/products/products/...` permanentemente rotas, incluso después de subir fotos reales.
2. **Precios mal formateados**: `maximumFractionDigits: 0` para todas las monedas mostraba «90 €» en vez de «89,90 €» en el catálogo real en euros.
3. **404 de producto en blanco**: sin `app/(store)/not-found.tsx`, `notFound()` renderizaba el boundary fuera del root layout y devolvía un `<body>` vacío.
4. **Home sin destacados**: ningún producto del seed tenía `is_featured`, así que la sección salía vacía con datos reales.
5. **Seed no idempotente**: reejecutarlo fallaba o duplicaba filas.
6. **Catálogo de mercado inactivo público** (DEC-022): las policies no comprobaban `markets.is_active` pese a que `03-DATABASE.md` §3 lo exigía.
7. **TRUNCATE/TRIGGER concedidos a `anon`** (DEC-023): privilegios que RLS no filtra.

---

## Pendientes heredados de Fase 4.5

- [ ] **GitHub Secrets** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — acción manual en GitHub, fuera del repo. Sin ellos CI falla (ahora con un mensaje explícito, no con un error de red críptico). Ver `11-ENVIRONMENT.md` §4.1.
- [ ] **Fotografías reales** en los buckets `products`/`content` — ambos están vacíos a propósito (no se suben assets ficticios). Hasta entonces `RemoteImage` cae a `MockImage`. La infraestructura está verificada: subir un objeto y servirlo por URL pública funciona.
- [ ] **Endurecer los buckets**: se crearon sin `file_size_limit` ni `allowed_mime_types`. El límite "≤5MB, solo imagen" existe hoy solo como validación de aplicación prevista (Fase 7), no como restricción de infraestructura.
- [ ] **Render del 404 de producto sin verificar en navegador**: el estado HTTP (404) y el `<title>` son correctos y la UI del 404 viaja en el payload RSC, pero Next.js 16 sirve `notFound()` a través de su shell `__next_error__` con el `<body>` inicial vacío y hidrata en cliente (comprobado igual en dev y en producción). No se pudo confirmar visualmente: **no había navegador automatizado disponible en este entorno.**
- [ ] **Stack local con Docker** (`npm run db:start`) sigue sin probarse — este entorno no tiene Docker. El flujo remoto sí está validado.
- [ ] Primer admin real: no existe ninguna fila en `profiles` (el admin usado en las pruebas se creó y se eliminó). Alta manual cuando se necesite (DEC-020).
- [ ] `/categoria/[slug]`, `lib/i18n/`, `lib/supabase/admin.ts`, `proxy.ts`, suite de tests — sin cambios respecto a Fase 4.

---

## Resumen ejecutable

El catálogo real se sirve desde Supabase y **está ejecutado y verificado contra la instancia real**: esquema, seed, RLS, Storage, data layer tipada, build de producción y las páginas servidas por `next start`. `lib/mock/` sigue eliminado: NO hay fallback si Supabase no está disponible — la tienda depende por completo de un Supabase real y accesible, incluso para hacer `npm run build` (DEC-021, deliberado).

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
├── .github/workflows/ci.yml   # lint + tsc + preflight de secrets + build (secrets aún sin configurar)
├── app/
│   ├── globals.css            # IMPLEMENTADO — tokens YI vía @theme (04-UX-UI.md §2)
│   ├── layout.tsx             # IMPLEMENTADO — root layout: fuentes, metadataBase, lang="es"
│   ├── not-found.tsx          # IMPLEMENTADO (Fase 2) — 404 con identidad YI
│   └── (store)/                # IMPLEMENTADO — route group público
│       ├── layout.tsx          # Header+categorías reales + BottomNav + Footer (Fase 4)
│       ├── error.tsx           # IMPLEMENTADO (Fase 4) — error boundary del segmento
│       ├── not-found.tsx       # IMPLEMENTADO (Fase 4.5) — 404 del segmento público
│       ├── carrito/page.tsx    # IMPLEMENTADO (Fase 5) — shell server + CartContents client
│       ├── checkout/           # IMPLEMENTADO (Fase 6) — page.tsx + actions.ts (Server Action)
│       ├── pedido/[numero]/    # IMPLEMENTADO (Fase 6) — confirmación (NO consulta la BD)
│       ├── page.tsx            # Home REAL (Supabase): hero, categorías, destacados, conceptual, CTA
│       └── producto/[slug]/page.tsx   # Ficha REAL: generateStaticParams+generateMetadata+notFound
├── components/
│   ├── ui/                     # Button, Container, Badge, Divider, SectionHeading, icons.tsx,
│   │                            # MockImage (fallback visual), RemoteImage (Fase 4, next/image
│   │                            # con fallback a MockImage si falla la carga),
│   │                            # QuantityStepper (Fase 5, genérico sin lógica de carrito)
│   └── store/                  # Header + BottomNav (con contador de carrito, Fase 5), Footer,
│       │                        # ProductCard, VariantPicker (CONTROLADO desde Fase 5)
│       ├── cart/               # AddToCartForm, CartContents, CartLineItem, CartCount (Fase 5)
│       └── checkout/           # CheckoutForm, OrderConfirmation (Fase 6)
├── lib/
│   ├── supabase/               # los 3 clientes tipados con Database (Fase 4.5)
│   │   ├── browser.ts          # IMPLEMENTADO — cliente anon para Client Components (sin uso aún)
│   │   ├── server.ts           # IMPLEMENTADO — cliente con cookies/sesión (SIN USO — Fase 6-7)
│   │   └── static.ts           # IMPLEMENTADO (Fase 4) — cliente sin cookies, lecturas públicas.
│   │                            # admin.ts (service role) NO EXISTE aún
│   ├── cart/                    # IMPLEMENTADO (Fase 5) — types, reducer (puro), storage,
│   │                             # context + __tests__/ (108 tests)
│   ├── checkout/                # IMPLEMENTADO (Fase 6) — types, errors, validation,
│   │                             # create-order, channel (NO conoce WhatsApp)
│   ├── whatsapp/                # IMPLEMENTADO (Fase 6) — phone, message (puras), channel
│   ├── markets.ts               # IMPLEMENTADO (Fase 4) — getActiveMarket(), valida contra BD
│   ├── data/                    # categories, home, products (Fase 4) + settings (Fase 6)
│   │                             # (getFeaturedProducts, getProductBySlug, getAllProductSlugs)
│   └── money/format.ts          # default ES/EUR; decimales por moneda (fix Fase 4.5)
├── types/database.types.ts    # GENERADO (Fase 4.5) desde el esquema real — npm run db:types
├── docs/                       # ← CREADO EN FASE 0, actualizado en Fases 1-4.5
│   ├── 01-PRODUCT.md … 11-ENVIRONMENT.md
│   ├── rules/                  # Reglas por área (7 archivos)
│   └── context/                # Sistema de contexto para agentes (8 archivos)
├── supabase/
│   ├── config.toml              # major_version=17 (alineado con el proyecto real); stack local sin probar
│   ├── migrations/              # 18 migraciones (15 Fase 3 + 0016/0017 Fase 4.5 + 0018 Fase 6) APLICADAS y
│   │                             # verificadas contra PostgreSQL 17.6 real
│   └── seed/                    # seed dev ES APLICADO; idempotente (verificado reejecutando)
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

`types/database.types.ts` **ya existe** (generado en Fase 4.5 desde el esquema real; regenerar con `npm run db:types` tras cada migración). `lib/cart/` existe desde Fase 5. Carpetas **deliberadamente no creadas** todavía: `lib/checkout/`, `lib/i18n/`, `components/admin/`, `proxy.ts`, `lib/supabase/admin.ts`. `lib/mock/` fue eliminado en Fase 4 (cero consumidores tras conectar Home/ficha a Supabase).

---

## Funcionalidades

| Funcionalidad | Estado |
|---|---|
| Análisis y documentación de arquitectura | ✅ Completada (Fase 0) |
| Sistema de contexto para agentes | ✅ Completada (Fase 0) |
| Design Tokens (`@theme` en globals.css) | ✅ Implementado (Fase 1) |
| Primitivos UI (Button, Container, Badge, Divider, SectionHeading, MockImage, icons) | ✅ Implementado (Fases 1-2) — sin componentes de negocio en `ui/` |
| Clientes Supabase (browser/server, anon key) | ✅ Implementado (Fase 1) — sin proyecto Supabase real conectado, sin admin.ts |
| CI (lint + typecheck + build) | ✅ Implementado; **en rojo hasta configurar los GitHub Secrets** (11-ENVIRONMENT §4.1) |
| Store shell (Header, nav móvil/desktop, drawer, BottomNav, Footer) | ✅ Implementado (Fase 2) — responsive, accesible (aria-pressed, Escape, focus visible) |
| Home (con datos MOCK) | ✅ Implementado (Fase 2) — hero, categorías, destacados, sección conceptual, CTA |
| Esquema de base de datos (18 tablas, RLS, Storage) | ✅ Implementado **y aplicado/verificado contra Postgres 17.6 real** (Fase 4.5) |
| Seed de desarrollo (ES operativo, CO solo `markets`) | ✅ Aplicado e **idempotente** (Fase 4.5) |
| `profiles` + `is_admin()` (base para auth futura) | ✅ **Verificado funcionando** (Fase 4.5): admin real probado y escalada de privilegios denegada. Sin UI de auth, sin `proxy.ts`, alta manual (DEC-020) |
| Data layer (`lib/data/`, `lib/markets.ts`) | ✅ **Validado contra datos reales** y tipado desde `types/database.types.ts` (Fase 4.5) |
| Home conectada a Supabase (hero/categorías/destacados reales) | ✅ **Verificada sobre el build de producción** (Fase 4.5) |
| Ficha de producto conectada a Supabase (variantes/imágenes/SEO real) | ✅ **Verificada sobre el build de producción**; 404 correcto para slug inexistente/borrado/inactivo/otro mercado (Fase 4.5) |
| `next/image` + Supabase Storage (`RemoteImage` con fallback) | ✅ **Pipeline verificado end-to-end** (Fase 4.5): host Supabase permitido → 200; host no permitido → 400. Buckets vacíos a propósito: se ve el fallback `MockImage` hasta subir fotos reales |
| Carrito (local, persistente) | ✅ Implementado (Fase 5) — `lib/cart/`, `/carrito`, contador, 108 tests. Snapshot de precio NO autoritativo (DEC-005, DEC-024) |
| Checkout por WhatsApp | ✅ Implementado (Fase 6) — `CheckoutChannel` + `WhatsAppChannel`, pedido real creado con `create_order` (DEC-026). Precio y stock resueltos en PostgreSQL; idempotente y sin overselling |
| Administrador (UI) | ❌ No iniciada — Fase 7. **Consecuencia real: los pedidos creados solo se consultan con service role o desde el dashboard de Supabase** |
| Autenticación (UI, `proxy.ts`, sesión) | ❌ No iniciada — Fase 7. Solo la base de datos (`profiles`/`is_admin()`) existe |
| SEO técnico (metadata título/descripción/OG de producto) | ✅ Implementado (Fase 4, básico) — sitemap/robots/JSON-LD siguen pendientes (Fase 8) |
| Pagos online | 🔮 Futuro (Fase 11) — `CheckoutChannel` ya existe y funciona; solo falta `OnlinePaymentChannel` |

> Regla: "documentado" ≠ "implementado". Solo se marca ✅ lo que existe en código.

---

## Dependencias

### Instaladas

`next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8`, `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `typescript@^5`, `eslint@^9`, `eslint-config-next@16.3.3`, `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, `supabase@2.116.0` (CLI, devDependency, Fase 3 — necesaria para `db:*` scripts), tipos de React/Node.

Fase 4 no añadió dependencias nuevas (usa `@supabase/supabase-js` ya instalado desde Fase 1). **Fase 5 tampoco**: los tests corren con el runner nativo de Node (DEC-025), no con Vitest.

### Pendientes (instalar SOLO cuando su fase lo requiera)

Ninguna prevista. **Fase 6 tampoco instaló nada**: Zod se evaluó explícitamente y se descartó con justificación (DEC-029). Explícitamente **no instaladas** por decisión del usuario (filosofía minimum viable architecture): Zustand, Framer Motion, shadcn/ui, React Hook Form, Zod. Ver regla de dependencias en `/docs/rules/frontend.md`.

---

## Configuración pendiente conocida

- [x] ~~Validar TODO en vivo (Fases 3+4)~~ — **hecho en Fase 4.5** contra un proyecto Supabase real. Ver la tabla de verificación arriba.
- [x] ~~Proyecto Supabase real~~ — existe, enlazado y con el esquema aplicado.
- [ ] GitHub Secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — sin ellos CI falla en el preflight con mensaje explícito (DEC-021, `11-ENVIRONMENT.md` §4.1). **Único bloqueo externo pendiente.**
- [ ] Subir imágenes reales a los buckets `products`/`content` — siguen vacíos a propósito; `RemoteImage` cae a `MockImage` mientras tanto. Pipeline ya verificado.
- [ ] Endurecer los buckets: sin `file_size_limit` ni `allowed_mime_types` (ver `03-DATABASE.md` §4).
- [ ] `lib/supabase/admin.ts` (service role) — se crea cuando exista la primera necesidad real server-only (Fase 7).
- [x] ~~`types/database.types.ts`~~ — generado en Fase 4.5. **Regenerar con `npm run db:types` tras cada migración.**
- [ ] `proxy.ts` — Fase 7, admin.
- [x] ~~Runner de tests~~ — `npm test` con `node:test` desde Fase 5 (DEC-025), ya integrado en CI.
- [ ] Cobertura: `lib/cart/` ✅ (108 tests). `lib/money/format.ts` y `lib/data/*` siguen SIN tests. Componentes React y E2E se deciden en Fase 9.
- [ ] Recorrido manual en un navegador real de carrito Y checkout (sigue sin haber navegador automatizado en el entorno).
- [ ] Rate limiting del checkout: `create_order` es público y sin login, así que se pueden crear pedidos basura que consuman stock (Fase 10).
- [ ] Restauración de stock al cancelar un pedido (acción del admin, Fase 7).
- [ ] Assets de marca reales (logo, fotografías) — pendiente de Juan.
- [ ] Copy final aprobado — pendiente de Juan.
- [ ] Idioma único con textos centralizados — DEC-013 resuelta (español único), pero `lib/i18n/` sigue sin crearse; strings visibles marcados `TODO(i18n)`.
- [ ] `/categoria/[slug]` (listado real) — sigue sin existir; Home enlaza a un ancla, no a una página de categoría (Fase 4 solo pidió Home + ficha).

---

## Próximos pasos (según ROADMAP)

→ **FASE 7 — Administrador**: auth real (login/logout), `proxy.ts` + guard de layout, y panel para gestionar productos, categorías, promociones y **pedidos** (hoy solo visibles con service role). Incluye la acción de cancelar un pedido restaurando stock. Detalle: `05-ADMIN.md` y `10-ROADMAP.md`.

~~FASE 6 — Checkout por WhatsApp~~ (completada): `lib/checkout/` con la interfaz `CheckoutChannel` + `WhatsAppChannel` (DEC-007), Server Action que crea el pedido (order `pending` + items snapshot + customer upsert + decremento de stock con guard) y página de confirmación. **Punto de partida ya disponible:** `selectCheckoutItems()` del carrito devuelve exactamente `CheckoutInput.items`. **Requisito no negociable:** el servidor debe re-resolver precio y stock desde Supabase — el carrito del cliente es solo una propuesta. Detalle: `10-ROADMAP.md` y `06-WHATSAPP.md`.

---

## Historial de estados

| Fecha | Fase | Nota |
|---|---|---|
| 2026-08-26 | Fase 0 | Documentación y sistema de contexto completados |
| 2026-08-31 | Fase 1 | Cimientos técnicos: clientes Supabase (anon, sin admin), tokens YI, primitivos UI base, `.env.example`, CI mínimo (GitHub Actions). Cero funcionalidad de negocio. DEC-013/DEC-014 siguen abiertas sin bloquear. |
| 2026-08-31 | Fase 2 | Store shell + Home + ficha de producto navegables con datos mock. `components/store/` creado. `lib/mock/products.ts` (no es `lib/data/`). `lib/money/format.ts` adelantado (mínimo, justificado por regla de arquitectura). CTAs de compra deshabilitados a propósito. DEC-016 (mantener Geist). Cero Supabase/carrito/checkout/admin real. |
| 2026-08-31 | Fase 3 | DEC-013 (español único) y DEC-014 (ES mercado inicial) resueltas por Juan. Esquema completo (15 migraciones) + RLS + Storage buckets. Seed dev solo ES operativo (CO solo fila de `markets`, inactiva). DEC-019/DEC-020 resueltas. CLI `supabase` instalado + scripts `db:*`. **Sin Docker: migraciones/seed nunca ejecutados contra Postgres real.** La app seguía sirviendo `lib/mock/`. |
| 2026-08-31 | Fase 4 | Data layer real (`lib/markets.ts`, `lib/data/{categories,home,products}.ts`) conectando Home y `/producto/[slug]` a Supabase. `lib/mock/` eliminado. Nuevo `lib/supabase/static.ts` (bug real encontrado: `cookies()` no funciona dentro de `generateStaticParams`, corregido). `RemoteImage` (fallback a `MockImage`). `next.config.ts`: `images.remotePatterns` derivado de env. SEO básico (`generateMetadata` en ficha). `error.tsx` del segmento store. DEC-021 (mantener SSG/ISR pese a que rompe el build sin Supabase real — no se cambia arquitectura para ocultar la limitación). **`npm run build` falla en este entorno** (confirmado con y sin credenciales falsas: llega hasta el intento de red real y falla solo por falta de backend alcanzable) — `lint`/`tsc` sí pasan. CI necesitará secrets para pasar. Nada de esto se ha probado contra datos reales. |
| 2026-09-01 | Fase 4.5 | **Primera ejecución real de todo.** Proyecto Supabase real enlazado; 17 migraciones aplicadas y verificadas contra PostgreSQL 17.6; seed aplicado y hecho idempotente; `types/database.types.ts` generado y data layer re-tipada sin `any`/casts; RLS validado empíricamente con anon, authenticated sin rol y admin temporal (incluida escalada de privilegios denegada); Storage validado; **`npm run build` pasa por primera vez**; Home/ficha/404 verificadas sobre `next start`. 7 bugs reales corregidos (rutas de Storage, formato de precio, 404 en blanco, destacados vacíos, seed no idempotente, DEC-022 catálogo de mercado inactivo público, DEC-023 TRUNCATE para anon). Cero funcionalidad de negocio nueva. |
| 2026-09-01 | Fase 5 | Carrito local real: `lib/cart/` (reducer puro + storage versionado + context), `/carrito`, `AddToCartForm` (resuelve color+talla → variante), `VariantPicker` controlado, contador de unidades en Header/BottomNav, `QuantityStepper` genérico. Persistencia `yi-store:cart:v1` resistente a JSON corrupto y versión desconocida. DEC-024 (carrito de un solo mercado) y DEC-025 (runner `node:test`, cero dependencias). 108 tests + 20 comprobaciones HTTP; lint/tsc/build verdes. Bug corregido: cantidad enorme del storage caía a 1 en vez de recortarse. **Sin cambios en Supabase. Sin WhatsApp, sin pedidos, sin pagos, sin decremento de stock.** |
| 2026-09-01 | Fase 6 | **Primer checkout real.** Migración `0018`: función `create_order` (SECURITY DEFINER, una transacción) que resuelve precio/stock/nombre desde PostgreSQL, descuenta stock con guard atómico y crea order+items+event; `order_counters` (DEC-027) y `client_request_id`+fingerprint (DEC-028). `lib/checkout/` (dominio) y `lib/whatsapp/` (canal) separados; `getCheckoutChannel()` mantiene DEC-007. `/checkout` y `/pedido/[numero]`; CTA del carrito activado y `COMPRAR POR WHATSAPP` en la ficha. **Sin service_role, sin policies públicas de INSERT, sin dependencias nuevas** (Zod descartado, DEC-029). 227 tests (40 de integración con la anon key: precio manipulado, concurrencia real sobre la última unidad, idempotencia y retries). Contradicción doc↔esquema resuelta en DEC-030 (cliente obligatorio). BD devuelta al estado exacto del seed. |
