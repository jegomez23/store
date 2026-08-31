# YI Store

Tienda online de **ropa, calzado y accesorios** para la marca **YI** — naturaleza + ciudad + streetwear + juventud. *"Vive a tu propio ritmo."*

La v1 vende con fricción mínima: catálogo visual → selección de variante → carrito → **compra por WhatsApp**, con arquitectura preparada para pagos online sin reescritura.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · Turbopack |
| Lenguaje | TypeScript (strict) |
| Estilos | Tailwind CSS 4 (tokens `@theme`) |
| Backend | Supabase — PostgreSQL (RLS) · Auth · Storage |
| Deploy | Vercel (un proyecto por mercado: CO / ES) |

---

## Getting Started

```bash
npm install
cp .env.example .env.local   # rellenar credenciales (ver docs/11-ENVIRONMENT.md)
npm run dev                  # http://localhost:3000
```

Validaciones: `npm run lint` · `npx tsc --noEmit`

Requisitos: Node.js ≥ 20.9.

---

## Project Structure

```
app/          Rutas (App Router): tienda pública + /admin
components/   ui/ (design system) · store/ · admin/
lib/          supabase/ · data/ · checkout/ · cart/ · money/ · i18n/
types/        Tipos TS del dominio
supabase/     migrations/ · seed/
docs/         Documentación y sistema de contexto
proxy.ts      Guard optimista de /admin (Next 16)
```

Detalle completo: [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md).

---

## Architecture

Resumen ejecutivo:

- **Server Components por defecto**; client solo donde hay interactividad.
- **Acceso a datos centralizado** en `lib/data/`; mutaciones solo vía Server Actions.
- **Seguridad en la base de datos**: RLS en todas las tablas; el frontend nunca es la barrera.
- **Checkout desacoplado**: interfaz `CheckoutChannel` con implementación WhatsApp hoy y pago online mañana.
- **Multi-mercado por diseño**: una base de código, dimensión `market` en datos + config por deploy.
- Modelo clásico de caché (ISR + tags); Cache Components de Next 16 desactivado en v1.

Decisiones y justificaciones: [`docs/context/DECISIONS.md`](docs/context/DECISIONS.md).

---

## Documentation

| # | Documento | Contenido |
|---|---|---|
| 01 | [PRODUCT](docs/01-PRODUCT.md) | Producto, catálogo, reglas comerciales |
| 02 | [ARCHITECTURE](docs/02-ARCHITECTURE.md) | Estructura, capas, renderizado, caché |
| 03 | [DATABASE](docs/03-DATABASE.md) | Esquema propuesto, índices, storage |
| 04 | [UX-UI](docs/04-UX-UI.md) | Design system, flujos, responsive |
| 05 | [ADMIN](docs/05-ADMIN.md) | Panel de administración |
| 06 | [WHATSAPP](docs/06-WHATSAPP.md) | Flujo de compra y plantillas |
| 07 | [MULTI-MARKET](docs/07-MULTI-MARKET.md) | Estrategia Colombia/España |
| 08 | [SECURITY](docs/08-SECURITY.md) | Auth, roles, RLS |
| 09 | [SEO-PERFORMANCE](docs/09-SEO-PERFORMANCE.md) | Metadata, imágenes, CWV |
| 10 | [ROADMAP](docs/10-ROADMAP.md) | Fases ejecutables |
| 11 | [ENVIRONMENT](docs/11-ENVIRONMENT.md) | Variables de entorno, ambientes |

---

## Context System

Este repositorio incluye un **sistema de contexto para agentes IA** (Claude Code, Cline…): cualquier agente puede trabajar sin depender de conversaciones previas.

```
CLAUDE.md                    ← contrato de trabajo + mapa de contexto
docs/context/CURRENT-STATE   ← ¿dónde estamos? (se actualiza cada fase)
docs/context/DECISIONS       ← ADRs: qué decidimos y por qué
docs/context/PROJECT-CONTEXT ← identidad YI
docs/context/DOMAIN-MODEL    ← entidades y reglas de negocio
docs/context/DEVELOPMENT-WORKFLOW ← workflow obligatorio
docs/context/KNOWN-CONSTRAINTS    ← lo que no se puede hacer
docs/context/AI-DEVELOPMENT  ← protocolo para agentes
docs/rules/*                 ← reglas por área al codificar
```

Protocolo completo: [`docs/context/AI-DEVELOPMENT.md`](docs/context/AI-DEVELOPMENT.md).

---

## Development Workflow

Toda tarea sigue: leer contexto → planificar → cambio mínimo → lint + typecheck → actualizar documentación y estado. Detalle: [`docs/context/DEVELOPMENT-WORKFLOW.md`](docs/context/DEVELOPMENT-WORKFLOW.md).

---

## Environment Variables

Plantilla y reglas: [`docs/11-ENVIRONMENT.md`](docs/11-ENVIRONMENT.md). Resumen:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # SOLO servidor
NEXT_PUBLIC_MARKET=CO           # 'CO' | 'ES'
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Roadmap

Fases 0–12 con criterios de aceptación: [`docs/10-ROADMAP.md`](docs/10-ROADMAP.md).

- ✅ **Fase 0** — Arquitectura y documentación
- ⬜ Fase 1 — Base del proyecto · Fase 2 — Design System · Fase 3 — Supabase + Seguridad
- ⬜ Fase 4 — Catálogo · Fase 5 — Carrito · Fase 6 — WhatsApp Checkout
- ⬜ Fase 7 — Administrador · Fase 8 — SEO/Performance · Fase 9 — Testing · Fase 10 — Deploy
- 🔮 Fase 11 — Pagos online · Fase 12 — Expansión

---

## Current Status

**FASE 0 completada**: sistema de contexto y documentación creados; sin funcionalidades implementadas aún. Estado exacto y actualizado: [`docs/context/CURRENT-STATE.md`](docs/context/CURRENT-STATE.md).