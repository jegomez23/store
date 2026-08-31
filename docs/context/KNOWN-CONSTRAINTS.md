# KNOWN-CONSTRAINTS — Restricciones del proyecto

> Límites fijos que ningún agente puede violar. Si una tarea parece requerir romper una restricción, detente y propón la excepción al usuario antes de implementar.

---

## TÉCNICAS

| Restricción | Detalle |
|---|---|
| Next.js 16 | APIs de request **siempre async**: `await params`, `await searchParams`, `await cookies()`, `await headers()` |
| Proxy, no middleware | `proxy.ts` en raíz (runtime Node.js). El archivo `middleware.ts` está deprecado |
| Type helpers | Usar `PageProps<'/ruta'>`, `LayoutProps<"/">`, `RouteContext` (generados por `next typegen`) |
| Turbopack | Bundler por defecto en dev y build. Sin configs webpack |
| Supabase | Único backend. Clientes: anon key (cliente/servidor) + service role (SOLO servidor) |
| Tailwind 4 | Tokens vía `@theme` en `globals.css`. Sin dark mode en v1 (DEC-010) |
| TypeScript strict | Sin `any` implícito; tipos derivados del esquema en `types/` |
| Node.js ≥ 20.9 | Requisito mínimo de Next.js 16 |
| Imágenes | `next/image` siempre; dominios externos solo vía `images.remotePatterns`; qualities `[75]` por defecto |
| Cache Components | Desactivado en v1 (DEC-004). Modelo clásico de render/caché |

---

## NEGOCIO

| Restricción | Detalle |
|---|---|
| WhatsApp cierra la venta en v1 | No hay checkout automatizado hasta Fase 11+ |
| Pedido ≠ pagado | Un pedido de WhatsApp nace `pending`; `paid` SOLO lo marca un admin tras confirmación real |
| Stock por variante | Nunca stock agregado a nivel producto |
| Multi-mercado real | CO y ES pueden diferir en moneda, precio, disponibilidad, WhatsApp, envíos. Todo acotado por `market_id` |
| Sin datos inventados | Precios, productos y copy definitivos los aporta Juan; usar placeholders `[PENDIENTE]` |
| Promociones con código | En v1 sin campo de canje en compra: validación manual por WhatsApp o promoción automática visible (pendiente decisión humana) |

---

## UX

| Restricción | Detalle |
|---|---|
| Mobile-first | Diseñar primero para móvil; desktop adapta (no al revés) |
| Mínimos pasos | Compra alcanzable en el menor número posible de interacciones |
| Sin sobrecarga | No popups invasivos, no info redundante, no animaciones excesivas |
| CTA único primario | Una sola acción principal por pantalla; rojo reservado a ella |
| Fotos protagonistas | La imagen vende; texto mínimo alrededor |
| Animaciones sutiles | Solo si aportan claridad; nunca bloquean lectura ni interacción |

---

## ARQUITECTURA

| Restricción | Detalle |
|---|---|
| No duplicar apps por mercado | Una base de código; mercado = dimensión de datos + config (DEC-008) |
| No hardcodear WhatsApp | Número vive en `settings` (BD), consumido vía capa de datos |
| No hardcodear precios | Precio vive en variante (BD); UI muestra snapshot calculado |
| No secretos en cliente | Service role key y claves sensibles jamás en componentes client ni `NEXT_PUBLIC_*` |
| No saltarse RLS | Toda tabla con RLS activa desde su migración (DEC-009) |
| Checkout sustituible | UI consume `CheckoutChannel`, nunca lógica de WhatsApp directa (DEC-007) |
| Server Components por defecto | `'use client'` solo cuando haya interactividad real |
| Acceso a datos centralizado | Las queries viven en `lib/data/`; componentes no llaman a Supabase directamente |
| Textos centralizados | Strings de UI en módulo de mensajes, no inline (DEC-013, Proposed) |

---

## Operativas

| Restricción | Detalle |
|---|---|
| Dependencias mínimas | Nueva dependencia = justificación explícita + registro (ver `/docs/rules/frontend.md`) |
| Migraciones versionadas | Cambios de esquema SOLO vía archivos SQL de migración en `supabase/migrations/` |
| Docs sincronizadas | Cambio de schema/comportamiento → actualizar doc correspondiente en la misma tarea |