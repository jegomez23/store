# 10 — ROADMAP: Fases ejecutables

> Cada fase es pequeña y comprobable. Estados: ✅ COMPLETADO · 🔄 EN PROGRESO · ⬜ PENDIENTE · 🔮 FUTURO.
> Regla: documentar una funcionalidad NO la marca completada; solo el código existente y validado lo hace.

---

## FASE 0 — Arquitectura y documentación ✅ COMPLETADO

**Objetivo:** base de conocimiento navegable para humanos y agentes IA.
**Tareas:** análisis del repo · sistema de contexto (`docs/context/`) · docs 01–11 · reglas por área · CLAUDE.md + README.
**Dependencias:** ninguna.
**Entregable:** este sistema documental.
**Criterios de aceptación:**
- [x] 26 archivos creados (11 docs + 8 contexto + 7 reglas) y coherentes entre sí
- [x] CLAUDE.md breve (< 120 líneas) y accionable
- [x] CURRENT-STATE refleja estado real
- [x] Decisiones registradas con ADRs (Accepted/Proposed)
- [x] Lint y typecheck pasan sin cambios de código
- [x] Cero funcionalidades implementadas

---

## FASE 1 — Base del proyecto ⬜ PENDIENTE

**Objetivo:** cimientos técnicos sin UI de negocio.
**Tareas:**
1. Estructura de carpetas (`lib/`, `components/`, `types/`, `supabase/`) según `02-ARCHITECTURE.md`.
2. Instalar `@supabase/supabase-js` + `@supabase/ssr` *(única instalación prevista)*.
3. Clientes Supabase (`server.ts`, `browser.ts`, `admin.ts` server-only).
4. `lib/markets.ts` (resolución mercado activo) + `lib/money/` (formateo COP/EUR).
5. Tokens de diseño en `globals.css` (`@theme`) según `04-UX-UI.md`.
6. Layout raíz YI (fuentes, metadata base con metadataBase) + limpieza del boilerplate.
7. Plantilla `.env.example` + carga en `11-ENVIRONMENT.md`.
8. Tipos base TS (`types/`) alineados a `03-DATABASE.md`.
**Dependencias:** Fase 0.
**Entregable:** app arranca limpia con tokens y utilidades core; lint/tsc verdes.
**Aceptación:** home placeholder con estética YI básica · formateo monetario testeable manualmente · ningún secreto en cliente.

---

## FASE 2 — Design System ⬜ PENDIENTE

**Objetivo:** componentes UI reutilizables con datos mock.
**Tareas:** componentes de `04-UX-UI.md` §3 (Button, Badge, PriceTag, ProductCard, VariantPicker, QuantityStepper, inputs, Sheet/Drawer, Skeleton, Toast, EmptyState) · iconos SVG propios · layout móvil (header/bottom nav/drawer) y adaptación desktop · página playground interna `/design` (no indexada).
**Dependencias:** Fase 1.
**Entregable:** kit visual completo usable por fases siguientes.
**Aceptación:** todos los componentes responsive mobile-first · estados loading/vacío/error definidos · accesibilidad mínima cumplida · cero dependencias nuevas.

---

## FASE 3 — Supabase + Seguridad ⬜ PENDIENTE

**Objetivo:** esquema real protegido.
**Tareas:** crear proyectos Supabase (dev) · migraciones completas de `03-DATABASE.md` · RLS según `08-SECURITY.md` · buckets Storage + policies · seed (mercados CO/ES, colores, tallas) · trigger updated_at · validación de políticas con usuarios anon/admin de prueba.
**Dependencias:** Fase 1 (clientes). Decisión humana previa: DEC-014 (mercado inicial) y pendientes §6 de DATABASE.
**Entregable:** BD versionada en `supabase/migrations/`, reproducible desde cero.
**Aceptación:** anon NO lee pedidos/clientes NI escribe nada · admin CRUD completo vía SQL con RLS activa · migraciones aplican limpias en proyecto fresco.

---

## FASE 4 — Catálogo ⬜ PENDIENTE

**Objetivo:** tienda legible conectada a BD real.
**Tareas:** capa `lib/data/` (products, categories, settings) · Home (hero desde home_content, destacados, nuevos, promos) · listado categoría con orden básico · ficha producto (galería, variantes, precio, disponibilidad, envío, materiales) · generateStaticParams + revalidate=300 · metadata por página · estados vacío/error.
**Dependencias:** Fases 2–3.
**Entregable:** navegación completa de lectura con datos reales.
**Aceptación:** recorrer home→categoría→producto sin dead-ends · precios formateados por mercado · agotados visibles no comprables · Lighthouse ≥ 90 móvil.

---

## FASE 5 — Carrito ⬜ PENDIENTE

**Objetivo:** carrito local robusto.
**Tareas:** `lib/cart/` (contexto+reducer+persistencia) · drawer carrito + página `/carrito` · stepper cantidades con tope de stock · snapshot de precio/nombre · badge contador header · eliminar ítem · subtotal.
**Dependencias:** Fase 4.
**Entregable:** carrito funcional persistente entre recargas.
**Aceptación:** sobrevive refresh/navegación · respeta stock máximo · cálculos correctos con descuentos visuales · accesible por teclado.

---

## FASE 6 — WhatsApp Checkout ⬜ PENDIENTE

**Objetivo:** cierre de venta v1 completo.
**Tareas:** interfaz `CheckoutChannel` + factory · Server Action de generación de pedido (transacción: order pending + items snapshot + customer upsert + decremento stock con guard) · `WhatsAppChannel` (mensaje según plantillas de `06-WHATSAPP.md` + wa.me) · CTA en ficha y carrito · página confirmación `/pedido/[numero]` · manejo errores tipados.
**Dependencias:** Fases 4–5.
**Entregable:** compra E2E real por WhatsApp con pedido registrado.
**Aceptación:** pedido visible en admin como pending · mensaje exacto a plantilla con formato de moneda correcto · stock decrementado · caso "sin talla" bloquea CTA con microcopy inline.

---

## FASE 7 — Administrador ⬜ PENDIENTE

**Objetivo:** gestión total sin código.
**Tareas:** auth (login/logout/reset) · proxy.ts + guard layout · dashboard · módulos productos (con matriz variantes e imágenes drag&drop), categorías, promociones, pedidos (estados + timeline), home editor, ajustes (incluye WhatsApp number) · Server Actions con revalidación de tags · textos centralizados.
**Dependencias:** Fases 3–6.
**Entregable:** panel completo según `05-ADMIN.md`.
**Aceptación:** ciclo completo crear producto→publicar→verlo en tienda (revalidado) · cambio de estado de pedido registra evento · ajustes cambian WhatsApp sin deploy · guards bloquean no-admin.

---

## FASE 8 — SEO / Performance ⬜ PENDIENTE

**Objetivo:** posicionamiento y velocidad a producción.
**Tareas:** sitemap.ts + robots.ts · JSON-LD Product/Breadcrumb · OG images · auditoría CWV y correcciones · blur placeholders en subidas · revisión de bundle JS · headers seguridad en next.config.
**Dependencias:** Fase 7 (contenido real).
**Entregable:** checklist de `09-SEO-PERFORMANCE.md` completo.
**Aceptación:** sitemap válido con productos reales · CWV dentro de presupuesto en prueba de campo · robots bloquea /admin.

---

## FASE 9 — Testing ⬜ PENDIENTE

**Objetivo:** red de seguridad antes de producción. Nota (desde Fase 1, ver `docs/rules/testing.md`): los tests unitarios de lógica crítica (money, cart, mensajes WhatsApp, promociones, stock, pedidos) se escriben incrementalmente en la fase que introduce esa lógica; Fase 9 instala el runner formal y consolida integración + E2E, no es donde empieza el testing.
**Tareas:** elegir runner (recomendado Vitest — decisión a registrar) · unitarios: money, cart reducer, buildOrderMessage, slugify, validaciones · integración: actions críticas contra BD dev · E2E mínimo (Playwright o similar): compra WhatsApp feliz + admin login.
**Dependencias:** Fases 4–7 estables.
**Entregable:** suite en CI local (`npm test`).
**Aceptación:** flujos críticos cubiertos · suite pasa en limpio · cobertura razonable de lógica pura (>80% en lib/).

---

## FASE 10 — Deploy Producción ⬜ PENDIENTE

**Objetivo:** tienda pública real.
**Tareas:** proyectos Vercel por mercado · dominios + DNS · envs de producción · proyecto Supabase prod + migraciones · smoke tests post-deploy · monitoreo básico (logs Vercel; analytics opcional — decisión Juan).
**Dependencias:** Fases 8–9. Decisión humana: dominios definitivos.
**Entregable:** URL pública vendiendo.
**Aceptación:** compra real E2E en producción · HTTPS/headers correctos · rollback probado.

---

## FASE 11 — Pagos online 🔮 FUTURO

Checkout automatizado: `OnlinePaymentChannel` (misma interfaz DEC-007) · proveedor por mercado (ES: Stripe recomendado; CO: evaluar Wompi/MercadoPago — decisión Juan) · webhooks firmados → estado paid automático SOLO entonces · direcciones de envío · emails de confirmación.

## FASE 12 — Expansión 🔮 FUTURO

Segundo mercado en paralelo · analítica completa · CRM/automatizaciones · multi-marca si aplica · Cache Components (reevaluar DEC-004).

---

## Reglas de ejecución entre fases

1. No se inicia una fase sin criterios de la anterior verificados.
2. Toda fase termina con: lint+tsc verdes, docs actualizadas, CURRENT-STATE actualizado, CHANGELOG si aplica.
3. Cambios de alcance durante una fase → registrar decisión o pendiente, nunca improvisar.