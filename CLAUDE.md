@AGENTS.md

# YI Store — Contrato de trabajo para agentes

Tienda e-commerce de ropa/calzado/accesorios (marca **YI**: naturaleza + ciudad + streetwear). Next.js **16** (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Supabase (Postgres + Auth + Storage). Mobile-first. Checkout v1 por WhatsApp con abstracción sustituible.

## Antes de cualquier tarea no trivial

1. Lee `docs/context/CURRENT-STATE.md` → fase y estado real.
2. Lee `docs/context/DECISIONS.md` → decisiones vigentes y abiertas.
3. Lee la documentación del área según el mapa de abajo.
4. Sigue el workflow completo: `docs/context/DEVELOPMENT-WORKFLOW.md`.
5. Protocolo detallado para agentes IA: `docs/context/AI-DEVELOPMENT.md`.

## Mapa de lectura por área

| Si trabajas en… | Lee primero | Reglas |
|---|---|---|
| Estructura/capas/caché | `docs/02-ARCHITECTURE.md` | `docs/rules/architecture.md` |
| Componentes/páginas/UI | `docs/04-UX-UI.md` + `docs/context/PROJECT-CONTEXT.md` | `docs/rules/frontend.md`, `docs/rules/ui.md` |
| Server Actions/datos | `docs/02-ARCHITECTURE.md` §4 | `docs/rules/backend.md` |
| Esquema/migraciones/RLS | `docs/03-DATABASE.md` + `docs/context/DOMAIN-MODEL.md` | `docs/rules/database.md` |
| Auth/admin/acceso | `docs/08-SECURITY.md` + `docs/05-ADMIN.md` | `docs/rules/security.md` |
| WhatsApp/checkout | `docs/06-WHATSAPP.md` | `docs/rules/backend.md` §WhatsApp |
| Mercados CO/ES | `docs/07-MULTI-MARKET.md` | — |
| SEO/performance | `docs/09-SEO-PERFORMANCE.md` | — |
| Entornos/deploy | `docs/11-ENVIRONMENT.md` | — |
| Producto/negocio | `docs/01-PRODUCT.md` | — |
| Planificación | `docs/10-ROADMAP.md` | — |

Restricciones transversales: `docs/context/KNOWN-CONSTRAINTS.md`. Historial: `docs/context/CHANGELOG.md`.

## Reglas que NUNCA se rompen

1. **Next.js 16 real**: request APIs async (`await params/searchParams/cookies()`), type helpers `PageProps`/`LayoutProps`, `proxy.ts` (NO middleware), Turbopack. Duda de API → `node_modules/next/dist/docs/`, nunca tutoriales antiguos.
2. **RLS en toda tabla** desde su migración; tablas de pedidos/clientes sin lectura pública.
3. **Service role key solo en servidor** (`lib/supabase/admin.ts`, server-only).
4. **No hardcodear**: WhatsApp number (vive en BD settings), precios (en variantes), strings de UI (módulo i18n), mercado (env).
5. **Checkout desacoplado**: UI consume `CheckoutChannel`; WhatsApp es una implementación, no una dependencia.
6. **Server Components por defecto**; `'use client'` solo donde hay interactividad.
7. **Acceso a datos centralizado** en `lib/data/`; componentes no llaman a Supabase.
8. **Sin dependencias nuevas** sin justificación explícita y registro.
9. **No inventar datos comerciales** (precios, productos, copy): usar `[PENDIENTE]`.
10. **Rojo solo estratégico**: CTA primario, precio, badges, estado activo.

## Al terminar cada tarea

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` pasan
- [ ] Documentación afectada actualizada
- [ ] `docs/context/CURRENT-STATE.md` actualizado si cambió el estado
- [ ] `docs/context/DECISIONS.md` actualizado si hubo decisión nueva
- [ ] Diff mínimo: solo cambios necesarios

## Estado del proyecto

FASE 9 completada salvo la auditoría CWV: la tienda **se puede operar, llenar e indexar**. Fase 7 dio auth de admin y el panel de pedidos; Fase 8 el CMS; Fase 9 el SEO (`robots.ts`, `sitemap.ts`, metadata canónica, Open Graph, JSON-LD), el placeholder blur generado en servidor y una **matriz de invalidación medida**. `npm run lint`, `npx tsc --noEmit`, `npm test` (438) y `npm run build` pasan.

**NO implementado todavía** (no confundir con hecho): promociones, imágenes de home/logo, reset de contraseña, `lib/i18n/`, invalidación por tags, `/categoria/[slug]`, redirect 301 al cambiar slug, CSP/HSTS y el backfill del blur de las 4 imágenes del seed. **Los Core Web Vitals NO están medidos: no hay navegador en este entorno.** Detalle exacto: `docs/context/CURRENT-STATE.md` y `docs/10-ROADMAP.md`.

> **Checkout (Fase 6): el cliente NUNCA es autoridad de precio ni de stock.** El pedido lo crea `public.create_order` (migración `0018`), no `service_role`. Antes de tocar nada del checkout, lee `docs/context/AI-DEVELOPMENT.md` §10.

> **Admin (Fase 7): proxy = mantener la sesión viva · layout = quién eres · Server Action = qué puedes · RLS = lo impide aunque todo lo anterior falle.** `proxy.ts` NO comprueba el rol y no debe hacerlo. En RSC el layout no impide que la página hermana se renderice, así que **cada función de `lib/data/admin/` lleva su propio `requireAdmin()`**. La máquina de estados del pedido vive en `public.admin_update_order_status` (migración `0019`), no en TypeScript. Antes de tocar el panel, lee `docs/context/AI-DEVELOPMENT.md` §11 y §12.

> **CMS (Fase 8): `market_id` nunca viene del formulario, y RLS solo deja escribir en mercados ACTIVOS (DEC-035).** Las imágenes se validan por **magic bytes** —no por `File.type` ni por `allowed_mime_types`, que confían en el cliente— y `sharp` las re-codifica a WebP: un objeto por foto, ×13,2 menos espacio (DEC-036). **La invalidación se hace por RUTA LITERAL**: el patrón `'/producto/[slug]'` no invalida nada y dejaba comprables productos despublicados (DEC-037). Antes de tocar el CMS, lee `docs/context/AI-DEVELOPMENT.md` §13.

> **SEO y caché (Fase 9): la invalidación tiene una MATRIZ, y vive en la cabecera de `lib/admin/revalidate.ts` (DEC-041).** Ficha concreta → ruta literal; algo global (categorías, ajustes) → `revalidatePath('/', 'layout')`; toda mutación de producto invalida además `/sitemap.xml`. **Prohibido `revalidatePath` con un patrón `[segmento]`**: no invalida lo prerenderizado, y hay un test que lo comprueba en todo el repositorio. El sitemap y el breadcrumb solo describen rutas que EXISTEN (DEC-039). El `blur_data_url` lo genera SIEMPRE el servidor, nunca el navegador (DEC-040). `robots.txt` **no es seguridad**. Antes de tocar SEO o caché, lee `docs/context/AI-DEVELOPMENT.md` §14.

> Tras cualquier migración nueva: `npm run db:push` y **regenerar `types/database.types.ts` con `npm run db:types`** (los tipos generados son la fuente de verdad del data layer; no re-declarar tipos de fila a mano).

> AGENTS.md contiene un bloque gestionado por las herramientas de Next.js entre marcadores `BEGIN/END:nextjs-agent-rules`: no editarlo ni eliminarlo (origen verificado en `node_modules/next/dist/server/lib/generate-agent-files.js`). Detalles en `docs/context/AI-DEVELOPMENT.md` §4.