# DECISIONS — Registro de decisiones (ADR ligero)

> Cada decisión relevante que afecte implementaciones futuras se registra aquí.
> Formato: `DEC-XXX` con Status / Context / Decision / Alternatives / Reason / Consequences / Future reconsideration.
> **No conviertas cada detalle en una decisión.** Solo lo que condicione trabajo futuro.

---

## DEC-001 — Next.js App Router como framework base

**Status:** Accepted

**Context:** Proyecto nuevo de e-commerce con React, necesidad de SEO fuerte, Server Components y rendimiento móvil.

**Decision:** Usar Next.js 16.x con App Router (ya instalado en el scaffold).

**Alternatives:** Pages Router (deprecado en la práctica), Remix/React Router 7, Astro + islas.

**Reason:** App Router es el modelo actual de Next.js; el scaffold ya usa Next 16.3.3; SEO por servidor nativo; ecosistema maduro para e-commerce.

**Consequences:** Obliga a respetar convenciones de Next.js 16: request APIs asíncronas (`await params`), `proxy.ts` en lugar de middleware, type helpers `PageProps`/`LayoutProps`, Turbopack por defecto.

**Future reconsideration:** No previsto.

---

## DEC-002 — Supabase como backend único

**Status:** Accepted

**Context:** Se necesita auth, base de datos relacional, storage de imágenes y seguridad a nivel de fila sin construir un backend propio.

**Decision:** PostgreSQL vía Supabase: Auth, Database con RLS, Storage. Acceso desde Next.js con `@supabase/supabase-js` + `@supabase/ssr`.

**Alternatives:** Backend custom (NestJS/FastAPI), Firebase, PlanetScale+Auth0, Payload CMS.

**Reason:** Un solo proveedor cubre las 4 necesidades; RLS da seguridad real en base de datos; plan gratuito suficiente al inicio; migraciones SQL estándar evitan lock-in total.

**Consequences:** La lógica de autorización vive en políticas SQL; los clientes usan anon key + RLS; service role key solo en servidor.

**Future reconsideration:** Si aparecen necesidades que Supabase no cubre bien (colas complejas, integraciones pesadas), se añadirían servicios puntuales sin reemplazarlo.

---

## DEC-003 — Tailwind CSS 4 para estilos

**Status:** Accepted

**Context:** Necesidad de design system consistente, rápido de iterar y sin runtime CSS.

**Decision:** Tailwind CSS 4 (ya instalado) con tokens definidos en `globals.css` mediante `@theme`.

**Alternatives:** CSS Modules, styled-components, Panda CSS.

**Reason:** Ya presente en el scaffold; tokens centralizados en `@theme`; excelente rendimiento; ampliamente conocido.

**Consequences:** Los componentes deben consumir únicamente tokens del design system (ver `/docs/rules/ui.md`); no hay dark mode en v1 (DEC-010).

**Future reconsideration:** No previsto.

---

## DEC-004 — NO habilitar Cache Components en v1

**Status:** Accepted

**Context:** Next.js 16 introduce el nuevo modelo "Cache Components" (`use cache`, PPR). Está disponible pero exige reestructurar el renderizado alrededor de `<Suspense>` y shells estáticos.

**Decision:** Mantener `cacheComponents` desactivado. Usar el modelo clásico: Server Components + `generateStaticParams` + segment config `revalidate` + `revalidateTag(tag, perfil)` tras cambios del admin.

**Alternatives:** Habilitar `cacheComponents: true` desde el inicio.

**Reason:** El catálogo es pequeño; el modelo clásico es más simple, mejor documentado y suficiente. Adoptar Cache Components ahora añadiría riesgo y curva de aprendizaje sin beneficio medible en v1.

**Consequences:** Las páginas dinámicas funcionan con el modelo tradicional; cuando se migre en el futuro habrá que envolver datos en `<Suspense>` o `use cache`. Las APIs nuevas (`updateTag`, `refresh`) sí se usan donde apliquen porque son compatibles con ambos modelos.

**Future reconsideration:** Evaluar adopción cuando existan métricas de tráfico y si las navegaciones se sienten lentas (Fase 8+).

---

## DEC-005 — Carrito local (localStorage) inicialmente

**Status:** Accepted

**Context:** v1 cierra ventas por WhatsApp; no hay checkout ni cuentas de usuario finales.

**Decision:** Carrito gestionado en cliente con React Context + persistencia en `localStorage`, guardando `variant_id`, cantidad y snapshot de precio/nombre.

**Alternatives:** Carrito en base de datos vinculado a sesión anónima, Zustand u otra librería de estado.

**Reason:** Cero dependencias nuevas, cero backend, funciona sin login. El snapshot de precio evita inconsistencias si el precio cambia entre visita y compra.

**Consequences:** El carrito no sobrevive entre dispositivos ni se sincroniza; la validación real de precio/stock ocurre al registrar el pedido (servidor). Si más adelante se requiere sincronización, se migra el estado a Zustand o a BD sin reescribir la UI (la lógica vive en `lib/cart/`).

**Future reconsideration:** Con checkout online o cuentas de usuario, evaluar carrito servidor.

---

## DEC-006 — WhatsApp como canal inicial de checkout

**Status:** Accepted

**Context:** Reducir fricción y poner la tienda a vender rápido sin pasarela de pago.

**Decision:** Botón "Comprar por WhatsApp" que genera un mensaje estructurado desde el producto o el carrito y abre `wa.me` con el número configurado en settings.

**Alternatives:** Checkout automatizado desde el día uno (Stripe/PayU/Wompi).

**Reason:** Confirmación humana al inicio reduce errores de stock/envío y coste de integración; es el canal habitual de venta en Colombia.

**Consequences:** El pedido se registra como `pending`; nunca se marca pagado automáticamente (ver `06-WHATSAPP.md`). Requiere gestión manual del negocio.

**Future reconsideration:** Cuando el volumen lo justifique (DEC-007).

---

## DEC-007 — Checkout desacoplado mediante CheckoutChannel

**Status:** Accepted

**Context:** WhatsApp no debe ser una dependencia imposible de sustituir cuando llegue el pago online.

**Decision:** Toda la UI consume una interfaz interna `CheckoutChannel` (`submitOrder(cart): Promise<OrderResult>`). En v1 existe una única implementación: `WhatsAppChannel`. La futura `OnlinePaymentChannel` implementará la misma interfaz.

**Alternatives:** Llamar a la lógica de WhatsApp directamente desde los componentes.

**Reason:** Sustituir/añadir canal de checkout no tocará UI, carrito ni dominio de pedidos.

**Consequences:** Interfaz definida en `lib/checkout/` (futura Fase 6); el builder de mensajes es una función pura testeable separada del canal.

**Future reconsideration:** No previsto; es requisito explícito del producto.

---

## DEC-008 — Una sola base de código para Colombia y España

**Status:** Accepted

**Context:** Dos mercados potenciales con diferencias de moneda, precio, WhatsApp, envíos y disponibilidad.

**Decision:** Un único repositorio/aplicación. El mercado es una dimensión de datos (`market_id` en entidades comerciales) y de configuración (variables de entorno por despliegue). No existen `/colombia-app` ni `/espana-app`.

**Alternatives:** Duplicar la app por mercado; multi-tenant con subdominios y una BD compartida con precios por mercado.

**Reason:** Elimina duplicación de código; cada despliegue apunta a su mercado; el esquema admite ambos modelos (ver `07-MULTI-MARKET.md` para el detalle y la opción futura de admin multi-mercado).

**Consequences:** Toda entidad comercial lleva `market_id`; el admin filtra por el mercado activo; textos compartidos con adaptaciones por locale.

**Future reconsideration:** Si se necesita gestionar ambos mercados desde un solo panel, añadir selector de mercado al admin sobre el mismo esquema (no requiere migración destructiva).

---

## DEC-009 — RLS obligatorio en todas las tablas

**Status:** Accepted

**Context:** La tienda pública usa la anon key; solo el admin debe escribir. Ocultar rutas en el frontend NO es seguridad.

**Decision:** Row Level Security activado en todas las tablas desde su creación. Público: SELECT limitado a registros publicados/activos. Admin: permisos completos vía policy que comprueba rol en `profiles`. Storage con policies equivalentes.

**Alternatives:** Validación solo en server actions; API intermedia propia.

**Reason:** Defensa en profundidad: aunque el cliente esté comprometido, la BD limita el daño. Es el modelo nativo de Supabase.

**Consequences:** Toda tabla nueva debe incluir sus políticas en la misma migración (ver `/docs/rules/database.md` y `08-SECURITY.md`).

**Future reconsideration:** No previsto.

---

## DEC-010 — Light mode como identidad principal en v1

**Status:** Accepted

**Context:** La identidad YI se basa en fondos claros y cálidos (crema/blanco roto).

**Decision:** Solo tema claro en v1. Sin toggle dark mode ni `prefers-color-scheme`.

**Alternatives:** Dark mode completo desde el inicio.

**Reason:** La marca es clara/cálida; mantener un solo tema reduce superficie de bugs visuales y esfuerzo de QA.

**Consequences:** Los tokens se definen sin variantes dark; si en el futuro se añade dark mode, bastará extender `@theme` (los componentes ya consumen tokens, no colores crudos).

**Future reconsideration:** Post-lanzamiento si hay demanda real.

---

## DEC-011 — Reglas de agente en `/docs/rules/` (no `.claude/rules/`)

**Status:** Accepted

**Context:** Se necesitaba un mecanismo de reglas específicas por área compatible con Claude Code/Cline. Claude Code no documenta auto-carga de `.claude/rules/*.md` (sus mecanismos nativos son CLAUDE.md jerárquico, imports `@ruta`, settings y commands).

**Decision:** Reglas como markdown plano en `/docs/rules/*.md`, referenciadas desde el mapa de lectura de CLAUDE.md ("si trabajas en X → lee Y"). Funciona igual en cualquier agente.

**Alternatives:** `.claude/rules/` (sin garantía de auto-carga), duplicar reglas dentro de CLAUDE.md (lo haría gigante).

**Reason:** Portabilidad entre agentes y una única fuente de verdad sin inventar configuración no soportada.

**Consequences:** Depende de que el agente siga el mapa de lectura de CLAUDE.md (obligado por `AI-DEVELOPMENT.md`).

**Future reconsideration:** Si Claude Code soporta oficialmente rules auto-cargadas, migrar manteniendo `/docs/rules/` como fuente.

---

## DEC-012 — Estructura sin directorio `src/`

**Status:** Accepted

**Context:** El scaffold crea `app/` en la raíz. Next.js soporta tanto raíz como `src/app`.

**Decision:** Mantener todo en la raíz (`app/`, `lib/`, `components/`, `types/`) usando el alias `@/*` ya configurado.

**Alternatives:** Migrar a `src/`.

**Reason:** Evita reestructurar el scaffold existente sin beneficio funcional; alias `@/*` mantiene imports limpios.

**Consequences:** Ninguna relevante.

**Future reconsideration:** Solo si el equipo prefiere `src/` por convención (cambio mecánico).

---

## DEC-013 — Español único en v1 con textos centralizados

**Status:** Accepted *(resuelta por Juan 2026-08-31)*

**Context:** Ambos mercados hablan español, pero Colombia y España tienen variaciones léxicas.

**Decision:** Idioma inicial = **español único**. TODOS los textos de UI centralizados en un módulo de cadenas (`lib/i18n/messages.ts`, aún no creado — se crea cuando exista la primera necesidad real de variación por mercado, probablemente Fase 4+) para permitir i18n futuro sin reescribir componentes. **La arquitectura debe permitir internacionalización futura; NO se implementa i18n todavía** (sin `next-intl`, sin selector de idioma).

**Alternatives:** i18n completo (next-intl) desde el inicio; textos inline en componentes.

**Reason:** i18n completo es sobre-arquitectura para un mercado inicial único; pero textos inline dificultarían cualquier traducción futura. Confirmado por Juan: español único, preparar sin implementar.

**Consequences:** Regla de implementación: prohibido hardcodear strings de UI en componentes nuevos (ver `/docs/rules/frontend.md`); los strings ya existentes de Fase 2 quedan marcados `TODO(i18n)` hasta que se cree el módulo.

**Future reconsideration:** Al abrir mercado no-hispanohablante.

---

## DEC-014 — Mercado inicial: España

**Status:** Accepted *(resuelta por Juan 2026-08-31)*

**Context:** Colombia y España son candidatos. El orden afecta seed inicial, moneda por defecto, copy y logística.

**Decision:** Mercado inicial operativo = **España** (`market = ES`, `currency = EUR`). Colombia (`market = CO`, `currency = COP`) queda **soportado arquitectónicamente** (fila en `markets`, esquema multi-market intacto) pero **sin seed operativo completo** (sin categorías/productos/settings propios todavía) — evita "llenar la base" con datos ficticios solo para Colombia.

**Alternatives:** Fijar Colombia primero; mantener agnóstico sin decidir (insostenible: Fase 3 necesita saber qué mercado sembrar con datos reales).

**Reason:** Decisión comercial de Juan. La arquitectura ya era agnóstica (DEC-008) — esta decisión no la modifica, solo determina qué mercado recibe seed operativo en Fase 3.

**Consequences:** `supabase/seed/` puebla `markets` con CO y ES, pero categorías/productos/variantes/shipping/settings solo para ES. Cuando Colombia se active, se completa su seed sin migración (mismo esquema, DEC-008).

**Future reconsideration:** Al decidir lanzar Colombia operativamente.

---

## DEC-015 — GitHub Actions como CI mínimo

**Status:** Accepted

**Context:** Fase 1 requiere una red de seguridad automática mínima (lint + typecheck, opcionalmente build) antes de que cualquier cambio llegue a `main`, sin montar infraestructura compleja.

**Decision:** Un único workflow `.github/workflows/ci.yml` que corre en push a `main` y en pull requests: `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm run build`. Node 22 (cumple el mínimo ≥20.9 de Next 16). Sin deploy automático, sin matriz de versiones, sin caché más allá del cache nativo de `actions/setup-node`.

**Alternatives:** Vercel CI (deploy checks) sin GitHub Actions; CI multi-job (lint/typecheck/build separados); herramientas externas (CircleCI, etc.).

**Reason:** El repo ya vive en GitHub; GitHub Actions no añade proveedor nuevo. Un solo job secuencial es suficiente para el volumen de código actual y evita configuración especulativa (regla anti-sobrearquitectura).

**Consequences:** Cuando exista runner de tests (Fase 9), añadir un paso `npm test` al mismo job. Cuando exista deploy (Fase 10), evaluar si se gestiona desde Vercel directamente o se añade un job de deploy aquí.

**Future reconsideration:** Revisar en Fase 9 (tests) y Fase 10 (deploy).

---

## DEC-016 — Mantener Geist Sans/Mono (sin tipografía externa)

**Status:** Accepted

**Context:** Fase 2 pidió evaluar explícitamente si Geist (heredada del boilerplate de `create-next-app`) encaja con la identidad YI (streetwear urbano + naturaleza, "no excesivamente sofisticada", evitar exceso de graffiti que perjudique usabilidad) o si conviene una tipografía con más carácter.

**Decision:** Mantener Geist Sans (UI/body/headlines) y Geist Mono (uso técnico futuro). No se instala ninguna fuente externa.

**Alternatives:** Tipografía display más "urbana"/condensada (p. ej. una grotesca de mayor personalidad) para headlines, combinada con Geist en body.

**Reason:** Geist ya está integrada vía `next/font/google` (autohospedada en build, sin llamada a red en runtime, cero dependencia nueva). Su rango de pesos (400–800) permite headlines con peso/tracking agresivo (`font-bold tracking-tight`) que ya comunican actitud sin necesidad de cambiar de familia tipográfica. Introducir una segunda fuente añade una dependencia y riesgo de inconsistencia visual sin beneficio claro medible en esta fase; la dirección de marca puede lograrse con jerarquía, espaciado y el acento rojo.

**Consequences:** Si en una fase posterior (con fotografía real y contenido editorial) la marca se siente "genérica", reconsiderar una tipografía display específica solo para H1/logo — cambio localizado, no estructural.

**Future reconsideration:** Fase 8+ (SEO/Performance) o si Juan aporta guía de marca con tipografía definida.

---

## DEC-019 — Variantes sin color/talla permitidas (accesorios)

**Status:** Accepted

**Context:** `03-DATABASE.md` §6 dejaba como "pendiente de decisión antes de Fase 3" si `product_variants.color_id`/`size_id` pueden ser NULL para productos sin color o talla única (ej. algunos accesorios), con una recomendación explícita ya documentada: "sí, nullable + CHECK que exija ambas cuando el grupo del producto las requiera".

**Decision:** Implementar tal como recomendaba el documento: `color_id` y `size_id` nullable en `product_variants`. La unicidad `(product_id, color_id, size_id)` ya cubre el caso (Postgres trata NULLs como distintos entre filas, permitiendo una única variante "sin color/talla" real por producto en la práctica de uso — no se añade CHECK adicional de "exactamente una variante nula" por ahora, sería sobre-ingeniería sin casos reales que lo requieran).

**Reason:** No hay información nueva de negocio que contradiga la recomendación ya analizada en Fase 0; bloquear Fase 3 pidiendo reconfirmar algo ya recomendado y sin alternativa mejor propuesta no aporta valor.

**Consequences:** El admin (Fase 7) deberá validar en formulario que accesorios de talla única usen `size_id NULL` o una talla "Única" real — decisión de UI, no de esquema.

**Future reconsideration:** Si aparecen casos reales de datos inconsistentes.

---

## DEC-020 — Alta de admin manual, sin trigger de auto-creación de `profiles`

**Status:** Accepted

**Context:** `DOMAIN-MODEL.md` dejaba abierto si `profiles` se crea automáticamente al signup (trigger sobre `auth.users`) o solo por invitación manual. `08-SECURITY.md` ya era explícito: "Alta de admins: manual (SQL o dashboard Supabase). No hay self-signup hacia roles."

**Decision:** NO crear trigger `on auth.users insert → crear profile`. Los admins se dan de alta manualmente (SQL/dashboard) insertando en `profiles` con `role='admin'` después de crear el usuario en Supabase Auth.

**Reason:** Un trigger automático que crea `profiles` con `role` por defecto en cada signup es una superficie de escalado de privilegios si alguna vez se habilita signup público (aunque hoy no exista UI de registro). La regla de seguridad ya documentada prevalece sobre la opción alternativa que `DOMAIN-MODEL.md` dejaba abierta.

**Consequences:** No hay flujo de registro público que otorgue rol automáticamente. El primer admin se crea manualmente cuando se provisione el proyecto Supabase real (fuera de esta migración).

**Future reconsideration:** Si se añaden roles no-admin con self-signup legítimo (`editor`/`viewer` con flujo de invitación controlado).

---

## DEC-021 — Mantener generateStaticParams + ISR pese a que rompe el build sin Supabase real

**Status:** Accepted

**Context:** Fase 4 conecta Home y `/producto/[slug]` a Supabase con la estrategia ya documentada (`02-ARCHITECTURE.md` §3: `generateStaticParams` + `revalidate=300`). En este entorno de desarrollo no hay proyecto Supabase real ni Docker, así que `npm run build` falla al intentar hacer fetch en build-time (`generateStaticParams`/página estática necesitan datos reales). Ver `docs/context/CURRENT-STATE.md` para el error exacto.

**Decision:** Mantener la estrategia documentada (SSG + ISR) tal cual, en vez de cambiar a `export const dynamic = 'force-dynamic'` para "arreglar" el build en este entorno.

**Alternatives:** Cambiar Home/ficha a renderizado dinámico (`force-dynamic`), que haría pasar `npm run build` siempre (sin fetch en build-time) a costa de perder ISR/caché y contradecir DEC-004 y `02-ARCHITECTURE.md` §3 sin que exista una razón de producto para ese cambio.

**Reason:** Cambiar arquitectura solo para ocultar la ausencia de un proyecto Supabase real sería falsear una validación ("no fingir resultados", regla explícita del usuario). El build DEBE fallar sin datos reales — es la señal correcta, no un bug.

**Consequences:** `npm run build` (local y en CI, `.github/workflows/ci.yml`) requiere `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` apuntando a un proyecto Supabase real y accesible con las migraciones/seed de Fase 3 aplicadas. CI configurado para leer esas variables desde GitHub Secrets — quedará en rojo hasta que se configuren.

**Future reconsideration:** Si el equipo decide que build-time data fetching es indeseable operativamente (ej. builds de Vercel más frágiles), reevaluar entonces con esa razón de producto explícita — no antes.

---

## Decisiones abiertas (resumen para revisión humana)

| ID | Tema | Quién decide |
|---|---|---|
| — | Pasarela de pago futura (Stripe recomendado para ES; evaluar Wompi/MercadoPago para CO) | Juan (Fase 11) |
| — | Dominios definitivos por mercado | Juan (antes de Fase 10) |
| — | Formato definitivo de `order_number` | Juan (Fase 6) |