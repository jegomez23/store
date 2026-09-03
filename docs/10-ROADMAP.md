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

## FASE 5 — Carrito ✅ COMPLETADO

**Objetivo:** carrito local robusto.
**Tareas:** `lib/cart/` (contexto+reducer+persistencia) · drawer carrito + página `/carrito` · stepper cantidades con tope de stock · snapshot de precio/nombre · badge contador header · eliminar ítem · subtotal.
**Dependencias:** Fase 4.
**Entregable:** carrito funcional persistente entre recargas.
**Aceptación:** sobrevive refresh/navegación · respeta stock máximo · cálculos correctos con descuentos visuales · accesible por teclado.

---

## FASE 6 — WhatsApp Checkout ✅ COMPLETADO

**Objetivo:** cierre de venta v1 completo.
**Tareas:** interfaz `CheckoutChannel` + factory · Server Action de generación de pedido (transacción: order pending + items snapshot + customer upsert + decremento stock con guard) · `WhatsAppChannel` (mensaje según plantillas de `06-WHATSAPP.md` + wa.me) · CTA en ficha y carrito · página confirmación `/pedido/[numero]` · manejo errores tipados.
**Dependencias:** Fases 4–5.
**Entregable:** compra E2E real por WhatsApp con pedido registrado.
**Aceptación:** pedido visible en admin como pending · mensaje exacto a plantilla con formato de moneda correcto · stock decrementado · caso "sin talla" bloquea CTA con microcopy inline.

**Estado real (2026-09-01):** implementado y validado contra Supabase real (40 tests de integración con la anon key + 20 comprobaciones end-to-end). El pedido se crea con la función `create_order` (DEC-026), no con `service_role`. Desviaciones respecto al plan original: (a) **sin promociones** — no estaban en las tareas de esta fase y la regla "promoción más favorable" sigue pendiente de Juan; (b) la página `/pedido/[numero]` **no lee la BD** (DEC-027, evitar enumeración); (c) la compra desde la ficha pasa por `/checkout` en vez de duplicar el formulario de contacto.

---

## FASE 7 — Administrador 🔄 NÚCLEO OPERATIVO COMPLETADO (2026-09-02)

**Objetivo original:** gestión total sin código.
**Tareas del plan:** auth (login/logout/reset) · proxy.ts + guard layout · dashboard · módulos productos (con matriz variantes e imágenes drag&drop), categorías, promociones, pedidos (estados + timeline), home editor, ajustes (incluye WhatsApp number) · Server Actions con revalidación de tags · textos centralizados.
**Dependencias:** Fases 3–6.

**Alcance realmente ejecutado (acordado con Juan al abrir la fase): "núcleo operativo".** El criterio fue cerrar de verdad el ciclo de un pedido recibido por WhatsApp, en vez de dejar muchos módulos a medio verificar.

✅ **Hecho y verificado contra Supabase real:**
- Auth de admin (`/admin/login`, logout), `proxy.ts` que **mantiene la sesión viva** + guard real en el layout (DEC-031).
- Dashboard: pedidos por estado, últimos pedidos, stock bajo.
- **Pedidos completos:** listado con filtro por estado, búsqueda por número y paginación; detalle con snapshots, totales, cliente e **historial**; cambio de estado con transiciones impuestas por PostgreSQL (DEC-032); **cancelación que devuelve stock exactamente una vez** (DEC-033).
- Catálogo **mínimo**: publicar/retirar producto y editar stock, precio y activa por variante.
- Ajustes **mínimos**: número de WhatsApp (cumple "ajustes cambian WhatsApp sin deploy").

⬜ **No hecho en esta fase** (CRUD de productos, matriz color×talla, imágenes/Storage, categorías, editor de home, ajustes completos): **entregado en la Fase 8**. Siguen pendientes: promociones, reset de contraseña por email y `lib/i18n/`.

**Criterios de aceptación:**
- [x] Cambio de estado de pedido registra evento (y con `actor_id`).
- [x] Ajustes cambian WhatsApp sin deploy.
- [x] Guards bloquean no-admin (39 comprobaciones RLS + 78 end-to-end, con controles positivos).
- [ ] Ciclo "crear producto → publicar → verlo en tienda": **parcial**. Publicar/retirar sí revalida la tienda (`revalidatePath`); **crear** un producto desde el panel no existe.
- [x] Extra no previsto en el plan: cancelar un pedido devuelve stock de forma atómica e idempotente.

**Desviaciones registradas:** el guard vive en `app/admin/(panel)/layout.tsx` y no en `app/admin/layout.tsx` (bucle con el login); el detalle se direcciona por `order_number` y no por `id`; **la revalidación usa `revalidatePath`, no tags** — los tags previstos (`catalog`, `home`, `settings`, `orders`) siguen sin existir porque el data layer no usa `fetch` etiquetado.

---

## FASE 8 — CMS de catálogo ✅ COMPLETADA (2026-09-02)

> **Renumeración (DEC-038):** el CMS ocupa la Fase 8 y SEO/Performance baja a la 9.
> Razón técnica: el sitemap y las OG images de `09-SEO-PERFORMANCE.md` exigen
> "productos reales" e "imagen real del catálogo", y eso requiere poder crearlos.

**Objetivo:** que el negocio pueda publicar catálogo sin tocar SQL.
**Dependencias:** Fase 7.

**Tareas:** CRUD de productos (general + SEO) · matriz de variantes color × talla · categorías con jerarquía · imágenes en Supabase Storage · editor de bloques de home · ajustes operativos · invalidación de la tienda.

✅ **Hecho y verificado contra Supabase real:**
- **Productos:** crear, editar, publicar/retirar/archivar, borrado lógico, búsqueda y filtro por estado. SEO limitado a `meta_title`/`meta_description`, que ya existían en el esquema.
- **Variantes:** matriz color × talla con creación en lote **atómica** (`admin_create_variant_matrix`, migración 0021), idempotente, respetando el nullable de DEC-019.
- **Categorías:** alta, edición, orden, activar/desactivar y borrado lógico bloqueado por la FK real.
- **Imágenes:** subida con conversión a WebP en servidor (**×13,2 menos espacio**, DEC-036), validación por magic bytes, orden, principal garantizada por índice UNIQUE y limpieza de huérfanos.
- **Home:** CRUD de los tres tipos de bloque que existen en `home_content`.
- **Ajustes:** nombre, email, redes y número de WhatsApp.
- **Correcciones de seguridad arrastradas:** DEC-035 (el admin ya no puede escribir en un mercado inactivo) y DEC-022 aplicada a las tres tablas que la migración 0016 se dejó.

⬜ **NO hecho:** promociones (fuera del alcance acordado; la regla "promoción más favorable" sigue pendiente de Juan) · imágenes de home y logo (bucket `content`) · reset de contraseña · `lib/i18n/` · invalidación por tags.

**Criterios de aceptación:**
- [x] Ciclo completo crear producto → variantes → imagen → publicar → **verlo en la tienda**, y despublicar → 404 inmediato (DEC-037).
- [x] La jerarquía de categorías no admite un tercer nivel (lo impide el trigger).
- [x] Ningún usuario que no sea admin puede crear, editar ni subir nada.
- [x] Un admin no puede afectar al mercado CO ni moviendo un `market_id` a mano.
- [x] Ninguna imagen que no sea JPEG/PNG/WebP real llega al bucket.

---

## FASE 9 — SEO / Performance 🔄 COMPLETADA SALVO LA AUDITORÍA CWV (2026-09-02)

**Objetivo:** posicionamiento y velocidad a producción.
**Dependencias:** Fase 8 (contenido real, ya disponible).

✅ **Hecho y verificado sobre el build servido:**
- **`app/robots.ts`**: deniega `/admin`, `/api`, `/carrito`, `/checkout` y `/pedido`; anuncia el sitemap. Comprobado en la misma ejecución que **no es** un control de acceso: con `robots.txt` publicado, un anónimo sigue sin poder entrar en `/admin`.
- **`app/sitemap.ts`**: home + fichas publicadas, todas absolutas y **todas responden 200**. Un borrador o un producto eliminado no aparece (filtro explícito + RLS). Sin categorías ni infos: esas rutas no existen (DEC-039).
- **Metadata**: canonical, Open Graph con la foto real del catálogo, Twitter card y `meta_title`/`meta_description` con fallback. Sin inventar ningún campo SEO en PostgreSQL.
- **JSON-LD** `Product` + `BreadcrumbList` en la ficha, desde Server Component, con `availability` derivada del stock real y `<` escapado.
- **`app/opengraph-image.tsx`** para la home con `next/og` (sin dependencias nuevas).
- **Placeholder blur** generado en servidor con `sharp` (migración `0022`, DEC-040), verificado end-to-end con una subida real por la Server Action.
- **Matriz de invalidación** (DEC-041): se cerró la deuda del *chrome* que Fase 8 dejó sin declarar y se corrigió un fallo todavía vivo en el panel de pedidos. El sitemap pasa a invalidarse con cada mutación de producto.
- **Headers de seguridad** (DEC-042, decisión de Juan): los cuatro de `08-SECURITY.md` §9.

⬜ **NO hecho:**
- **Auditoría CWV / Lighthouse**: en este entorno **no hay navegador automatizado**. LCP, INP y CLS **no están medidos** y no se declara ningún presupuesto cumplido.
- Redirect 301 al cambiar el slug de un producto (hoy el slug antiguo pasa a dar 404).
- Backfill del blur de las 4 imágenes anteriores a Fase 9.
- CSP y HSTS (van con el dominio real, Fase 11).
- Fuera del alcance documentado de esta fase y sin empezar: imágenes de home y logo, drag&drop de orden, `lib/i18n/`, promociones.

**Criterios de aceptación:**
- [x] Sitemap válido con productos reales; todas sus URLs responden 200.
- [x] `robots.txt` bloquea `/admin` — y se verificó que la protección real sigue siendo la cadena de Fase 7.
- [ ] CWV dentro de presupuesto en prueba de campo: **NO medido** (sin navegador en este entorno).

---

## FASE 10 — Testing ⬜ PENDIENTE

**Objetivo:** red de seguridad antes de producción. Nota (desde Fase 1, ver `docs/rules/testing.md`): los tests unitarios de lógica crítica (money, cart, mensajes WhatsApp, promociones, stock, pedidos) se escriben incrementalmente en la fase que introduce esa lógica; Fase 9 instala el runner formal y consolida integración + E2E, no es donde empieza el testing.
**Tareas:** ~~elegir runner~~ (resuelto en DEC-025: `node:test` nativo desde Fase 5; Fase 9 decide si hacen falta Vitest/Playwright para componentes y E2E) · unitarios: money, cart reducer, buildOrderMessage, slugify, validaciones · integración: actions críticas contra BD dev · E2E mínimo (Playwright o similar): compra WhatsApp feliz + admin login.
**Dependencias:** Fases 4–8 estables.
**Entregable:** suite en CI local (`npm test`).
**Aceptación:** flujos críticos cubiertos · suite pasa en limpio · cobertura razonable de lógica pura (>80% en lib/).

---

## FASE 11 — Deploy Producción ⬜ PENDIENTE

**Objetivo:** tienda pública real.
**Tareas:** proyectos Vercel por mercado · dominios + DNS · envs de producción · proyecto Supabase prod + migraciones · smoke tests post-deploy · monitoreo básico (logs Vercel; analytics opcional — decisión Juan).
**Dependencias:** Fases 9–10. Decisión humana: dominios definitivos.
**Entregable:** URL pública vendiendo.
**Aceptación:** compra real E2E en producción · HTTPS/headers correctos · rollback probado.

---

## FASE 12 — Pagos online 🔮 FUTURO

Checkout automatizado: `OnlinePaymentChannel` (misma interfaz DEC-007) · proveedor por mercado (ES: Stripe recomendado; CO: evaluar Wompi/MercadoPago — decisión Juan) · webhooks firmados → estado paid automático SOLO entonces · direcciones de envío · emails de confirmación.

## FASE 13 — Expansión 🔮 FUTURO

Segundo mercado en paralelo · analítica completa · CRM/automatizaciones · multi-marca si aplica · Cache Components (reevaluar DEC-004).

---

## Reglas de ejecución entre fases

1. No se inicia una fase sin criterios de la anterior verificados.
2. Toda fase termina con: lint+tsc verdes, docs actualizadas, CURRENT-STATE actualizado, CHANGELOG si aplica.
3. Cambios de alcance durante una fase → registrar decisión o pendiente, nunca improvisar.