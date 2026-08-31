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
| `/carrito` | Dinámica (client) | Estado local del usuario |
| `/admin/**` | Dinámica siempre (`export const dynamic = 'force-dynamic'`) | Datos en tiempo real |

Invalidación desde el admin (Server Actions):
- Cambios de productos/categorías → `revalidateTag('catalog', 'max')`.
- Cambios que deben verse al instante en la pantalla actual → `updateTag(...)`.
- Tags previstos: `catalog`, `home`, `settings`, `orders`.

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
Admin UI (client) → Server Action ('use server') → valida sesión+rol → valida input
   → supabase (service role o client autenticado) → revalidateTag/updateTag → refresh()
```
- Mutaciones SOLO vía Server Actions (no route handlers para CRUD interno).
- Validación de entrada manual con TypeScript (sin zod hasta justificarlo).

### Cliente interactivo
- Carrito: React Context + reducer + `localStorage` (DEC-005). Lógica pura testeable en `lib/cart/`.
- Selectores de variante: estado local del componente cliente.

---

## 5. Autenticación y sesiones (resumen; detalle en 08-SECURITY)

- `@supabase/ssr` con cookies httpOnly; clientes separados:
  - `lib/supabase/server.ts` — componentes/actions con sesión (cookies async). **Sin uso todavía** (Fase 4 no tiene Server Actions ni auth; se activa en Fases 6-7).
  - `lib/supabase/browser.ts` — interacciones client-side.
  - `lib/supabase/static.ts` *(Fase 4, no estaba en el plan original)* — `@supabase/supabase-js` plano, sin cookies. Usado por `lib/markets.ts` y `lib/data/*` para lecturas públicas anónimas. Necesario porque `generateStaticParams` corre en build-time sin request/cookies — `server.ts` lanza error ahí (`cookies()` fuera de contexto de request). RLS sigue siendo la autoridad; estas queries nunca necesitan `auth.uid()`.
  - `lib/supabase/admin.ts` — service role, SOLO importable desde servidor. Sigue sin existir.
- `proxy.ts`: redirige a `/admin/login` si no hay cookie de sesión en `/admin/**` (optimista).
- `app/admin/layout.tsx`: verificación REAL con `getUser()` (valida token contra Supabase) + rol admin.

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
| Imágenes pesadas de catálogo | next/image + tamaños responsive + prioridad solo above-the-fold (09) |