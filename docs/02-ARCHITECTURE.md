# 02 — ARCHITECTURE: Arquitectura técnica de YI Store

> Cómo está construido y por qué. Compatible con Next.js **16.3.3** real instalado. Decisiones de alto nivel en `docs/context/DECISIONS.md`.

---

## 1. Visión general

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 16 (App Router)               │
│                                                          │
│  app/(store)/          app/admin/          app/api/      │
│  Tienda pública        Panel privado       Mínimo        │
│                                                          │
│  components/ui · components/store · components/admin     │
│                                                          │
│  lib/data (queries)   lib/checkout   lib/cart            │
│  lib/supabase         lib/money      lib/i18n            │
└──────────────┬───────────────────────────┬───────────────┘
               │ anon key + RLS            │ service role (solo server)
               ▼                           ▼
        ┌──────────────────────────────────────┐
        │              Supabase                │
        │  PostgreSQL (RLS) · Auth · Storage   │
        └──────────────────────────────────────┘
```

Principios: simplicidad > cleverness · Server Components por defecto · acceso a datos centralizado · seguridad en la BD (RLS), no en el frontend.

---

## 2. Estructura de carpetas objetivo

```
store_ropa/
├── app/
│   ├── layout.tsx                 # Layout raíz: fuentes, metadata base
│   ├── globals.css                # Tailwind 4 + tokens @theme del design system
│   ├── page.tsx                   # → se convertirá en redirect a /(store)
│   ├── robots.ts                  # robots.txt (Fase 9) — NO es control de acceso
│   ├── sitemap.ts                 # sitemap.xml (Fase 9): home + fichas publicadas
│   ├── opengraph-image.tsx        # OG de la home, generada con next/og (Fase 9)
│   ├── (store)/                   # ROUTE GROUP público (comparte layout de tienda)
│   │   ├── layout.tsx             # Header + bottom nav móvil + footer
│   │   ├── page.tsx               # Home
│   │   ├── producto/[slug]/page.tsx
│   │   ├── categoria/[slug]/page.tsx
│   │   └── carrito/page.tsx
│   ├── admin/
│   │   ├── layout.tsx             # Guard real de sesión + shell admin
│   │   ├── login/page.tsx         # Fuera del guard (route group propio si hace falta)
│   │   ├── page.tsx               # Dashboard resumen
│   │   ├── productos/…            # lista / nuevo / [id]
│   │   ├── categorias/…
│   │   ├── promociones/…
│   │   ├── pedidos/…              # lista / [id]
│   │   ├── home/                  # editor HomeContent
│   │   └── ajustes/page.tsx
│   └── api/                       # Solo lo imprescindible (webhooks futuros)
├── components/
│   ├── ui/                        # Design system puro (Button, Badge, PriceTag…)
│   ├── store/                     # Compuestos de tienda (ProductCard, VariantPicker…)
│   └── admin/                     # Compuestos del panel
├── lib/
│   ├── seo/                       # urls.ts + json-ld.ts (puros, Fase 9)
│   ├── supabase/                  # clients: server.ts (cookies, sesión), browser.ts,
│   │                              # static.ts (sin cookies, lecturas públicas — Fase 4),
│   │                              # admin.ts (service role, pendiente)
│   ├── data/                      # TODAS las queries: products.ts, categories.ts, settings.ts, orders.ts…
│   ├── checkout/                  # CheckoutChannel interface + WhatsAppChannel
│   ├── cart/                      # contexto, reducer, persistencia localStorage
│   ├── money/                     # formateo por moneda/locale
│   └── i18n/                      # strings centralizados por locale (DEC-013)
├── types/                         # Tipos TS derivados del esquema (Database → tipos de dominio)
├── supabase/
│   ├── migrations/                # SQL versionado (única vía de cambio de esquema)
│   └── seed/                      # Datos iniciales (mercados, tallas, colores)
├── proxy.ts                       # Check optimista de sesión para /admin (Fase 7)
├── docs/                          # Este sistema documental
└── public/
```

Reglas de dependencia entre capas (sin excepciones):

```
app/* → components/* → lib/* → supabase
(app nunca importa supabase directamente; siempre vía lib/data o server actions)
components/ui no importa nada de negocio (componentes puros)
```

---

## 3. Estrategia de renderizado (modelo clásico, sin Cache Components — DEC-004)

| Ruta | Estrategia | Justificación |
|---|---|---|
| `/` Home | Estática con `revalidate = 300` | Contenido editable; refresco ≤5 min aceptable |
| `/categoria/[slug]` | `generateStaticParams` + `revalidate = 300` | Catálogo pequeño; ISR |
| `/producto/[slug]` | `generateStaticParams` + `revalidate = 300` | SEO crítico; stock fresco suficiente |
| `/robots.txt`, `/sitemap.xml` | Route Handlers cacheados por Next | El sitemap se invalida en cada mutación de producto (DEC-041) |
| `/opengraph-image` | Estática, generada en build con `next/og` | Sin dependencias nuevas: `next/og` viene en Next 16 |
| `/checkout` | Shell estático + cuerpo client | Depende del carrito (localStorage). La mutación va por Server Action (Fase 6) |
| `/pedido/[numero]` | Dinámica | Solo valida el formato del número; **no consulta la BD** (DEC-027: los números son adivinables) |
| `/carrito` | Shell estático + cuerpo client | El estado vive en localStorage: el servidor no puede conocerlo. La página se prerenderiza vacía (título y layout) y `CartContents` la rellena tras hidratar (Fase 5) |
| `/admin/**` | Dinámica siempre (`export const dynamic = 'force-dynamic'`) | Datos en tiempo real |

Invalidación desde el admin — **matriz completa en la cabecera de `lib/admin/revalidate.ts`** (DEC-041):

| Mutación | Se invalida |
|---|---|
| Producto: editar / publicar / retirar / archivar / borrar | `/producto/<slug>` + `/` + `/sitemap.xml` (si cambia el slug, también la ficha ANTIGUA) |
| Variante: precio / stock / activa | igual que arriba |
| Imagen: añadir / borrar / principal / orden | igual que arriba |
| Categoría: crear / editar / borrar / activar / parent | `revalidatePath('/', 'layout')` + sitemap |
| Ajustes: nombre / email / redes | `revalidatePath('/', 'layout')` + sitemap |
| Ajustes: número de WhatsApp | `/checkout` — aunque el número **no viaja en ningún HTML**: lo lee `getCheckoutChannel()` dentro de la Server Action, que no se cachea |
| Home: bloque editar / activar / orden | `/` |
| Pedido cancelado (devuelve stock) | los slugs REALES de sus líneas, uno a uno, + `/` |

- **Ruta LITERAL, nunca patrón** (DEC-037). Medido: `revalidatePath('/producto/[slug]', 'page')` **no** invalida lo que `generateStaticParams` prerenderizó, así que un producto retirado seguía comprándose. Un test estático impide reintroducirlo.
- **`revalidatePath('/', 'layout')` para lo global.** Medido tres veces sobre el build servido: tras borrar una categoría, `/` y `/producto/<slug>` responden `MISS` y ya no la muestran. Esto **cierra** la deuda que Fase 8 dejó abierta como "un cambio de categorías no invalida las fichas ya generadas": sí las invalida.
- **El sitemap es un Route Handler cacheado** y se invalida con cada mutación de producto; sin eso, un producto retirado seguiría anunciado a Google con su ficha ya en 404.
- Tags previstos (`catalog`, `home`, `settings`, `orders`): **siguen sin implementar** y no hacen falta hoy — el data layer usa el cliente de Supabase, no `fetch` etiquetado, y las rutas afectadas se conocen exactamente en cada mutación.
- El panel no necesita invalidarse: es `force-dynamic`.

> Nota Next.js 16: `revalidateTag(tag, perfil)` exige segundo argumento; `updateTag()` da semántica read-your-writes dentro de Server Actions.

---

## 4. Flujo de datos

### Lectura (público)
```
Server Component → lib/data/products.getFeatured(market) → supabase (anon) → RLS filtra → UI
```
- Componentes NUNCA llaman a Supabase directamente.
- Toda query recibe/filtra por el mercado activo (`getActiveMarket()`).

### Escritura (admin)
```
Admin UI (client) → Server Action ('use server') → requireAdmin() → valida input
   → supabase (cliente AUTENTICADO, nunca service role) → revalidatePath()
```
- Mutaciones SOLO vía Server Actions (no route handlers para CRUD interno).
- Validación de entrada manual con TypeScript (sin zod hasta justificarlo, DEC-029).
- **Sin service role** (DEC-034): el admin autenticado ya tiene sus policies, así que RLS sigue filtrando. `lib/supabase/admin.ts` sigue sin existir.
- Las mutaciones actualizan **columnas concretas**, nunca un objeto que venga del cliente: `market_id`, ids, `sku`, `color_id` y `size_id` no son editables desde el panel.
- Lo que debe ser atómico (estado de pedido + evento + stock) vive en una función SQL, no en TypeScript (DEC-032).

### Lectura (admin)
```
Server Component → lib/data/admin/* → requireAdmin() → supabase (sesión) → RLS filtra → UI
```
- `requireAdmin()` **en cada función**, no solo en el layout: en RSC el layout no impide que la página hermana se renderice (DEC-034).
- Toda consulta filtra por `market_id`: las policies de admin no lo hacen (un admin lo ve todo), así que es responsabilidad del código.

### Cliente interactivo
- Carrito: React Context + reducer + `localStorage` (DEC-005). Lógica pura testeable en `lib/cart/`.
- Selectores de variante: estado local del componente cliente.

---

## 5. Autenticación y sesiones (resumen; detalle en 08-SECURITY)

- `@supabase/ssr` con cookies de sesión. **`httpOnly` lo fuerza este proyecto**, no la librería: sus `DEFAULT_COOKIE_OPTIONS` traen `httpOnly: false` y no marcan `Secure`. `lib/supabase/cookies.ts` (Fase 7) los añade y lo aplican `server.ts` y `proxy.ts` — ver DEC-031 y `08-SECURITY.md` §2. Clientes separados:
  - `lib/supabase/server.ts` — componentes/actions con sesión (cookies async). **En uso desde Fase 7** (panel admin).
  - `lib/supabase/proxy.ts` *(Fase 7)* — cliente sobre `NextRequest` para renovar la sesión dentro de `proxy.ts`; es el único sitio del request donde las cookies renovadas pueden persistirse.
  - `lib/supabase/browser.ts` — interacciones client-side. **Sigue sin consumidor**: el panel es 100% server-side, y eso es lo que permite el `httpOnly`.
  - `lib/supabase/static.ts` *(Fase 4, no estaba en el plan original)* — `@supabase/supabase-js` plano, sin cookies. Usado por `lib/markets.ts` y `lib/data/*` para lecturas públicas anónimas. Necesario porque `generateStaticParams` corre en build-time sin request/cookies — `server.ts` lanza error ahí (`cookies()` fuera de contexto de request). RLS sigue siendo la autoridad; estas queries nunca necesitan `auth.uid()`.
  - `lib/supabase/admin.ts` — service role, SOLO importable desde servidor. **Sigue sin existir** tras la Fase 8: tampoco el CMS lo necesita (DEC-034).
  - `lib/storage/product-images.ts` *(Fase 8)* — subida y borrado en Storage con `sharp`. **Solo servidor**: módulo nativo, nunca en un bundle cliente (verificado: 0 ocurrencias en `.next/static`).
- `proxy.ts` (matcher `/admin/:path*`): **mantiene la sesión viva** (refresca el token y escribe las cookies) y, de paso, redirige a `/admin/login` si no hay sesión. **No comprueba el rol** (DEC-031).
- `app/admin/(panel)/layout.tsx`: verificación REAL con `getUser()` (valida el token contra Supabase) + `is_admin()`. El route group `(auth)` deja `/admin/login` fuera del guard sin cambiar la URL.
- `lib/admin/auth.ts` — `getAdminAccess()` (DAL cacheado por request) y `requireAdmin()`, obligatorio en toda Server Action administrativa.

---

## 6. Gestión de errores y estados

- `error.tsx` por segmento raíz de store y admin (mensaje genérico + retry).
- `not-found.tsx` personalizado con estética YI.
- Estados obligatorios en todo listado/detalle: loading (skeleton), vacío, error.
- Errores de Server Actions: devueltos tipados al formulario (nunca throw genérico al cliente).

---

## 7. Decisiones técnicas clave (índice)

| Tema | Decisión | ADR |
|---|---|---|
| Framework | Next.js 16 App Router | DEC-001 |
| Backend | Supabase único | DEC-002 |
| Estilos | Tailwind 4 + tokens @theme | DEC-003 |
| Caché | Modelo clásico, sin Cache Components | DEC-004 |
| Carrito | Local (Context + localStorage) | DEC-005 |
| Checkout | Abstracción CheckoutChannel | DEC-007 |
| Mercados | Una base de código, dimensión market | DEC-008 |
| Seguridad | RLS obligatorio | DEC-009 |
| Tema | Light only v1 | DEC-010 |
| Estructura | Sin src/, alias @/* | DEC-012 |

---

## 8. Riesgos técnicos conocidos

| Riesgo | Mitigación |
|---|---|
| Next.js 16 muy reciente: docs de internet desactualizadas | Consultar SIEMPRE `node_modules/next/dist/docs/` |
| Turbopack cambia comportamiento de builds | Mantener config mínima; validar build en CI temprano (Fase 10) |
| Stock desincronizado entre carrito local y BD | Re-validación server-side al registrar pedido; snapshot de precio |
| Imágenes pesadas de catálogo | next/image + `sizes` por contexto + `priority` SOLO en la foto principal de la ficha + placeholder blur generado en servidor (DEC-040) |