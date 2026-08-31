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

- [ ] `npm run lint` y `npx tsc --noEmit` pasan
- [ ] Documentación afectada actualizada
- [ ] `docs/context/CURRENT-STATE.md` actualizado si cambió el estado
- [ ] `docs/context/DECISIONS.md` actualizado si hubo decisión nueva
- [ ] Diff mínimo: solo cambios necesarios

## Estado del proyecto

FASE 4 completada como código (Home + ficha de producto conectadas a Supabase; mocks eliminados) — **sin validar contra datos reales, `npm run build` falla en este entorno sin Supabase real** (ver `docs/context/CURRENT-STATE.md`). Próxima: FASE 5 — Carrito. Detalle y progreso real: `docs/context/CURRENT-STATE.md` y `docs/10-ROADMAP.md`.

> AGENTS.md contiene un bloque gestionado por las herramientas de Next.js entre marcadores `BEGIN/END:nextjs-agent-rules`: no editarlo ni eliminarlo (origen verificado en `node_modules/next/dist/server/lib/generate-agent-files.js`). Detalles en `docs/context/AI-DEVELOPMENT.md` §4.