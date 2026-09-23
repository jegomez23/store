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

## DEC-022 — La lectura pública del catálogo exige mercado activo

**Status:** Accepted *(Fase 4.5, 2026-09-01)*

**Context:** Al validar el esquema real contra `docs/03-DATABASE.md` §3 se detectó una divergencia: el documento especifica para `categories`/`products`/`product_images`/`product_variants` "SELECT público: activos y no borrados **(y market activo)**", pero las policies de Fase 3 solo comprobaban "activos y no borrados". Verificado en el proyecto real con la anon key: un producto sembrado en el mercado CO (inactivo, DEC-014) era legible públicamente. `settings` sí aplicaba la comprobación (migración 0013) y `markets` sí oculta sus filas inactivas (0003), así que el esquema era además incoherente consigo mismo.

**Decision:** Implementar la condición documentada. Migración `0016_public_read_requires_active_market.sql`: helper `public.is_active_market(text)` (SECURITY DEFINER, `search_path` fijado) y policies de lectura pública recreadas en las cuatro tablas.

**Alternatives:** (a) Dejar la policy como estaba y corregir la documentación para que dijera "sin comprobar mercado" — sería debilitar la seguridad para que el reporte cuadre, prohibido explícitamente. (b) Filtrar por mercado solo en `lib/data/` — ya se hace, pero dejar RLS como barrera más débil que la documentada contradice DEC-009.

**Reason:** La documentación indicaba que la condición debía existir, así que la divergencia es un fallo de implementación de Fase 3, no una decisión previa. Sin ella, el catálogo de un mercado aún no lanzado (Colombia en preparación) sería público vía la API antes de tiempo.

**Consequences:** Desactivar un mercado (`markets.is_active = false`) ahora oculta automáticamente todo su catálogo del público: es un interruptor real de lanzamiento. Toda tabla nueva con `market_id` y lectura pública debe incluir `public.is_active_market(market_id)` en su policy. El admin no se ve afectado (sus policies son `for all` con `is_admin()`).

**Future reconsideration:** Al activar Colombia; el cambio será un `update markets set is_active = true`, sin migración.

---

## DEC-023 — Revocar TRUNCATE/TRIGGER de anon y authenticated

**Status:** Accepted *(Fase 4.5, 2026-09-01)*

**Context:** Supabase concede por defecto ALL PRIVILEGES sobre el esquema `public` a los roles `anon` y `authenticated`. RLS filtra SELECT/INSERT/UPDATE/DELETE pero **no filtra TRUNCATE ni TRIGGER**: son privilegios de tabla que ignoran por completo las policies. Verificado en el proyecto real: ambos roles tenían TRUNCATE sobre las 18 tablas, incluidas `orders`, `order_items` y `customers` — las que DEC-009 considera 100% privadas.

**Decision:** Migración `0017_revoke_truncate_from_public_roles.sql`: `REVOKE TRUNCATE, TRIGGER` de `anon`/`authenticated` en todas las tablas de `public`, más `ALTER DEFAULT PRIVILEGES` para que las tablas futuras no los reciban. `service_role` y `postgres` conservan sus privilegios.

**Alternatives:** No hacer nada. Hoy no es explotable a través de la API: PostgREST no expone TRUNCATE y no existe ninguna RPC que lo invoque.

**Reason:** DEC-009 dice que la BD debe limitar el daño *aunque el cliente esté comprometido*. TRUNCATE es precisamente el privilegio que saltaría RLS si en el futuro se añade una función `SECURITY DEFINER` o una RPC descuidada. El coste de revocarlo es cero y elimina la clase de fallo entera. Se clasifica como defensa en profundidad, no como brecha activa — el hallazgo no se exagera.

**Consequences:** Toda migración que cree una tabla en `public` debe repetir el REVOKE, igual que repite `ENABLE ROW LEVEL SECURITY`. El `ALTER DEFAULT PRIVILEGES` cubre las tablas creadas por el rol `postgres`, pero no es infalible si se crean con otro rol: el REVOKE explícito sigue siendo obligatorio.

**Future reconsideration:** No previsto.

---

## DEC-024 — El carrito pertenece a un único mercado; nunca se mezclan

**Status:** Accepted *(Fase 5, 2026-09-01)*

**Context:** El carrito vive en `localStorage`, que es por origen (dominio), no por mercado. `docs/07-MULTI-MARKET.md` §3 establece que en producción cada mercado tiene su propio deploy y su propio proyecto Supabase, y §4 que las URLs no llevan prefijo de mercado. Aun así, un mismo origen puede acabar sirviendo otro mercado (cambio de `NEXT_PUBLIC_MARKET` en un deploy, entorno de desarrollo compartido, o un dominio reutilizado). En ese caso el carrito guardado contendría `variantId` de un catálogo que no existe en el mercado activo.

**Decision:** El carrito es de un solo mercado. Se persiste `marketId` en el envoltorio de `localStorage` y en cada línea. Al restaurar:
1. `storage.ts` descarta el carrito completo si su `marketId` no coincide con el mercado activo, y borra la entrada.
2. `reducer.ts` (`HYDRATE` → `sanitizeLines`) descarta además, línea a línea, cualquier `marketId` distinto — doble red, porque el contenido de `localStorage` es manipulable.

No se migran ni se convierten líneas entre mercados: los precios están en monedas distintas y los `variantId` pertenecen a catálogos distintos (proyectos Supabase distintos en producción).

**Alternatives:**
- (a) Una clave de `localStorage` por mercado (`yi-store:cart:v1:ES`), conservando ambos carritos. Guarda estado de un mercado que este deploy no puede comprar y complica el borrado.
- (b) Ignorar el mercado y dejar que el checkout falle en Fase 6. Traslada el error al peor momento (al pagar) y con datos ya inconsistentes en pantalla.
- (c) Intentar reasignar las líneas al mercado activo. Imposible sin inventar equivalencias de producto y de precio.

**Reason:** Descartar es la única opción que no inventa datos comerciales (restricción de `KNOWN-CONSTRAINTS.md`) y falla pronto y en silencio, sin romper la navegación. El coste para el usuario real es nulo: en producción cada mercado es un dominio distinto, así que el caso solo aparece en desarrollo o tras un cambio de configuración.

**Consequences:** Cambiar `NEXT_PUBLIC_MARKET` en un deploy vacía el carrito de los usuarios de ese origen — comportamiento correcto y documentado. Cuando Colombia se active no hace falta código nuevo: la misma implementación sirve, solo cambia el mercado resuelto en servidor. El checkout de Fase 6 puede asumir que todas las líneas son del mercado activo.

**Future reconsideration:** Si algún día un mismo dominio sirviera varios mercados con selector en la UI (alternativa multi-tenant que `07-MULTI-MARKET.md` §3 deja abierta), habría que pasar a la opción (a).

---

## DEC-025 — Runner de tests: `node:test` nativo, sin dependencias nuevas

**Status:** Accepted *(Fase 5, 2026-09-01)*

**Context:** `docs/rules/testing.md` es explícito: "cada funcionalidad que introduzca lógica crítica incorpora sus tests **en la misma fase** en que se construye — no se difieren a Fase 9", y nombra `lib/cart` entre los casos obligatorios. Pero el mismo documento cerraba con "Sin runner instalado. Instalación prevista únicamente en Fase 9", y `10-ROADMAP.md` sitúa la elección de runner (recomendando Vitest) en Fase 9. Contradicción real: la Fase 5 debe entregar tests del reducer y no había con qué ejecutarlos.

**Decision:** Usar el runner nativo de Node (`node --test`) con type stripping (`--experimental-strip-types`), disponible en el Node 22 que ya exige el proyecto. Cero dependencias nuevas. Scripts: `npm test` y `npm run test:watch`.

Consecuencia técnica aceptada: el runner nativo resuelve ESM real, sin bundler, así que los tests importan con extensión (`../reducer.ts`) y se ha activado `allowImportingTsExtensions` en `tsconfig.json` (seguro con `noEmit: true`). Los módulos de `lib/cart` que deben ser testeables usan solo `import type` entre sí, de modo que sus imports se borran al ejecutar.

**Alternatives:**
- (a) Instalar Vitest ahora. Es la recomendación de `10-ROADMAP.md` para Fase 9, pero `docs/rules/frontend.md` #17-18 exige justificación explícita para cada dependencia y "por defecto la respuesta es no". Vitest arrastra su propio ecosistema para algo que Node ya cubre en lógica pura.
- (b) No escribir tests y diferirlos a Fase 9. Incumple la regla vigente de `rules/testing.md` y deja sin red de seguridad la pieza de la que dependerá el checkout.
- (c) Escribir tests sin poder ejecutarlos. Tests que nunca se ejecutan no son tests.

**Reason:** Resuelve la contradicción por el camino más barato y reversible. La lógica que hay que cubrir hoy es pura (regla 1 y 6 de `rules/testing.md`: sin mocks de Supabase, sin React), justo lo que `node:test` cubre sin ayuda.

**Consequences:** `npm test` existe desde ahora, debe ejecutarse en la validación local de cada tarea (`rules/testing.md` #10) y **corre en CI** (`.github/workflows/ci.yml`, antes del preflight de secrets: no necesita Supabase). Esta decisión NO cierra la de Fase 9: cuando lleguen tests de componentes React o E2E, `node:test` no basta y habrá que evaluar Vitest + Testing Library y Playwright — entonces se migran estos tests, que son `describe`/`test`/`assert` estándar y portables. `--experimental-strip-types` es experimental en Node 22 (estable a partir de Node 23.6/24); si el proyecto sube de Node, la bandera se puede retirar.

**Future reconsideration:** Fase 9, al necesitar tests de componentes o E2E.

---

## DEC-026 — Los pedidos se crean con una función SECURITY DEFINER, no con service_role

**Status:** Accepted *(Fase 6, 2026-09-01)*

**Context:** `orders`, `order_items`, `order_events` y `customers` solo tienen policies de admin (`for all to authenticated using is_admin()`) — verificado contra la instancia real: un cliente anónimo **no puede insertar nada**. Además el cliente JS de Supabase **no puede ejecutar transacciones multi-sentencia**, y registrar un pedido son cinco escrituras (descontar stock, upsert de cliente, `orders`, `order_items`, `order_events`) que deben ser atómicas: si falla la tercera, el stock ya descontado tiene que volver.

**Decision:** Una única función `public.create_order(...)` en PostgreSQL, `SECURITY DEFINER`, con `set search_path = public`, propiedad de `postgres`. Recibe **solo** `variant_id` + `quantity` + datos de contacto + `client_request_id`, y resuelve dentro de la BD el precio, el nombre, el color, la talla, el SKU, el stock y los totales. Se invoca con la **anon key**: `revoke all ... from public` + `grant execute to anon, authenticated`.

Las tablas siguen sin ninguna policy pública de INSERT: la función es el único camino por el que un anónimo puede escribir en el dominio de pedidos.

**Alternatives:**
- (a) `service_role` desde una Server Action (`lib/supabase/admin.ts` + dependencia `server-only`). Da bypass total de RLS a código de aplicación, añade una dependencia y **sigue sin resolver la atomicidad**: haría falta lógica de compensación manual para deshacer el stock si falla un INSERT posterior.
- (b) Policies de INSERT para `anon` sobre `orders`/`order_items`/`customers`. Contradice `08-SECURITY.md` ("tablas 100% privadas") y permitiría forjar pedidos con importes arbitrarios: RLS no puede recalcular el precio contra `product_variants`.

**Reason:** Es la única opción que consigue a la vez atomicidad real, decremento de stock resistente a concurrencia, cero uso de la service role key en la aplicación y RLS intacta. El precio no se puede falsificar porque **la función ni siquiera lo recibe**.

**Consequences:**
- Cambiar el cálculo del pedido implica una migración SQL, no un despliegue de la app. Es deliberado: la lógica de dinero vive donde está el dato.
- `create_order` es un endpoint REST público. Un atacante puede invocarlo, pero solo puede crear pedidos legítimos a precios reales. Queda como riesgo residual el spam de pedidos que consume stock (mitigación: rate limiting, Fase 10).
- Cuando llegue el pago online (Fase 11), `OnlinePaymentChannel` reutiliza esta misma función: crear el pedido y cobrarlo son pasos distintos.

**Future reconsideration:** Si aparecen reglas de precio que necesiten datos externos a PostgreSQL (por ejemplo, impuestos calculados por un tercero).

---

## DEC-027 — Formato de `order_number`: `YI-ES-000001`

**Status:** Accepted *(Fase 6, 2026-09-01 — resuelve la decisión abierta asignada a Juan)*

**Context:** `DECISIONS.md` dejaba "formato definitivo de `order_number`" como decisión humana para Fase 6. `03-DATABASE.md` §2.12 y `DOMAIN-MODEL.md` ya usaban `YI-CO-000123` como ejemplo.

**Decision:** `YI-<MERCADO>-<6 dígitos>`, correlativo **por mercado**, decidido por Juan. El contador vive en una tabla nueva `order_counters (market_id, last_number)`; `create_order` hace `insert ... on conflict do update set last_number = last_number + 1 returning`, que bloquea la fila y serializa la numeración sin duplicados bajo concurrencia.

**Alternatives:** formato con fecha (`YI-ES-260901-001`) o sufijo aleatorio (`YI-ES-7K3M9Q`). El aleatorio no es adivinable —mejor privacidad— pero no es ordenable y es incómodo de dictar por teléfono.

**Reason:** Coincide con la documentación existente, es corto de leer en voz alta por WhatsApp (que es literalmente su función) y ordena cronológicamente.

**Consequences:**
- El número **revela el volumen de pedidos** del negocio y es adivinable. Por eso `/pedido/[numero]` **no** consulta la BD y no existe ningún endpoint que devuelva un pedido por su número: enumerar `YI-ES-000001…N` no da acceso a nada.
- `order_counters` no tiene lectura pública (revelaría el mismo volumen).
- Un pedido que falla consume número (la secuencia no se reutiliza): habrá huecos, y es correcto.

**Future reconsideration:** Si el volumen de ventas pasa a ser información sensible, migrar a sufijo aleatorio sin tocar el resto del sistema.

---

## DEC-028 — Idempotencia por `client_request_id` + fingerprint del payload

**Status:** Accepted *(Fase 6, 2026-09-01)*

**Context:** Un doble clic, una recarga tras un timeout o dos pestañas abiertas pueden disparar el checkout varias veces. Deshabilitar el botón en React no es una garantía: la Server Action es un endpoint público y el estado del cliente no es autoridad.

**Decision:** El cliente genera un UUID v4 por intento de checkout y lo envía como `client_request_id`. `orders` gana esa columna con un **índice UNIQUE parcial**, más `client_request_fingerprint` = `md5` del payload normalizado (ítems ordenados por `variant_id` + teléfono normalizado). `create_order` comprueba la clave **antes de tocar nada**:

- clave conocida **y** fingerprint igual → devuelve el pedido existente con `reused: true`. No descuenta stock, no crea cliente, ni pedido, ni líneas, ni evento.
- clave conocida **y** fingerprint distinto → `IDEMPOTENCY_KEY_REUSED`, sin modificar absolutamente nada.

La garantía la da PostgreSQL, no el botón.

**Alternatives:** solo bloqueo de UI (`useTransition`); cubre el doble clic pero no la recarga ni las dos pestañas.

**Reason:** El coste era una columna y un índice, y elimina la clase entera de "pedido duplicado", que en una tienda significa cobrar dos veces o reservar el doble de stock.

**Consequences:**
- El fingerprint incluye el teléfono: cambiar de destinatario con la misma clave se considera otro pedido y se rechaza.
- El orden de los ítems no afecta (se normaliza antes), así que un reintento legítimo nunca se confunde con una reutilización.
- La UI regenera la clave al desmontar el formulario: modificar el carrito y volver es un pedido distinto.
- `md5` es de `pg_catalog` (no necesita pgcrypto ni depende de `search_path`); se usa como comparación de igualdad, no como primitiva de seguridad.

**Future reconsideration:** Si se añaden más campos al pedido (dirección de envío en Fase 11), deben entrar en el fingerprint.

---

## DEC-029 — Sin Zod: validación manual también para el input del checkout

**Status:** Accepted *(Fase 6, 2026-09-01)*

**Context:** Se pidió reconsiderar explícitamente la decisión previa sobre Zod ahora que entra el primer input verdaderamente no confiable (dinero, stock, pedidos). `docs/rules/backend.md` #3 dice "validación manual con TypeScript. Sin zod hasta justificarlo".

**Decision:** No instalar Zod. La validación vive en `lib/checkout/validation.ts` (pura y testeada) y se repite entera dentro de `create_order`.

**Alternatives:** instalar Zod y validar el payload en la Server Action.

**Reason:** El payload no confiable es diminuto: una lista de `{uuid, entero}` más dos strings. Zod no aportaría nada que estas ~40 líneas no hagan, y **no resolvería el problema real**: como recuerdan los propios docs de Next 16, *"schema validation only checks the shape of the input"* — que la variante exista, esté activa, pertenezca al mercado y tenga stock no lo puede comprobar ningún esquema, solo la base de datos. Añadir una dependencia que valida lo fácil mientras lo difícil sigue en SQL sería confundir cobertura con seguridad.

**Consequences:** Cada campo nuevo del checkout exige añadir su guard y su test a mano. Si el input llegara a crecer mucho (formularios de dirección, facturación), se reevalúa.

**Future reconsideration:** Fase 11, si el checkout online multiplica los campos del formulario.

---

## DEC-030 — Teléfono y nombre obligatorios en el checkout

**Status:** Accepted *(Fase 6, 2026-09-01)*

**Context:** Contradicción real entre documentación y esquema. `06-WHATSAPP.md` §3 declaraba `customer?: { name?, phone? }` como **opcional**, pero el esquema exige `orders.customer_id NOT NULL` y `customers.phone NOT NULL` con `UNIQUE(market_id, phone)`. No se puede crear un pedido sin cliente.

**Decision:** El checkout pide **nombre y teléfono, ambos obligatorios** (decisión de Juan). El teléfono se normaliza a E.164 sin `+`, igual que `settings.whatsapp_number`. El cliente se crea o se reutiliza por `(market_id, phone)`, así que repetir compras no duplica registros.

**Alternatives:**
- Solo teléfono obligatorio: menos fricción, pero el admin vería pedidos sin nombre.
- Sin formulario, haciendo `customer_id` nullable: exigiría migración, contradice `DOMAIN-MODEL.md` ("Customer: comprador identificado por su WhatsApp") y dejaría pedidos huérfanos sin forma de contactar a nadie si el usuario nunca envía el mensaje.

**Reason:** El pedido se registra **antes** de abrir WhatsApp precisamente para que exista trazabilidad aunque el mensaje no se envíe (`06-WHATSAPP.md` §1). Un pedido sin contacto no cumpliría esa función.

**Consequences:** Se corrige `06-WHATSAPP.md` §3 para que el contrato refleje el esquema. Sin cuentas ni login: el cliente sigue siendo un registro operativo, no una identidad de acceso. Se recogen los datos mínimos: nada de dirección ni email en esta fase.

**Future reconsideration:** Fase 11 (pago online) necesitará dirección de envío; entonces se amplía el formulario y el fingerprint de DEC-028.

---

## DEC-031 — `proxy.ts` mantiene la sesión viva; la autorización vive más abajo

**Status:** Accepted *(Fase 7, 2026-09-02)*

**Context:** `08-SECURITY.md` §5 describía `proxy.ts` como una comprobación puramente sintáctica ("¿existe una cookie `sb-*`?"), sin llamadas de red. Al implementarlo apareció un problema que esa descripción no contemplaba: **un Server Component no puede escribir cookies**. El `setAll` de `lib/supabase/server.ts` está envuelto en un `try/catch` que falla en silencio precisamente por eso. Consecuencia: cuando el access token de Supabase caduca (1 h por defecto), `@supabase/ssr` lo renueva dentro del layout pero **no puede persistir la cookie renovada**, y el refresh token se reintenta en cada request hasta que la sesión muere. El admin sería expulsado al login sin motivo aparente.

El `proxy.ts` es el único punto del ciclo de request que puede escribir cookies en la respuesta antes de que se renderice la ruta.

**Decision:** `proxy.ts` (matcher `/admin/:path*`) hace exactamente dos cosas:

1. **Renovar la sesión.** Crea un cliente `@supabase/ssr` sobre la request, llama a `supabase.auth.getUser()` —que valida el JWT contra Supabase y dispara el refresh si hace falta— y escribe las cookies resultantes en un `NextResponse`. Las cookies renovadas se copian también a los redirects (`withSessionCookies`).
2. **Guard optimista de UX.** Sin sesión válida y fuera de `/admin/login` → redirect a `/admin/login?next=<ruta>`.

**`proxy.ts` NO comprueba `is_admin()` y no es autoridad de nada.** El reparto queda:

```
proxy.ts       → mantener la sesión viva + redirección de cortesía   (UX)
layout /admin  → getUser() + is_admin(): QUIÉN eres                  (real)
Server Action  → re-verifica en cada mutación: QUÉ puedes hacer      (real)
RLS/PostgreSQL → lo impide aunque todo lo anterior falle             (definitiva)
```

Detalles de implementación derivados de la decisión:

- La comprobación de rol vive en `lib/admin/auth.ts` (`getAdminAccess`, envuelta en `cache()`): es el patrón "Data Access Layer" que recomiendan los propios docs de Next 16 para autenticación, y evita repetir la llamada de red entre layout, página y action de la misma request. La autoridad del rol sigue siendo la función SQL `public.is_admin()`; el código TypeScript no reimplementa el criterio.
- El guard vive en `app/admin/(panel)/layout.tsx`, no en `app/admin/layout.tsx` como decía `05-ADMIN.md` §2: ese layout envolvería también a `/admin/login` y el guard se redirigiría a sí mismo en bucle. Los route groups `(panel)` y `(auth)` separan lo protegido de lo público **sin cambiar ninguna URL**.
- Una sesión válida **sin** rol admin no se redirige: se le muestra "Acceso denegado" con botón de salir. Redirigirla al login produciría el ping-pong `login → /admin → login`.
- `?next=` pasa por `safeAdminRedirect()` (función pura, testeada): solo se aceptan rutas internas de `/admin`, nunca absolutas, protocol-relative ni con backslashes. Sin eso el login sería un open redirect.

**Alternatives:**
- (a) *Proxy literal a `08-SECURITY.md` §5 (solo mirar si la cookie existe).* Cero llamadas de red, pero nadie persiste la renovación: la sesión del admin muere a la hora y la causa sería invisible.
- (b) *Sin `proxy.ts`, solo layout + actions + RLS.* Sigue siendo seguro —proxy nunca fue la autoridad— pero deja el bug de expiración sin resolver y contradice `rules/security.md` #2.
- (c) *Refrescar desde el cliente de navegador.* `@supabase/ssr` escribe cookies desde `document.cookie`, así que funcionaría, pero exigiría montar un cliente Supabase en el navegador solo para eso e impediría `httpOnly` (ver abajo).

**Reason:** Es el único punto donde la renovación puede persistirse, y hacerlo ahí no debilita nada porque el proxy no decide permisos. Los propios docs de Next 16 avisan de por qué esta separación es obligatoria y no estética: *"Server Functions are POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls… Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone."* Un cambio de `matcher` o mover una action de archivo puede dejarla fuera del proxy sin que nada falle a la vista.

**Consequences:**
- Cada request a `/admin/**` hace una llamada a Supabase Auth. Es aceptable: el panel es de bajo tráfico y ya es `force-dynamic`. El `matcher` deja la tienda pública completamente fuera (verificado: `/`, `/carrito`, `/checkout`, `/producto/*` y `/pedido/*` no reciben ni una cabecera `Set-Cookie`).
- **Borrar `proxy.ts` no da acceso a ningún dato administrativo.** Verificado empíricamente, no deducido: un usuario autenticado sin rol atraviesa el proxy (tiene sesión), y aun así el layout le muestra "Acceso denegado", la API le devuelve 0 filas de `orders`/`order_items`/`order_events`/`customers`/`order_counters` y su intento de auto-insertarse en `profiles` con `role='admin'` se rechaza.
- **Endurecimiento colateral (hallazgo real):** `@supabase/ssr` **no** marca `httpOnly` en las cookies de sesión (`DEFAULT_COOKIE_OPTIONS = { path, sameSite: 'lax', httpOnly: false, maxAge }`), porque su cliente de navegador necesita leerlas — pero `08-SECURITY.md` §2 afirmaba que la cookie era httpOnly. Se comprobó sirviendo el build: la cabecera `Set-Cookie` llegaba sin `HttpOnly`. Como el panel es 100% server-side y ningún componente cliente instancia `lib/supabase/browser.ts`, se fuerza `httpOnly: true` en `lib/supabase/cookies.ts` (usado por `server.ts` y `proxy.ts`). `Secure` se deriva del protocolo de `NEXT_PUBLIC_SITE_URL`, no de `NODE_ENV`: `next start` en local corre con `NODE_ENV=production` sobre http y marcar `Secure` ahí impediría el login local. **Si algún día un Client Component necesita el cliente de navegador autenticado, la respuesta correcta es mover esa lectura al servidor, no quitar `httpOnly`.**

**Future reconsideration:** Si aparece un caso legítimo que exija leer la sesión desde el navegador, o si el coste de la llamada de auth por request llegara a importar (no antes de tener tráfico real medido).

---

## DEC-032 — La máquina de estados del pedido vive en PostgreSQL, con `SECURITY INVOKER`

**Status:** Accepted *(Fase 7, 2026-09-02)*

**Context:** Cambiar el estado de un pedido no es un `UPDATE`: son hasta 2 + N escrituras que deben ocurrir juntas —`UPDATE orders`, `INSERT order_events` y, al cancelar, un `UPDATE` de stock por cada línea—. El cliente JS de Supabase **no ejecuta transacciones multi-sentencia**, así que hacerlo desde TypeScript dejaría estados intermedios posibles: pedido cambiado sin auditoría, o stock devuelto a medias. Además la validación de qué transición es legal debe ejecutarse contra el estado REAL del pedido, no contra el que el navegador cree que tiene.

**Decision:** Migración `0019`: `public.admin_update_order_status(p_order_id, p_to_status, p_note, p_payment_confirmed)`, en PL/pgSQL, **`SECURITY INVOKER`**, `set search_path = public`, `revoke all from public` + `grant execute to authenticated`, y un `if not public.is_admin() then raise 'FORBIDDEN'` como primera línea.

Hace, en una sola transacción: bloquear el pedido con `select … for update`, validar la transición contra la tabla de transiciones permitidas, exigir `p_payment_confirmed` si el destino es `paid`, devolver stock si el destino es `cancelled` (DEC-033), escribir el nuevo estado e insertar el `order_event` con `actor_id = auth.uid()`.

**Por qué `SECURITY INVOKER` y no `DEFINER` como `create_order`:** `create_order` (DEC-026) es `DEFINER` porque su llamante es **anónimo** y no tiene ninguna policy sobre las tablas de pedidos. Aquí el llamante es un **admin autenticado que ya tiene policies** (`admin_all_orders`, `admin_insert_order_events`, `admin_all_product_variants`). Al ejecutarse como el invocador, **RLS se sigue aplicando fila a fila dentro de la función**: no se abre ninguna vía de bypass, y el `is_admin()` explícito es una segunda barrera, no la única. Elegir `DEFINER` habría añadido superficie de bypass sin necesidad.

**Alternatives:**
- (a) *`SECURITY DEFINER`*, por coherencia con Fase 6. Innecesario y peor: ver arriba.
- (b) *Lógica en TypeScript con varias llamadas.* Sin atomicidad ni bloqueo; la validación de transición dejaría de ser autoridad de BD y el cliente podría competir consigo mismo.

**Reason:** Es la única forma de que "estado + evento + stock" no puedan quedar desparejados, y de que la legalidad de una transición se decida sobre el pedido bloqueado.

**Consequences:**
- Las transiciones son las de `05-ADMIN.md` §4.4 y **`delivered` y `cancelled` son terminales**; no se puede retroceder ni repetir el estado actual. El historial es append-only y un pedido no "des-ocurre".
- `paid` exige `p_payment_confirmed = true`: ni siquiera una llamada directa a la RPC puede marcarlo de pasada (KNOWN-CONSTRAINTS, `AI-DEVELOPMENT.md` §10 punto 5). Sigue sin existir ningún camino automático a `paid`.
- `lib/admin/orders.ts` mantiene un **espejo** de la tabla de transiciones para decidir qué botones pintar. **No protege nada**, y hay un test que compara ese espejo con el `case` de la migración para que no puedan divergir en silencio.
- Cambiar las transiciones exige una migración SQL, no un despliegue.

**Future reconsideration:** Si aparecen estados nuevos (devoluciones, reembolsos) o roles con permisos parciales.

---

## DEC-033 — Cancelar un pedido devuelve el stock, siempre y exactamente una vez

**Status:** Accepted *(Fase 7, 2026-09-02)*

**Context:** `create_order` descuenta stock al **crear** el pedido (Fase 6). Hasta ahora nada lo devolvía: `CURRENT-STATE.md` lo listaba como deuda y `10-ROADMAP.md` asignaba la acción compensatoria a Fase 7.

**Decision:** Dentro de `admin_update_order_status`, cuando el destino es `cancelled` se recorren las líneas del pedido y se hace `update product_variants set stock = stock + quantity`. Se devuelve **siempre**, venga el pedido del estado que venga (`delivered` no es cancelable).

Garantía de "exactamente una vez": solo se llega a la devolución desde un estado no-`cancelled`, y la fila del pedido está bloqueada con `select … for update` desde antes de validar la transición. Un doble clic, dos pestañas o dos admins simultáneos se serializan; el segundo ve el pedido ya cancelado y recibe `TRANSITION_NOT_ALLOWED` sin tocar stock.

Las líneas con `variant_id is null` (variante borrada del catálogo — `on delete set null`) **no devuelven stock a ningún sitio**: se cuentan y se dejan escritas en la nota del evento. No se inventa a qué variante devolverlas.

**Alternatives:**
- (a) *Restaurar solo desde `pending`/`contacted`/`confirmed`.* Más conservador con el inventario físico si el pedido ya salió del almacén, pero deja al admin corrigiendo stock a mano en toda devolución.
- (b) *No restaurar en Fase 7.* Deja el ciclo operativo a medias, que es justo lo que esta fase debía cerrar.

**Reason:** El descuento ocurrió al crear, así que la operación inversa pertenece a la cancelación. Hacerlo dentro de la misma transacción que el cambio de estado es lo que garantiza que no puedan desincronizarse.

**Consequences:**
- El evento de cancelación deja constancia literal: `[stock devuelto: N uds en M lineas]`, y menciona las líneas sin variante viva cuando las hay.
- Cancelar un pedido ya `shipped` devuelve stock aunque la mercancía haya salido físicamente. Es coherente con el modelo (se descontó al crear) y queda auditado; si el negocio necesitara distinguir "devolución recibida" de "cancelación", eso serían estados nuevos, no un cambio aquí.
- Verificado contra Supabase real: cancelación simple, cancelación repetida, **10 cancelaciones simultáneas** (exactamente una triunfa, el stock vuelve una vez, un solo evento) y línea sin variante viva.

**Future reconsideration:** Si se añade un flujo de devoluciones con estados propios.

---

## DEC-034 — Capa de datos administrativa con sesión, sin `service_role`, con guard en cada función

**Status:** Accepted *(Fase 7, 2026-09-02)*

**Context:** El panel necesita leer `orders`, `order_items`, `order_events`, `customers`, catálogo y `settings`. `08-SECURITY.md` §2 preveía `lib/supabase/admin.ts` con la service role key desde Fase 1, pero nunca se creó porque nunca hizo falta.

**Decision:** `lib/data/admin/{orders,catalog}.ts` usando `lib/supabase/server.ts` — **anon key + la sesión del admin en cookies**. `lib/supabase/admin.ts` **sigue sin existir**: ninguna consulta del panel lo necesita, porque el admin autenticado ya tiene las policies que necesita. Las mutaciones viven en `app/admin/**/actions.ts` y todas empiezan por `requireAdmin()`.

**Además, cada función de la capa de datos lleva su propio `requireAdmin()`** y devuelve vacío si falla. Esto no es paranoia decorativa, sino la corrección de un hallazgo real de esta fase: **en RSC el layout y la página se renderizan en paralelo**. Que `app/admin/(panel)/layout.tsx` devuelva "Acceso denegado" sin pintar sus `children` **no impide que la página hermana se haya renderizado**, y su payload viaja igualmente en el HTML. Se comprobó sirviendo el build: el HTML que recibía un usuario sin rol contenía el árbol de la página. No filtraba ni un dato —RLS devolvía 0 filas— pero apoyarse solo en eso es exactamente la barrera única que DEC-031 prohíbe.

**Alternatives:**
- (a) *Crear `lib/supabase/admin.ts` con service role.* Daría bypass total de RLS a código de aplicación para leer justo las tablas más sensibles, sin ninguna consulta que lo requiera.
- (b) *Confiar solo en el guard del layout.* Descartada por el hallazgo de arriba.

**Reason:** Con la sesión del admin, RLS sigue siendo la autoridad y un fallo de código no puede filtrar datos privados. Y el guard por función convierte la capa de datos en el punto de estrangulamiento único que recomiendan los propios docs de Next 16 ("Data Access Layer").

**Consequences:**
- Toda consulta administrativa filtra además por `market_id` (DEC-008): el panel no mezcla ES y CO. Ojo — **las policies de admin NO filtran por mercado** (un admin lo ve todo), así que ese filtro es responsabilidad del código; por eso existe `variantBelongsToMarket()` antes de dejar que una action toque una variante.
- Las mutaciones actualizan **columnas concretas**, nunca un objeto que venga del cliente: `market_id`, ids, `sku`, `color_id` y `size_id` no son editables desde el panel.
- Si algún día una tarea necesita de verdad la service role key (un cron, una importación), se crea `lib/supabase/admin.ts` con `import 'server-only'` y se registra aquí — no se añade "por si acaso".

**Future reconsideration:** Cuando aparezca una operación server-only que RLS no pueda expresar.

---

## DEC-035 — El admin solo puede escribir en mercados ACTIVOS

**Status:** Accepted *(Fase 8, 2026-09-02)*

**Context:** Hasta Fase 7 las policies de admin eran `for all to authenticated using (is_admin())` — sin mirar `market_id`. Daba igual porque el panel solo editaba filas existentes ya filtradas por código. **Con CRUD deja de dar igual:** un `insert` con `market_id = 'CO'` lo aceptaría RLS, y la única defensa sería el filtro de TypeScript. Eso es una barrera única, justo lo que DEC-031 y DEC-034 prohíben. La deuda estaba documentada en `CURRENT-STATE.md` de Fase 7 ("las policies de admin no filtran por mercado").

El obstáculo: **`profiles` no guarda a qué mercado pertenece un admin**, así que PostgreSQL no puede compararlo.

**Decision:** Migración `0020`. Las policies de admin de las tablas de catálogo y contenido añaden `public.is_active_market(market_id)` en `USING` **y** en `WITH CHECK`: `categories`, `products`, `promotions`, `shipping_methods`, `settings`, `home_content`, y —a través de su padre— `product_variants`, `product_images`, `promotion_products`, `promotion_categories`.

Como Colombia está inactiva (DEC-014), la base de datos rechaza cualquier escritura sobre CO venga de donde venga. Cuando Colombia se lance, `update markets set is_active = true` la habilita sin migración.

**NO se aplica** a `orders`, `order_items`, `order_events`, `customers` ni `order_counters`: son historial operativo y el admin debe poder leerlos y gestionarlos aunque un mercado se apague. Un pedido ya cobrado no deja de existir porque se desactive su mercado.

**Alternatives:**
- (a) *Añadir `profiles.market_id`.* Más expresivo y necesario el día que haya un admin por mercado, pero cambia el modelo de identidad (DEC-020) y hoy no existe ese caso.
- (b) *Dejar la defensa solo en código.* Es lo que había; con CRUD se convierte en una barrera única.

**Reason:** Cierra el hueco sin tocar el esquema ni la identidad, y reutiliza una función (`is_active_market`) que ya existía desde DEC-022.

**Consequences:**
- Un admin **no ve** el catálogo de un mercado inactivo. Es coherente con "el panel no mezcla ES y CO" y hace del `is_active` de `markets` un interruptor real, también hacia dentro.
- Si se desactivara ES, el panel se quedaría sin catálogo. Reactivarlo sigue siendo posible: la policy de `markets` no se tocó.
- Verificado contra la instancia real: crear producto/categoría/home/settings en CO → rechazado; **mover un producto de ES a CO → rechazado**; el catálogo de ES sigue funcionando (controles positivos).

**Future reconsideration:** Cuando se lance Colombia y haga falta que un admin gestione un solo mercado: entonces sí, `profiles.market_id`.

---

## DEC-036 — Un objeto por imagen, recomprimido a WebP en el servidor

**Status:** Accepted *(Fase 8, 2026-09-02 — decidido por Juan)*

**Context:** El plan gratuito de Supabase da 1 GB de Storage. `09-SEO-PERFORMANCE.md` §55 ya fijaba la estrategia de servicio ("Storage sirve el original; el optimizador de Next entrega WebP/AVIF"), pero no decía **qué original se guarda**. Un JPEG de móvil son ~4 MB: con 5 fotos por producto, 1 GB se agota en ~50 productos.

**Decision:** Se guarda **un único objeto por imagen** —ningún derivado en Storage; las variantes responsive las genera `next/image`— y ese objeto se recomprime en el servidor antes de subirlo: `sharp` aplica la orientación EXIF, reescala a 2000 px de lado mayor (`fit: inside`, sin ampliar) y codifica WebP q80.

`sharp` se declara como dependencia explícita (ya venía como transitiva de Next 16). Es la primera dependencia nueva desde Fase 1 y se registra aquí.

**Alternatives:**
- (a) *Guardar el original sin tocar.* Cero dependencias, pero ~50 productos por GB y fotos de 4 MB servidas al usuario.
- (b) *Convertir en el navegador con Canvas.* Cero dependencias de servidor, pero el archivo que llega sigue siendo no confiable y hay que revalidarlo igual; además la calidad depende del navegador.
- (c) *Transformaciones de imagen de Supabase.* Son de plan de pago.

**Reason:** Medido de verdad sobre el build servido con un JPEG de 4032×3024: el WebP resultante ocupó **13,2 veces menos**. Eso convierte ~50 productos por GB en varios cientos, sin degradación visible y sin cambiar la estrategia de servicio ya documentada.

**Consequences:**
- **La conversión es también una barrera de seguridad**, no solo de espacio: el objeto que acaba en el bucket lo genera `sharp`, no el cliente. Un payload escondido en el archivo original no sobrevive a la re-codificación.
- La validación de formato se hace por **magic bytes** (`lib/admin/images.ts`), no por `File.type` —que lo controla el navegador— ni por el `allowed_mime_types` del bucket, que confía en la cabecera de la subida. Verificado: un SVG y un PHP declarados como `image/png` son rechazados.
- Los buckets ganan `file_size_limit` (5 MiB) y `allowed_mime_types` (jpeg/png/webp) en la migración `0020`: el límite documentado pasa a ser también restricción de infraestructura. **SVG queda fuera a propósito**: puede llevar scripts y los buckets son de lectura pública.
- La ruta del objeto la compone el servidor a partir del slug **leído de la BD**, nunca del formulario, y es `{slug}/{uuid}.webp` — sin el bucket delante (`rules/database.md` #19).
- Objeto y fila viven en sistemas distintos sin transacción común: al subir se crea el objeto y luego la fila, y si la fila falla el objeto se borra (compensación); al borrar se elimina la fila y luego el objeto, de modo que un fallo deje un huérfano inofensivo en vez de una ficha rota.

**Future reconsideration:** Si se pasa a plan de pago, evaluar las transformaciones de Supabase y bajar el lado mayor a 1600 px.

---

## DEC-037 — La invalidación se hace por RUTA LITERAL, no por patrón ni por tags

**Status:** Accepted *(Fase 8, 2026-09-02)*

**Context:** Fase 7 dejó pendiente la invalidación por tags y usó `revalidatePath("/producto/[slug]", "page")`. Al probar el CMS sobre el build servido apareció un fallo real: **tras despublicar un producto, su ficha seguía respondiendo 200 con `x-nextjs-cache: HIT`**. Un producto retirado seguía comprándose. Publicar sí funcionaba, pero solo porque el producto era nuevo y no estaba en caché — un falso verde.

**Decision:** Invalidar por **ruta literal**: `revalidatePath('/producto/<slug>')`. Verificado: la siguiente petición responde `404` con `MISS`, y al republicar, `200` con `MISS`. Los propios docs de Next lo dicen: *"Use a literal path when you want to refresh a single page."*

Consecuencia de diseño: **toda action que cambie un producto necesita su slug**. Las de estado y borrado lo obtienen del `.select("id, slug")`; la de edición lee además el slug ANTERIOR, porque el slug puede cambiar y la ruta vieja también hay que invalidarla; las de imágenes ya lo tenían.

Los **tags siguen sin implementarse**, y es deliberado: el data layer usa el cliente de Supabase, no `fetch` con `next.tags`, así que no hay etiquetas que invalidar. Migrar a tags exigiría reescribir `lib/data/*` entero sin beneficio hoy.

**Alternatives:**
- (a) *Pasar la tienda a `force-dynamic`.* Resolvería la invalidación destruyendo SSG+ISR — exactamente lo que DEC-021 prohíbe hacer para tapar una limitación.
- (b) *Migrar el data layer a `fetch` etiquetado.* Reescritura grande; se puede hacer más adelante sin romper nada.

**Reason:** Es lo mínimo que resuelve el problema real sin tocar la estrategia de renderizado.

**Consequences:**
- Publicar, retirar, borrar, cambiar precio/stock y subir/borrar fotos se ven **al instante** en la tienda.
- **Limitación conocida:** un cambio del menú de categorías o de ajustes no invalida las fichas ya generadas (habría que enumerar todos los slugs); tardan hasta 5 min en reflejarlo. Es un desfase cosmético.
- **No verificado:** la invalidación del *chrome* de la tienda dio resultados inconsistentes entre ejecuciones (`MISS` una vez, `HIT` otras). No se declara correcta ni incorrecta; queda como pendiente de medir.

**Future reconsideration:** Al migrar el data layer a `fetch` etiquetado, o si el catálogo crece hasta hacer inviable la invalidación ruta a ruta.

---

## DEC-038 — Renumeración del roadmap: el CMS pasa a ser la Fase 8

**Status:** Accepted *(Fase 8, 2026-09-02 — decidido por Juan)*

**Context:** `10-ROADMAP.md` situaba en Fase 8 el trabajo de SEO/Performance. El CMS de catálogo no tenía número: en Fase 7 quedó como pendiente y se propuso como "Fase 7.5".

**Decision:** El CMS de catálogo es la **Fase 8**. SEO/Performance baja a 9, Testing a 10, Deploy a 11, Pagos a 12 y Expansión a 13.

**Reason:** Dependencia técnica real: `09-SEO-PERFORMANCE.md` exige un sitemap "con productos reales" y OG images "con imagen real del catálogo". Ambas cosas necesitan que exista una forma de crear productos e imágenes, que es precisamente lo que aporta el CMS. Hacer SEO antes habría generado un sitemap sobre el catálogo de prueba.

**Consequences:** Las referencias a "Fase 8 = SEO" en documentos anteriores quedan desfasadas; se corrigen donde aparecen. La numeración posterior se desplaza una posición.

**Future reconsideration:** No prevista.

---

## DEC-039 — El sitemap y el robots solo describen rutas que EXISTEN

**Status:** Accepted *(Fase 9, 2026-09-02)*

**Context:** `09-SEO-PERFORMANCE.md` §1 describe cuatro tipos de URL —home, `/categoria/[slug]`, `/producto/[slug]` e `/info/[slug]`— y dice que `app/sitemap.ts` lleve "productos activos + categorías activas + infos + home". Al auditar `app/` en Fase 9 se comprobó que **solo existen la home y `/producto/[slug]`**: no hay ruta de categoría ni de info. El menú de categorías del Header enlaza a `/#categorias`, un ancla de la home, no a una página propia.

**Decision:** El sitemap lista únicamente la home y las fichas de producto publicadas. `robots.txt` deniega `/admin` y `/api` (lo que pedía la doc) y además `/carrito`, `/checkout` y `/pedido`, que ya eran `noindex` por metadata.

**Alternatives:** (a) Listar las categorías igualmente — sería anunciar 404 a Google, que penaliza. (b) Crear `/categoria/[slug]` dentro de esta fase — es funcionalidad de catálogo, no de SEO, y no está en el alcance de la Fase 9.

**Reason:** Un sitemap es una promesa: cada URL que contiene debe responder 200. Se verificó recorriendo las 5 URLs del sitemap real sobre el build servido.

**Consequences:** `09-SEO-PERFORMANCE.md` §1 queda anotado con lo que sí existe. Cuando se cree `/categoria/[slug]`, añadirla al sitemap es una línea. La ausencia de esa ruta es también la razón de que el `BreadcrumbList` sea Inicio → producto y no Inicio → categoría → producto.

**Future reconsideration:** Al implementar `/categoria/[slug]` o `/info/[slug]`.

---

## DEC-040 — El placeholder blur vive en la BD, lo genera el servidor y mide 16 px

**Status:** Accepted *(Fase 9, 2026-09-02)*

**Context:** `09-SEO-PERFORMANCE.md` §57 da por hecho que el admin guarda un `blurDataURL` en la subida. La columna no existía; Fase 8 lo dejó anotado como deuda.

**Decision:** Migración `0022`: `product_images.blur_data_url text` NULLABLE, con un CHECK que exige el prefijo `data:image/webp;base64,` y una longitud de entre 32 y 4000 caracteres. Lo genera `sharp` durante la subida (16 px de ancho, WebP calidad 40 — 66 bytes reales medidos) dentro de `lib/storage/product-images.ts`. **Nunca se acepta un blur enviado por el navegador.**

**Alternatives:** (a) Guardar el placeholder como un segundo objeto en Storage: costaría una petición HTTP extra justo en el momento que se quiere optimizar y duplicaría el número de objetos del bucket, en contra de DEC-036. (b) Color dominante en vez de blur (la doc lo admite como alternativa): más pobre y no más barato, porque `sharp` ya tiene la imagen decodificada. (c) Calcularlo en el cliente: sería confiar en el navegador para producir un data URI que otros navegadores decodifican.

**Reason:** Un placeholder cuesta cientos de bytes en una fila que ya se lee para pintar la ficha. Y el CHECK en PostgreSQL hace que la regla "solo el servidor genera esto" no dependa de que ninguna Server Action se olvide de validar.

**Consequences:** Las 4 imágenes del seed conservan `blur_data_url IS NULL` y siguen funcionando sin placeholder: la migración **no reprocesa nada**. El backfill de las imágenes preexistentes queda PENDIENTE y declarado, porque exige descargar y reprocesar cada objeto — una operación externa, no una migración SQL.

**Future reconsideration:** Si se quisieran placeholders de más resolución, o al hacer el backfill.

---

## DEC-041 — Matriz de invalidación: ruta literal para lo concreto, `layout` para lo global

**Status:** Accepted *(Fase 9, 2026-09-02)* — extiende DEC-037, no la sustituye

**Context:** Fase 8 dejó dos cabos sueltos: (a) "la invalidación del chrome dio medidas inconsistentes: NO la declaro correcta"; (b) "un cambio de categorías no invalida las fichas ya generadas". Además, al auditar el código en Fase 9 se encontró que `app/admin/(panel)/pedidos/actions.ts` **seguía usando el patrón** `revalidatePath("/producto/[slug]", "page")` que DEC-037 había declarado inservible: cancelar un pedido devolvía stock que la ficha no mostraba hasta 5 minutos después.

**Decision:** Una matriz explícita, documentada en la cabecera de `lib/admin/revalidate.ts`:

- Mutación de UN producto (editar, publicar, retirar, archivar, borrar, variante, imagen) → `revalidatePath('/producto/<slug>')` + `revalidatePath('/')` + `revalidatePath('/sitemap.xml')`.
- Mutación GLOBAL (categorías, ajustes) → `revalidatePath('/', 'layout')` + sitemap.
- Pedido cancelado → se resuelven los slugs REALES de las líneas del pedido y se invalida cada ficha por ruta literal.
- **Ninguna llamada a `revalidatePath` con un patrón `[segmento]`**, en ningún archivo. Hay un test que lo comprueba recorriendo `app/`, `lib/` y `components/`.

**Alternatives:** (a) Migrar el data layer a `fetch` etiquetado o `unstable_cache` para poder usar `revalidateTag`: reescribir `lib/data/*` entero para ganar una granularidad que un catálogo de 4 productos no necesita, cuando las rutas afectadas se conocen exactamente en cada mutación. (b) `force-dynamic`: prohibido por DEC-021 — es tapar una limitación destruyendo la estrategia de render.

**Reason:** Medido, no supuesto. Se reprodujo el escenario sobre el build de Fase 8 **antes de tocar nada**: crear una categoría, forzar la regeneración de home y ficha con una acción real, borrarla con la Server Action real y medir `x-nextjs-cache`. Resultado idéntico en tres ejecuciones seguidas: `/` y `/producto/<slug>` responden `MISS` y ya no muestran la categoría. Es decir, **la deuda (b) de Fase 8 no era reproducible: `revalidatePath('/', 'layout')` sí invalida las fichas**, tal como dicen los docs de Next 16 ("invalidates the layout, all nested layouts beneath it, and all pages beneath them"). La medición inconsistente de Fase 8 venía de comprobar `settings.store_name`, que no se pinta en ninguna página pública.

**Consequences:** La invalidación global es un martillo: tira el caché de toda la tienda. Con este catálogo es lo correcto — el menú de categorías vive en el layout de `(store)` y lo pintan todas las páginas. El sitemap pasa a invalidarse en toda mutación de producto; sin eso, un producto retirado seguía anunciado a Google aunque su ficha ya diera 404. Se retira del código `revalidateProductPages()` (el patrón).

**Future reconsideration:** Si el catálogo crece hasta que invalidar toda la tienda por un cambio de categoría resulte caro, entonces sí tocará migrar a tags — con esa razón medida, no antes.

---

## DEC-042 — Headers de seguridad en Fase 9, sin CSP ni HSTS

**Status:** Accepted *(Fase 9, 2026-09-02 — decidido por Juan)*

**Context:** Contradicción documental detectada al auditar: `10-ROADMAP.md` lista "headers seguridad en next.config" entre las tareas de Fase 9, mientras que `08-SECURITY.md` §270 y `rules/security.md` #14 dicen "aplicar en Fase 10" — texto escrito antes de la renumeración DEC-038, cuando la 10 era el deploy y hoy es la 11.

**Decision:** Se aplican en Fase 9 los cuatro headers que enumera `08-SECURITY.md` §270: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` mínima. **No** se añade `Content-Security-Policy` ni `Strict-Transport-Security`.

**Alternatives:** (a) Añadir también CSP: Next inyecta scripts inline y Tailwind estilos inline, así que una CSP mal calibrada rompe la tienda de formas que **en este entorno no hay navegador para verificar**. (b) Dejarlo todo para el deploy: los cuatro headers son inertes y no dependen del dominio, así que retrasarlos no aportaba nada.

**Reason:** Se aplica lo que no puede romper nada y se difiere lo que exige medición en un navegador real contra el dominio de producción.

**Consequences:** `08-SECURITY.md` §270 y `rules/security.md` #14 se corrigen: los cuatro headers pasan a HECHO; CSP y HSTS quedan explícitamente en Fase 11. Ninguno de estos headers protege el panel: eso sigue siendo `proxy.ts` → layout → `requireAdmin()` → RLS.

**Future reconsideration:** CSP en modo `report-only` durante el deploy, promovida a `enforce` cuando el informe salga limpio.

---

## DEC-043 — Los agregados del panel se resuelven en PostgreSQL, no descargando filas

**Status:** Accepted *(Fase 9.5, Incremento 2, 2026-09-03)*

**Context:** `countOrdersByStatus()` hacía `select status from orders where market_id = ?` **sin límite** y contaba en JavaScript. Al medirlo con 5.000 pedidos reales apareció algo peor que un problema de rendimiento: **PostgREST devuelve como máximo 1000 filas** aunque no se pida límite. El dashboard, pasados los 1.000 pedidos, mostraba `{cancelled: 625, confirmed: 375}` y **cero en los otros seis estados, incluido `pending`**. El número más importante del panel mentía en silencio. `listProductsForAdmin` y `listLowStockVariants` tenían el mismo defecto.

**Decision:** Los agregados bajan a PostgreSQL en `admin_operations_summary(p_market_id)` (migración 0023), `SECURITY INVOKER`, que devuelve un `jsonb` de tamaño fijo con los ocho contadores, el total, el pedido abierto más antiguo y los recuentos de salud del catálogo. Todo listado del panel pagina con `range()` + `count: "exact"`.

**Alternatives:** (a) Ocho consultas `head: true` con `count=exact` — correcto pero son ocho viajes de red para lo que cabe en uno. (b) Subir el límite de PostgREST — cambia una configuración global de la instancia para tapar un patrón que de todas formas está mal.

**Reason:** Medido, no supuesto: 25.998 bytes y 1000 filas (truncadas) → 280 bytes y un objeto, con los conteos correctos. La latencia NO mejoró (299 → 381 ms): está dominada por el ida y vuelta a un Supabase remoto. La ganancia es **corrección** y payload, y así se documenta.

**Consequences:** `countOrdersByStatus` desaparece; la sustituye `getOperationsSummary`. `docs/rules/backend.md` §19-22 recoge la regla. Hay un test de integración que documenta el truncamiento de PostgREST para que nadie vuelva a contar sobre filas descargadas.

**Future reconsideration:** Si el resumen necesitara más agregados, se amplía el `jsonb`; el contrato ya es de tamaño fijo.

---

## DEC-044 — Índices del panel: solo con evidencia, y se elimina el que sobra

**Status:** Accepted *(Fase 9.5, Incrementos 2 y 3, 2026-09-03)*

**Context:** El plan de la fase proponía tres índices nuevos sobre `orders`. Se midieron con `EXPLAIN (ANALYZE, BUFFERS)` sobre 5.000 pedidos generados como fixture y borrados después.

**Decision:** Cuatro resultados, tres de ellos contrarios a lo previsto:

- `orders (market_id, status, created_at desc)` — **AÑADIDO**. El listado filtrado por estado descartaba filas a mano (`Rows Removed by Filter: 140` para devolver 20); con el compuesto ambas columnas entran en `Index Cond` y el coste del nodo baja de 204,98 a 65,29.
- `orders (market_id, created_at desc)` — **DESCARTADO**. Estaba en el plan y el planificador **no lo elige nunca**: con un solo mercado poblado prefiere `idx_orders_created_at`. Crearlo era pagar escritura a cambio de nada.
- `idx_orders_market_status` — **ELIMINADO**. Es prefijo estricto del compuesto. Comprobado quitándolo: el agregado sigue resolviéndose con Index Only Scan.
- `orders (market_id, updated_at) where status in (los seis abiertos)` — **AÑADIDO** (migración 0025). La cola operativa ordena por antigüedad del estado actual, cosa que ningún índice existente sabía servir: el plan hacía un `Sort` sobre las 3.750 filas abiertas para quedarse con 8. Con el índice parcial el `Sort` desaparece: **7,255 ms → 0,088 ms y 555 → 3 buffers**.
- `products (market_id) where deleted_at is null` — **AÑADIDO**. `idx_products_public` es parcial sobre `status='active'` y no sirve al panel, que lista también borradores y archivados.

**Reason:** "Por si acaso" no es una razón. Un índice que el planificador no usa solo encarece cada escritura.

**Consequences:** El índice de la cola es parcial a propósito: los pedidos terminales salen de él solos, así que no crece con el histórico. **Si algún día se añade un estado a la máquina de estados de la migración 0019, hay que revisar su predicado** — queda dicho en la propia migración.

**Future reconsideration:** Cuando CO se active y tenga volumen, volver a medir `(market_id, created_at desc)`.

---

## DEC-045 — El panel muestra antigüedad, no urgencia

**Status:** Accepted *(Fase 9.5, Incremento 3, 2026-09-03 — criterio fijado por Juan)*

**Context:** El centro operativo necesita responder "¿qué atiendo ahora?". La solución habitual es marcar en rojo lo que lleva más de X horas. Pero **YI Store no tiene definido ningún umbral de servicio**: nadie ha decidido cuándo un pedido va tarde.

**Decision:** El panel muestra la antigüedad objetiva ("hace 12 min", "hace 3 h", "hace 2 días") y **ordena por ella**. No pinta colores por tiempo, no dice "atrasado", "urgente" ni "problemático". La única etiqueta es **"el más antiguo"**, que es un hecho comprobable sobre la lista.

`lib/admin/age.ts` no exporta ningún umbral y hay un test que falla si alguien introduce un calificativo de ese tipo en su salida.

**Alternatives:** Inventar un umbral razonable (24 h, 48 h). Se descarta: el panel afirmaría algo que el negocio no ha decidido y, en cuanto la alarma salte cuando no toca, el admin aprende a ignorarla — que es peor que no tenerla.

**Reason:** El orden ya da toda la utilidad operativa. "El más antiguo" es información; "el más urgente" es una opinión disfrazada de dato.

**Consequences:** El día que el negocio fije un compromiso de respuesta, añadir la señal es trivial y entonces significará algo. Sí lleva rojo, en cambio, "producto publicado sin stock vendible": eso no depende del tiempo, es un hecho verificable y el fallo lo descubre el cliente.

**Future reconsideration:** Cuando Juan defina un tiempo de respuesta objetivo.

---

## DEC-046 — La antigüedad del estado sale de `orders.updated_at`

**Status:** Accepted *(Fase 9.5, Incremento 3, 2026-09-03)*

**Context:** La cola necesita saber cuánto lleva un pedido en su estado actual, no cuándo entró. La vía obvia era unir con `order_events` y tomar el evento más reciente.

**Decision:** Se usa `orders.updated_at`. Auditado: el **único** `UPDATE` sobre `orders` en todo el proyecto es el de `admin_update_order_status` (migración 0019), y el trigger `set_updated_at` lo sella. En un pedido que nunca se movió coincide con `created_at`.

**Alternatives:** Join a `order_events` con `max(created_at)` — misma información, una consulta más cara y un join que no aporta nada mientras esa invariante se mantenga.

**Reason:** Es exacto hoy y no cuesta nada. Verificado además que el trigger es `BEFORE UPDATE`, así que **`updated_at` no se puede falsificar ni con la service role key**: un `PATCH` que intente retrodatarlo es sobrescrito por PostgreSQL.

**Consequences:** La invariante queda escrita en el tipo `QueueOrder`. **Si algún día algo más actualiza `orders`** —notas en `orders.notes`, dirección de envío, cualquier campo—, `updated_at` dejará de significar "cuándo cambió el estado" y habrá que pasar al join con `order_events`. Está anotado donde se usa.

**Future reconsideration:** Al primer `UPDATE` nuevo sobre `orders` que no sea un cambio de estado.

---

## DEC-047 — Reponer stock es un DELTA; corregirlo es un valor absoluto con testigo

**Status:** Accepted *(Fase 9.5, Incremento 4, 2026-09-03)*

**Context:** `updateVariantAction` escribía un valor absoluto leído antes en el formulario: read → modify → write. Reproducido contra el proyecto real antes de tocar nada, con stock 12 y dos reposiciones simultáneas de +10 y +7:

```
esperado 29 · real 19  →  diez unidades desaparecidas en silencio
```

No hace falta un segundo administrador: basta con dos pestañas, o con dejar la ficha cargada mientras se cuentan cajas. Deshabilitar el botón no protege nada — un segundo POST se salta la UI.

**Decision:** Se separan dos operaciones que hasta ahora estaban mezcladas.

- **Reposición** ("han llegado 12") → **delta**, en `admin_restock_variants` (migración 0026): `stock = stock + delta` dentro de la transacción. Una suma no necesita saber sobre qué valor se decidió, así que es inmune a la pérdida de actualizaciones **por construcción**: la segunda transacción espera el bloqueo de fila y vuelve a leer. Verificado: diez reposiciones simultáneas de +4 sobre 0 dan 40.
- **Corrección** ("el recuento real es 7") → **valor absoluto con bloqueo optimista**. Sí necesita saber sobre qué valor se decidió, así que el formulario devuelve el `updated_at` que leyó y el `UPDATE` lo exige. Si otro admin guardó mientras tanto, no encuentra la fila y se avisa en vez de pisar.

**Alternatives:** (a) Bloqueo optimista también para la reposición: funcionaría, pero obligaría al admin a recargar y reintentar cada vez que otro repone a la vez, cuando lo correcto es que ambas reposiciones se sumen. (b) `SELECT ... FOR UPDATE` desde TypeScript: PostgREST no lo expone, y aunque lo hiciera serían dos viajes donde cabe uno.

**Reason:** Son dos intenciones distintas del negocio y merecen dos mecanismos distintos. Tratarlas igual es lo que causaba la pérdida de datos.

**Consequences:** La reposición vive en `/admin/inventario` y es en lote y atómica: si un elemento falla, no se aplica ninguno. El testigo del bloqueo optimista es `updated_at`, mantenido por el trigger `set_updated_at`; comprobado que el trigger es `BEFORE UPDATE`, así que **no se puede falsificar ni con la service role key**. `lib/admin/inventory.ts` valida el lote antes de la red, y la función SQL lo revalida todo dentro.

**Future reconsideration:** Si algún día hiciera falta saber POR QUÉ cambió un stock, entonces sí tocaría una tabla de movimientos. Hoy no responde a ninguna pregunta que alguien esté haciendo.

---

## DEC-048 — El lote de reposición revalida el mercado dentro de la transacción

**Status:** Accepted *(Fase 9.5, Incremento 4, 2026-09-03)*

**Context:** La policy `admin_all_product_variants` (migración 0020) exige que el producto padre esté en un mercado **ACTIVO**, no en el mercado **CONCRETO** del deploy. Hoy funciona porque Colombia está inactiva, pero apoyarse en eso es la barrera única que el proyecto rechaza desde la Fase 7.

**Decision:** `admin_restock_variants` recibe `p_market_id` —que pone el servidor desde `getActiveMarket()`, nunca un formulario— y lo comprueba contra **cada** variante del lote, sobre la fila y con `for update`. Si una no pertenece, **falla el lote entero**.

**Alternatives:** Ignorar en silencio los elementos que no pertenecen. Se descarta: un lote aplicado a medias es peor que uno rechazado, porque nadie sabría qué parte se aplicó ni por qué.

**Reason:** Es la primera escritura en LOTE del proyecto, y el lote es justo donde un id ajeno pasa desapercibido.

**Consequences:** Verificado con una variante real de CO en un lote de ES: la operación falla con `VARIANT_NOT_IN_MARKET`, CO no cambia y la variante legítima de ES tampoco. El mensaje al admin dice explícitamente que no se ha aplicado nada.

**Future reconsideration:** Cualquier operación en lote futura copia este patrón.

---

## DEC-049 — La dirección de envío vive en una nota interna, no en `shipping_address`

**Status:** Accepted *(Fase 9.5, Incremento 5A, 2026-09-03)*

**Context:** Auditado antes de tocar nada, el sistema NO dispone de ninguna dirección:

- `create_order` (migración 0018) recibe `(p_market_id, p_items, p_customer_phone, p_customer_name, p_client_request_id, p_source_url)`. **No hay ningún parámetro de dirección.**
- El formulario público solo valida teléfono y nombre (`lib/checkout/validation.ts`: `isValidPhone`, `isValidName`).
- `orders.shipping_address jsonb` existe desde la 0011 y **cero referencias en todo el repositorio** fuera de la propia migración: nadie la escribe ni la lee.

Para prepararlo todo, el administrador vuelve a WhatsApp a buscar la dirección que el cliente escribió días antes, y con ella se pierde cualquier otro acuerdo (horario, punto de recogida).

**Decision:** La dirección y los acuerdos van a `order_notes` (migración 0027) como texto libre que el administrador pega tal cual. **No se toca el checkout ni `shipping_address`.**

**Alternatives:** (a) Campo estructurado (calle/ciudad/CP/país) rellenado en el panel: exige decidir un formato, y ES y CO no comparten el mismo. (b) Pedir la dirección en el checkout: exige decidir obligatoria u opcional, formato por mercado, si viaja al mensaje de WhatsApp, y cambiar la firma de `create_order`. Ambas son **decisiones de negocio**, se consultaron y se descartaron para este incremento.

**Reason:** El problema operativo es que la información se pierda, no que no esté estructurada. Texto libre lo resuelve hoy, sirve igual para los dos mercados y no inventa ninguna regla comercial.

**Consequences:** `orders.shipping_address` queda como columna **sin usar y documentada como tal**; no se elimina porque eliminar una columna es irreversible y podría querer estructurarse más adelante. `orders.notes` sí se retira del `select` y del tipo `AdminOrderDetail`: viajaba por cuatro capas para no pintarse en ninguna pantalla.

**Future reconsideration:** Si algún día el envío necesita cálculo por zona o etiquetas automáticas, entonces sí hará falta una dirección estructurada — y entonces será una decisión de negocio tomada a propósito, no un `jsonb` vacío heredado.

---

## DEC-050 — Las notas del pedido son append-only y las firma `auth.uid()`, no el formulario

**Status:** Accepted *(Fase 9.5, Incremento 5A, 2026-09-03)*

**Context:** Reutilizar `order_events` para las notas abriría un segundo camino de escritura a la tabla que sostiene la auditoría del pedido. Verificado en la migración 0011: su policy de INSERT es literalmente `with check (public.is_admin())` y **no restringe `from_status` ni `to_status`**, así que un admin puede fabricar por POST directo una transición que nunca ocurrió. Hoy no importa porque el único camino que inserta ahí es `admin_update_order_status`; una Server Action de notas lo convertiría en una puerta.

**Decision:** Tabla propia `order_notes` (0027), con tres barreras:

- **Append-only**, copiando el patrón que `order_events` ya usa: solo policies de SELECT e INSERT, más `revoke update, delete on public.order_notes from authenticated, anon`.
- **Autoría no falsificable**: `actor_id uuid not null default auth.uid()` **y** `with check (public.is_admin() and actor_id = auth.uid())`. La diferencia con `admin_insert_order_events` es justo ese segundo predicado.
- **El pedido no llega como id**: la action recibe el NÚMERO y lo resuelve contra `orders` filtrando por el mercado activo del servidor.

**Alternatives:** (a) Poner `actor_id` desde la Server Action leyendo la sesión: funcionaría, pero la barrera estaría en el código de aplicación en vez de en la base. (b) Una RPC `admin_add_order_note`: no aporta nada que el DEFAULT y el WITH CHECK no den ya, y añade una función que mantener.

**Reason:** Una nota es constancia de lo que se dijo. Si se puede reescribir, borrar o firmar en nombre de otro, deja de ser constancia.

**Consequences:** Verificado contra el proyecto real (19 tests de integración + 17 E2E sobre el build): un admin recibe **403** al enviar `actor_id` de otro admin o un uuid inventado; PATCH y DELETE sobre una nota existente no la alteran; anon y autenticado-sin-rol reciben conjunto vacío (con control positivo de admin); dos admins escribiendo a la vez producen dos filas con su firma correcta; diez notas simultáneas son diez filas; una nota **no** cambia `orders.status`, **no** mueve `orders.updated_at` y **no** crea ningún `order_event`. El doble submit crea dos apuntes y es deliberado: una nota no es idempotente, igual que en una libreta.

**Future reconsideration:** Si hicieran falta notas editables (borradores), serían otra cosa distinta y otra tabla; esta no se vuelve mutable.

---

## DEC-051 — `btrim(text)` en PostgreSQL no es `String.prototype.trim()`

**Status:** Accepted *(Fase 9.5, Incremento 5A, 2026-09-03)*

**Context:** La migración 0027 validó el cuerpo de la nota con `check (length(btrim(body)) between 1 and 2000)`, dando por hecho que `btrim` recorta espacio en blanco como JavaScript. **No lo hace: `btrim(string)` con un solo argumento elimina únicamente espacios (U+0020)**, ni tabuladores ni saltos de línea.

Encontrado por el test de integración, no leyendo el código: un POST directo a PostgREST con `{"body": "\n\t "}` devolvía **201** y guardaba la fila. La validación de TypeScript sí la rechazaba, así que desde la interfaz era imposible — pero una Server Action no es la barrera, y la tabla es append-only: esa fila en blanco no se podría borrar después ni siendo admin.

**Decision:** Migración 0028. El CHECK pasa a `body ~ '\S' and length(btrim(body, E' \t\n\r\f\v')) <= 2000`: "contiene al menos un carácter que no es espacio en blanco" no depende de qué recorte `btrim`.

**Alternatives:** Dejarlo y confiar en la validación de TypeScript. Se descarta por la regla de siempre: la UI y la Server Action no son la barrera.

**Reason:** Cuando el CHECK y la validación de aplicación divergen, la que manda es la de la base — y era la más débil de las dos.

**Consequences:** Regresión cubierta en `order-notes.integration.test.ts` (rechaza `""`, `"   "` y `"\n\t "`) y en el E2E sobre el build. `parseNoteBody` y el CHECK coinciden ahora en el límite superior, comprobado en ambos lados con 2000 y 2001.

**Future reconsideration:** Cualquier CHECK futuro que recorte texto usa la misma forma; `btrim(col)` a secas queda descartado en este proyecto.

---

## DEC-052 — PUBLICABLE y VENDIBLE son dos cosas distintas

**Status:** Accepted *(Fase 9.5, Incremento 5B, 2026-09-03)*

**Context:** `unsellable_products` (migración 0023) mezclaba en un solo número dos situaciones que no se parecen en nada. La autoridad sobre qué es comprable es `create_order` (0018), porque es lo único que acepta o rechaza una compra de verdad, y sus rechazos son cuatro: `VARIANT_INACTIVE`, `PRODUCT_UNAVAILABLE`, `WRONG_MARKET` y `OUT_OF_STOCK`. De ahí, y **sin inventar nada**, salen dos conceptos:

- **PUBLICABLE**: tiene al menos una variante activa. Sin eso, `getProductBySlug` devuelve `null` y la ficha responde **404**.
- **VENDIBLE AHORA**: tiene al menos una variante activa **con stock**. Sin eso, la ficha responde 200 y muestra "Agotado".

**Decision:** Se separan, y se escriben una sola vez en SQL: `product_has_active_variant()` y `product_is_sellable()` (migración 0029). `admin_operations_summary` deja de repetir el predicado a mano y llama a la función.

**Alternatives:** Bloquear también la publicación de un producto agotado. **Se descarta**: el agotado ya es comportamiento intencionado y documentado — `AddToCartForm` pinta "Agotado" y desactiva la compra, `json-ld.ts` emite `OutOfStock`, y `01-PRODUCT.md` §102 lo lista como caso previsto. Bloquearlo contradiría una regla existente, y decidir si un agotado debe ocultarse sería una decisión de negocio que nadie ha tomado.

**Reason:** Un 404 y un "Agotado" se arreglan de forma distinta, y solo uno de los dos es un fallo.

**Consequences:** El filtro `/admin/catalogo?ver=no-vendibles` distingue ambos motivos y pone el 404 primero. `admin_unsellable_products` usa el MISMO predicado que el contador del resumen, con un test que comprueba que el número y la lista coinciden.

---

## DEC-053 — El sitemap anunciaba fichas que devuelven 404

**Status:** Accepted *(Fase 9.5, Incremento 5B, 2026-09-03)*

**Context:** `getProductBySlug` devuelve `null` si el producto no tiene ninguna variante activa, así que su ficha responde 404. Pero `getSitemapProducts` y `getAllProductSlugs` filtraban **solo** por `status='active'` — y el comentario del sitemap afirmaba textualmente "los MISMOS filtros que la ficha pública", que no era cierto.

Reproducido antes de tocar nada, con tres productos de prueba y el build servido:

```
/producto/zz-5b-sin-variantes      404   ← anunciado en sitemap.xml
/producto/zz-5b-variante-inactiva  404   ← anunciado en sitemap.xml
/producto/zz-5b-agotado            200   ← correcto: muestra "Agotado"
```

**Dos de las ocho URLs del sitemap eran 404**, y `generateStaticParams` las prerenderizaba. Contradice DEC-039 ("el sitemap solo describe rutas que EXISTEN").

**Decision:** Ambas consultas añaden `product_variants!inner(id)` + `is_active=eq.true`. El filtro lo resuelve PostgreSQL; no viaja ni una fila de más.

**Alternatives:** Filtrar en JavaScript después de descargar, como ya hacían `getFeaturedProducts` y el listado con `flatMap`. Se descarta por la regla de no filtrar en JS lo que PostgreSQL puede hacer.

**Reason:** El sitemap es una promesa a Google. Anunciar un 404 gasta presupuesto de rastreo y da señal de sitio descuidado.

**Consequences:** Verificado sobre el build servido: **las 8 URLs del sitemap responden 200**, el producto roto desaparece de él y deja de prerenderizarse, y el agotado sigue dentro (control positivo). El stock NO entra en el filtro: esconder un agotado sería una decisión de negocio distinta.

---

## DEC-054 — Publicar se valida en PostgreSQL, y solo en la ENTRADA a publicado

**Status:** Accepted *(Fase 9.5, Incremento 5B, 2026-09-03)*

**Context:** `setProductStatusAction` escribía `status='active'` sin exigir una sola precondición. Un producto vacío se publicaba de un clic.

**Decision:** Trigger `enforce_publishable_product` sobre `products` (migraciones 0029 → 0030 → 0031), con tres propiedades que costaron dos correcciones:

1. **En PostgreSQL, no en la Server Action** — un POST directo a PostgREST con `{"status":"active"}` pasa por RLS sin tocar TypeScript. Verificado: también recibe `NO_ACTIVE_VARIANT`.
2. **`deferrable initially deferred`** (0030) — se evalúa al COMMIT, no en la sentencia. Así, crear el producto ya publicado junto a sus variantes **en la misma transacción** sigue siendo válido, que es exactamente lo que hace `supabase/seed/04_products_es.sql`. En transacciones distintas —una petición de PostgREST por commit— no.
3. **Solo la transición hacia `active`** (0031) — la 0030 revalidaba en cualquier update, y eso dejaba **imposible de editar** un producto ya publicado al que alguien hubiera desactivado su última variante: corregirle el nombre fallaba. Castigaba al que intentaba arreglarlo.

**Alternatives:** Avisar en vez de bloquear. Se descarta: publicar algo cuya ficha da 404 no tiene ningún uso legítimo, a diferencia de publicar un agotado (DEC-052).

**Reason:** El único momento en que el sistema puede saber que va a publicar algo roto es cuando se lo piden.

**Consequences:** **No garantiza la invariante "publicado ⇒ publicable", y no puede**: desactivar la última variante de un producto publicado lo rompe, y **no se despublica nada automáticamente** (fuera de alcance). Ese estado lo señalan la alerta del resumen y el filtro. Efecto colateral en los tests: varios fixtures creaban el producto ya publicado y sus variantes después, en peticiones separadas — un estado publicado y roto, aunque fuera un instante. Se corrigieron al orden real (borrador → variantes → publicar), y el caso "publicado con variante inactiva" se monta ahora por el único camino por el que se alcanza en producción: publicar con variante activa y desactivarla después.

---

## DEC-055 — La auditoría registra DECISIONES, no todos los cambios de valor

**Status:** Accepted *(Fase 9.5, Incremento 5C, 2026-09-03)*

**Context:** Auditado antes de decidir, el stock se mueve por cuatro caminos y `order_events` ya cubre dos de ellos con actor, fecha y la nota `[stock devuelto: N uds en M lineas]`; el detalle por variante sale de `order_items.variant_id`.

| Camino | Función | ¿Auditar? |
|---|---|---|
| Venta | `create_order` (anon) | **No** — lo cubren pedido, línea y evento |
| Cancelación | `admin_update_order_status` | **No** — lo cubre `order_events` |
| Reposición | `admin_restock_variants` | Sí |
| Corrección absoluta | `updateVariantAction` | Sí |

**Decision:** `admin_change_log` (migración 0032) registra únicamente `products.status`, `products.deleted_at`, `product_variants.price` y `product_variants.stock`, y solo cuando el cambio es una decisión de una persona identificada.

> ⚠️ **Corregido por DEC-059 (migración 0033).** La 0032 usaba `auth.uid() is not null` como discriminante, dando por hecho que la venta llega siempre sin actor porque el checkout usa el cliente anónimo. Eso era una garantía de la APLICACIÓN, no de la base de datos, y **se reprodujo rompiéndola**. El discriminante correcto es `is_admin()`, y `create_order` se excluye explícitamente igual que la cancelación.

**Alternatives:** (a) Registrar todo cambio de stock, convirtiendo la tabla en un libro mayor: duplicaría `order_events` y crecería con cada venta. (b) No auditar nada: hoy un precio a 9 € en vez de 90 € es indetectable a posteriori, porque `updated_at` se mueve con cualquier edición y no dice quién.

**Reason:** "Cambió el valor" y "alguien decidió cambiarlo" son cosas distintas, y solo la segunda necesita responder *quién*.

**Consequences:** **El historial de stock TIENE HUECOS** — puede pasar de 24 a 20 sin una entrada, porque se vendieron cuatro unidades. Es una consecuencia asumida, no un fallo, y la interfaz lo dice literalmente: "No es un historial de existencias". Verificado contra el proyecto real: una venta y una cancelación completas no dejan ni una fila en `admin_change_log`, con control positivo de que el `order_event` de la cancelación sí guarda actor y unidades.

**Future reconsideration:** Si algún día hiciera falta el libro mayor completo de existencias, sería otra tabla y otra decisión, no una ampliación de esta.

---

## DEC-056 — Solo el trigger escribe la auditoría; no hay policy de INSERT

**Status:** Accepted *(Fase 9.5, Incremento 5C, 2026-09-03)*

**Context:** Si un administrador pudiera insertar en la tabla de auditoría, podría fabricar un registro diciendo que otro bajó un precio. Una auditoría que el auditado puede escribir no vale nada.

**Decision:** `admin_change_log` tiene **una sola policy, de SELECT**. No existe policy de INSERT, ni de UPDATE, ni de DELETE, y además hay `revoke insert, update, delete ... from authenticated, anon`. La única escritura posible es el trigger `log_admin_change`, que es `SECURITY DEFINER` y pertenece a `postgres`: el dueño de la tabla no está sujeto a RLS mientras no se active FORCE ROW LEVEL SECURITY, así que **no hace falta ninguna policy de escritura y por eso no la hay**. Sin service_role.

**Alternatives:** Escribir el registro desde la Server Action. Se descarta por el principio de la fase: una action se salta con un POST directo a PostgREST, y ese camino tiene que producir exactamente el mismo registro.

**Reason:** La autoridad de la auditoría no puede ser el código que audita.

**Consequences:** Verificado contra el proyecto real: un admin recibe error al intentar INSERT, PATCH y DELETE sobre la tabla, con control positivo de que sí puede leerla; anon no lee ni escribe; un autenticado sin rol tampoco lee. Y comprobado sobre el build servido que un `PATCH /product_variants` directo con la sesión del admin, sin pasar por el panel, **deja el mismo registro** que el formulario.

**Future reconsideration:** Si alguna vez hiciera falta purgar registros antiguos, sería una función `SECURITY DEFINER` con criterio explícito, nunca una policy de DELETE.

---

## DEC-057 — El origen del cambio sale del `request.path`, no de una marca

**Status:** Accepted *(Fase 9.5, Incremento 5C, 2026-09-03)*

**Context:** "Repuso +8 uds" y "Stock corregido: 12 → 20" describen el mismo salto de números y son decisiones distintas. Distinguirlas exige saber por dónde entró el cambio, y eso no es derivable a posteriori.

**Decision:** El trigger lee `current_setting('request.path', true)`, que PostgREST fija por petición: `/rpc/admin_restock_variants` → `reposicion`, `/product_variants` → `correccion`, y `directo` cuando el ajuste no existe (una sesión SQL). **Ninguna función tiene que acordarse de marcar nada.**

`request.path` no es un dato del cliente: es la ruta que PostgREST **ya usó para elegir qué ejecutar**. Nadie puede hacer un PATCH sobre `/product_variants` fingiendo que la ruta dice `/rpc/create_order`, porque entonces se habría ejecutado `create_order`. Por eso sirve también para EXCLUIR (DEC-059) y no solo para etiquetar.

**Alternatives:** Un `set_config` en cada RPC. Funciona, pero mete en cada función la obligación de recordarlo, que es justo lo que esta fase quiere evitar.

**Reason:** El origen ya viaja en la petición; pedírselo al código sería duplicar información que el servidor ya tiene.

**Consequences:** Verificado contra el proyecto real: la misma variante repuesta por RPC y corregida por PATCH produce `['reposicion','10','22']` y `['correccion','22','5']` en ese orden. **Es una dependencia de PostgREST**: si algún día el nombre del ajuste cambiara, todos los orígenes pasarían a `directo` — se degradaría, no se rompería, y ningún cambio dejaría de auditarse.

---

## DEC-058 — La auditoría refleja lo que quedó en PostgreSQL, no lo que la UI creía

**Status:** Accepted *(Fase 9.5, Incremento 5C, 2026-09-03)*

**Context:** Con dos administradores a la vez, un log escrito desde la aplicación registraría el valor que cada uno *creía* estar escribiendo: 10 → 20 y 10 → 30, cuando la base acabó en 30.

**Decision:** El trigger es `AFTER UPDATE ... FOR EACH ROW` y usa `OLD`/`NEW`, es decir, los valores reales de la fila. La segunda transacción espera el bloqueo y relee, así que la cadena sale sola.

**Reason:** Es la única forma de que la auditoría no mienta bajo concurrencia.

**Consequences:** Verificado contra el proyecto real:

- Dos reposiciones simultáneas de +5 y +7 sobre 10 → **10 → 15** y **15 → 22**, encadenadas, con la fila en 22.
- Dos correcciones aceptadas → **10 → 20** y **20 → 30**, cada una con su autor. Nunca 10 → 20 y 10 → 30.
- Una corrección **rechazada** por el bloqueo optimista (DEC-047) **no deja rastro**: cero filas afectadas, cero registros. Solo existe 10 → 20.
- Doble envío del mismo valor: un solo registro, porque el segundo UPDATE no cambia nada.

Además, `is distinct from` en vez de `<>`: con `<>`, `deleted_at` NULL → fecha daría NULL y el borrado lógico **no se registraría nunca**. Comprobado que sí se registra, y que NULL → NULL no genera basura.

**Future reconsideration:** Cualquier auditoría futura de otra tabla copia este patrón: trigger AFTER, `OLD`/`NEW`, comparación segura con NULL.

---

## DEC-059 — "Hay sesión" no es "hay un administrador": la venta no es una decisión

**Status:** Accepted *(Fase 9.5, Incremento 5C, migración 0033, 2026-09-05)*

**Context:** Auditoría de la 0032 contra el proyecto real, no lectura del código. Su puerta era `if v_actor is null then return null`, y su única exclusión de operaciones de pedido, la ruta `/rpc/admin_update_order_status`. Dos consecuencias, ambas **reproducidas**:

1. `create_order` tiene `grant execute` a `authenticated` desde la 0018. Llamada con el token de un admin devuelve **200** y deja `field_name=stock, 10 → 8, source=rpc`, que la ficha pinta como «Stock corregido: 10 → 8». Una venta disfrazada de decisión de una persona.
2. Peor: `actor_id` referencia `profiles`, y un autenticado **sin perfil** no tiene fila ahí. Medido: `409 · 23503 · Key (actor_id)=(505b0e18…) is not present in table "profiles"`. El INSERT de auditoría revienta dentro de `create_order`, la transacción se deshace entera y **el pedido no se crea** (el stock se quedó en 10). La auditoría podía **denegar una venta**.

Que hoy no sea alcanzable desde la tienda —`lib/checkout/create-order.ts` usa el cliente anónimo— no lo convierte en teórico: es alcanzable por un POST directo de cualquier autenticado, y dejaría de estar contenido el día que existan cuentas de cliente.

**Decision:** La puerta del trigger pasa a ser `if not public.is_admin() then return null`. Y las **dos** funciones que mueven stock por causa de un pedido se excluyen por ruta: `create_order` y `admin_update_order_status`. Se comprobó que son las únicas: en todo el esquema solo tres funciones escriben en `product_variants` (`create_order` 0018, `admin_update_order_status` 0019, `admin_restock_variants` 0026); el resto llega como PATCH del panel.

**Alternatives:** (a) Marcar el origen con `set_config(..., true)` dentro de `create_order`. Más robusto en abstracto, pero obliga a reescribir en la 0033 las ~300 líneas de la función de checkout para añadir una: dos copias del cobro en el historial de migraciones a cambio de nada, porque la ruta ya es un dato fiable del servidor (DEC-057). (b) Quitar la FK de `actor_id`. Se descarta: la FK es precisamente lo que garantiza que el autor existe; el problema era la puerta, no la restricción.

**Reason:** Esta tabla registra **decisiones de administradores**. `is_admin()` dice exactamente eso, `auth.uid() is not null` dice "hay alguien". Además hace la clave ajena **inalcanzable por construcción**: si el trigger escribe, el actor tiene perfil.

**Consequences:** Verificado contra el proyecto real, después de la 0033:

- Compra con la sesión de un admin → **cero** filas de auditoría, con control positivo de que el stock sí bajó (10 → 8), o sea que el trigger corrió.
- Compra de un autenticado sin perfil → **200**, pedido creado, stock cobrado. La auditoría ya no puede impedir una venta.
- La cadena de la service role key sigue fuera: su JWT no lleva `sub`, así que `is_admin()` es falso.

**Falla hacia el lado seguro:** una función futura que mueva stock y que nadie añada a la lista se registra como `source='rpc'` —ruido visible en la ficha— en vez de perderse.

---

## DEC-060 — El historial hereda del producto quién puede leerlo

**Status:** Accepted *(Fase 9.5, Incremento 5C, migración 0033, 2026-09-05)*

**Context:** `admin_change_log` era la **única** tabla legible por el admin cuya policy decía solo `is_admin()`. Todas las demás derivan el mercado del producto con un `exists` desde DEC-035 (migración 0020), incluidas `product_variants` y `product_images`, que tampoco tienen `market_id` propio.

Reproducido: con un producto de un mercado desactivado, el admin recibe `[]` al pedir el producto y **sí lee su historial completo** —sku, precio anterior y precio nuevo—. El catálogo de un mercado apagado seguía contando lo que se cobraba en él.

**Decision:** La policy de SELECT pasa a `is_admin() and exists (select 1 from products p where p.id = admin_change_log.product_id and is_active_market(p.market_id))`. Misma forma exacta que `admin_all_product_variants`.

**Alternatives:** Guardar `market_id` en la tabla de auditoría. Se descarta: serían dos copias del mismo hecho que pueden divergir, y la defensa fuerte que pide el enunciado es precisamente **la relación que ya existe**, no una columna denormalizada.

**Reason:** Un historial no puede sobrevivir al aislamiento del catálogo que describe.

**Consequences:** Verificado contra el proyecto real con un mercado ficticio creado y borrado en el propio test: con el mercado activo el admin escribe y lee (control positivo, 1 fila); apagado, el producto devuelve `[]` **y el historial también**, mientras la fila **sigue existiendo** en la tabla —se esconde, no se borra—, así que reactivar el mercado devuelve la trazabilidad entera.

Sigue sin haber policy de INSERT, UPDATE ni DELETE (DEC-056): la 0033 solo sustituye la de SELECT.

---

## DEC-061 — Retirar un atributo es una regla de PostgreSQL, no un filtro de la interfaz

**Status:** Accepted *(Fase 9.5, incremento 6, migración 0034, 2026-09-08)*

**Context:** Hasta ahora nadie podía desactivar un color sin SQL, así que daba igual que `admin_create_variant_matrix` (0021) comprobara solo que el color y la talla **existieran**. Con `/admin/atributos`, "retirar un color" pasa a ser una operación normal, y entonces la garantía importa. Reproducido antes de tocar nada, con un color y una talla creados ya con `is_active = false`:

```
POST /rest/v1/rpc/admin_create_variant_matrix  →  {"created":1,"requested":1}
PATCH /product_variants {"color_id": <inactivo>} →  204
```

Es decir: "un valor retirado no se ofrece" lo garantizaba **solo** el `.eq("is_active", true)` de `listColors()`. Eso es la aplicación, y un POST directo se la salta.

**Decision:** La 0034 añade `and is_active` a las dos comprobaciones de existencia de la RPC. **Solo se comprueba al CREAR.** No hay CHECK ni trigger sobre `product_variants`.

**Alternatives:** Un CHECK o un trigger sobre `product_variants` que exigiera atributos activos en toda la fila. Se descarta por una razón concreta y ya vivida: congelaría las variantes existentes —retirar un color impediría corregir su precio o su stock—, que es exactamente el error que la 0030 cometió con la publicabilidad y que la 0031 tuvo que corregir. La restricción va en la TRANSICIÓN, no en la fila.

**Reason:** La interfaz puede ocultar una opción; solo PostgreSQL puede impedirla.

**Consequences:** Verificado contra el proyecto real después de la 0034: la RPC devuelve `INVALID_COLOR` / `INVALID_SIZE` con un valor retirado, y con el valor activo la misma llamada crea la variante (control positivo). Una variante que YA usa un color retirado **se sigue pudiendo editar** (probado con un PATCH de precio y stock). El PATCH directo de `color_id` a un valor retirado sigue siendo posible: es un camino que ninguna Server Action usa —`updateVariantAction` no toca `color_id` ni `size_id` a propósito— y queda como riesgo residual documentado, no tapado.

---

## DEC-062 — Colores y tallas son GLOBALES, y el código no debe fingir lo contrario

**Status:** Accepted *(Fase 9.5, incremento 6, 2026-09-08)*

**Context:** Todo el panel resuelve `market_id` en el servidor y nunca lo acepta del formulario (DEC-035). Al construir `/admin/atributos` la pregunta obvia era qué mercado usar. Verificado contra el OpenAPI del proyecto real: **`colors` y `sizes` no tienen columna `market_id`**, y la 0004 las declara catálogos compartidos entre mercados.

**Decision:** `atributos/actions.ts` **no llama a `getActiveMarket()`**, y sus policies siguen siendo `is_admin()` sin `is_active_market`. No se añade aislamiento de mercado a un modelo que no lo tiene.

**Alternatives:** Añadir `market_id` a ambas tablas "por coherencia" con el resto del panel. Se descarta: sería inventar una dimensión que el dominio no pide, obligaría a migrar y duplicaría los mismos once valores de talla en cada mercado.

**Reason:** Copiar una defensa donde no hay nada que defender no es seguridad, es ruido — y ruido que después alguien tiene que mantener.

**Consequences:** Hay un test de integración que **afirma** que `market_id` no existe en ninguna de las dos y que `sizes` no tiene `slug`. Si algún día se añaden, ese test falla y obliga a revisar esta decisión en vez de descubrirla por accidente.

**Future reconsideration:** Si un mercado necesitara alguna vez su propia paleta, esto se replantea entero; hoy no hay ningún indicio de que haga falta.

---

## DEC-063 — El envío se calcula en el checkout, no se acuerda por WhatsApp

**Status:** Accepted *(Incremento 8, migración 0035, 2026-09-08)* — **revierte la regla de v1**

**Context:** Hasta aquí, `01-PRODUCT.md` §Envío y `DOMAIN-MODEL.md` §ShippingMethod decían: *"en v1 el coste final se confirma en la conversación de WhatsApp"*, y `create_order` lo citaba en un comentario mientras escribía `shipping_total = 0` y `total = subtotal` **siempre**. A la vez, `shipping_methods` tenía dos métodos activos con precio real y —esto no lo había visto ninguna auditoría anterior— **`free_shipping_threshold = 60` sin aplicar**: un pedido de 89,90 € pagaba 4,90 € de envío que los propios datos de la tienda decían que no debía pagar.

**Decision:** El cliente elige método antes de confirmar; el importe que ve es el que queda registrado y el que se manda por WhatsApp. La autoridad es `create_order`, que resuelve el método contra `shipping_methods` **del mercado del pedido**, aplica su umbral y calcula el total dentro de la misma transacción. El navegador solo envía un `shipping_method_id`.

Reglas concretas, todas confirmadas por Juan y ninguna inventada:
- **Gratis cuando el SUBTOTAL de productos alcanza el umbral** (`>=`). Contra el subtotal y no contra el total porque el total incluye el envío: compararlo consigo mismo no tiene definición coherente. `free_shipping_threshold` NULL = sin umbral.
- **Ningún método viene preseleccionado**: nadie confirma un envío que no ha elegido.
- **Nada específico de un país en el código**: ni precios, ni umbrales, ni nombres. Todo sale de `shipping_methods` filtrado por mercado, así que activar otro mercado y sembrar sus métodos no requiere tocar una línea.

**Alternatives:** (a) Dejarlo como estaba: el cliente ve un total que no incluye el envío y el pedido registra un importe que nadie va a cobrar. (b) Calcular el total en TypeScript: sería una segunda autoridad que puede divergir de la BD.

**Reason:** El importe que ve el cliente antes de confirmar tiene que ser el que queda registrado. Cualquier otra cosa obliga a renegociar por chat cada pedido.

**Consequences:** Verificado contra Supabase real y sobre el build servido: 30,00 + 4,90 = 34,90; recogida 30,00 + 0,00 = 30,00; en el umbral exacto (60,00) el envío sale gratis; inyectar `shipping_total`/`total` en el POST se rechaza de plano —esos parámetros no existen en la función—; un método inexistente, retirado o de otro mercado devuelve `INVALID_SHIPPING_METHOD`; y un doble envío simultáneo deja **un** pedido con **un** cobro.

**La firma de 6 parámetros de `create_order` se ELIMINA.** Dejarla viva habría sido dejar publicado un camino que sigue creando pedidos con `shipping_total = 0`.

**El método entra en el fingerprint de idempotencia** (DEC-028): sin eso, reintentar con la misma clave y otro envío habría devuelto el pedido viejo con el total viejo. Ahora es `IDEMPOTENCY_KEY_REUSED`.

**Duplicación asumida, con vigilancia:** la regla vive en `resolveShippingCost` (previsión del cliente) y en el `case` de la 0035 (autoridad). Un test de integración ejecuta las dos sobre los mismos casos y falla si difieren en un céntimo.

**Future reconsideration:** No hay zonas, ni peso, ni dirección: el sistema no captura dirección en el checkout (DEC-049). Un cliente fuera de la península puede elegir «Envío a Península» y pagar 4,90 €. Si eso importa comercialmente, hace falta capturar dirección primero, y eso es otra decisión.

---

## Decisiones abiertas (resumen para revisión humana)

| ID | Tema | Quién decide |
|---|---|---|
| — | Pasarela de pago futura (Stripe recomendado para ES; evaluar Wompi/MercadoPago para CO) | Juan (Fase 11) |
| — | Dominios definitivos por mercado | Juan (antes de Fase 11) |
| ~~—~~ | ~~Formato definitivo de `order_number`~~ | ✅ Resuelto en DEC-027 (`YI-ES-000001`) |
---

## DEC-064 — Los métodos de entrega se editan en el panel, y sus límites los impone PostgreSQL

**Status:** Accepted *(Incremento 9, migración 0036, 2026-09-08)*

**Context:** DEC-063 convirtió `shipping_methods` en la tabla que decide **lo que cobra la tienda**: `create_order` lee de ahí el precio y el umbral y los mete en el total. Pero no había ninguna forma de editarla salvo SQL a mano. Auditando la tabla contra Supabase real apareció además que la única defensa era `price >= 0`: la BD aceptaba `free_shipping_threshold = -50` (201), `name = ''` (201) y dos métodos con el mismo nombre (201). Un umbral negativo hace que `subtotal >= -50` sea siempre cierto, es decir, **envío gratis para todos los pedidos**, sin ningún aviso.

**Decision:** CRUD completo dentro de `/admin/ajustes` —no en una pantalla nueva: son configuración del mercado, como el número de WhatsApp— con tres Server Actions (`create`/`update`/`delete`) sobre el cliente de sesión, `requireAdmin()` y RLS, nunca `service_role`. Y **la migración 0036 sube los límites a la BD**, porque la validación del formulario no protege a quien escriba por SQL:

```sql
check (free_shipping_threshold is null or free_shipping_threshold >= 0)
check (btrim(name) <> '')
unique index on (market_id, name)
```

Reglas concretas:
- **`market_id` NUNCA sale del formulario**: lo pone el servidor con `getActiveMarket()`. Inyectarlo en el POST no mueve nada de mercado (verificado sobre el build servido), y RLS solo deja escribir en mercados activos (DEC-035).
- **Umbral VACÍO = NULL = «nunca sale gratis». Umbral `0` = «gratis siempre».** `Number("")` vale 0, así que tratar el vacío como número regalaría el envío de toda la tienda. Los dos casos se aceptan a propósito y son distintos.
- **Se acepta la coma decimal**: quien administra la tienda escribe `4,90`.
- **Retirar ≠ borrar.** Desmarcar «Ofrecer en el checkout» es la operación normal. Borrar también se permite: la FK es `on delete set null` y el pedido guarda `shipping_method_name`, `shipping_total` y `total` como **snapshot**, así que un pedido histórico no pierde ni el nombre del método ni el importe cobrado (verificado: tras borrar el método el pedido conserva los tres). La fila avisa de cuántos pedidos lo usan antes de ofrecer el botón.
- **La fila enseña precio y umbral sin abrir nada.** Esconder detrás de un desplegable el dato que decide lo que cobra la tienda es lo que hizo que `free_shipping_threshold = 60` llevara meses sin aplicarse.
- **No se revalida el escaparate.** `/checkout` es `force-dynamic` desde DEC-063: lee los métodos en cada petición. Añadir `revalidatePath` sería ruido que sugiere una dependencia que no existe (verificado: retirar un método desaparece del checkout sin redeploy).

**Alternatives:** (a) Validar solo en el formulario: deja la BD abierta a cualquier otro camino de escritura, y el umbral negativo es un fallo silencioso que se cobra en dinero. (b) Prohibir el borrado: innecesario, porque el pedido no depende de la fila para reconstruir lo que cobró. (c) Pantalla propia `/admin/envios`: más navegación para dos o tres filas por mercado.

**Reason:** La tabla que decide el dinero tiene que ser editable sin SQL y tiene que ser imposible de dejar en un estado que regale el envío.

**Consequences:** 24/24 en E2E sobre el build servido y 17/17 de integración contra Supabase real. La BD ahora responde `23514` a un umbral negativo y a un nombre en blanco, y `23505` a un nombre repetido dentro del mercado; los tres se traducen a un mensaje en castellano. Las dos filas del seed pasan las tres restricciones sin tocarlas. La pantalla avisa en rojo cuando no hay ningún método o cuando ninguno está activo, porque en ambos casos **nadie puede completar un pedido**.

---

## DEC-065 — Un número de WhatsApp que es el del seed significa «sin configurar», y la tienda no vende

**Status:** Accepted *(Incremento 10, 2026-09-09)*

**Context:** `settings.whatsapp_number` valía `34600000000`, el valor que siembra `05_settings_and_shipping_es.sql`, un archivo que dice de sí mismo: *«whatsapp_number es un número de prueba, NO real»*. El guard del canal era `buildWhatsAppUrl(numero, "test") !== null`, y ese número **pasa**: tiene 11 dígitos y forma válida. Medido sobre el build servido: el checkout **creaba el pedido** y redirigía a `wa.me/34600000000`. El cliente creía haber escrito a la tienda, el pedido quedaba `pending` y **nadie se enteraba**. No era una tienda a medio configurar: era una tienda que perdía pedidos en silencio.

**Decision:** Se separa «número válido» de «tienda configurada». `isWhatsAppConfigured()` es el único predicado de «la tienda puede vender por WhatsApp» y lo usan a la vez el canal de checkout y el panel, para que no puedan discrepar. Mientras el número sea el del seed:
- **el checkout rechaza la compra** con `CHECKOUT_NOT_CONFIGURED` y **no crea ningún pedido** (decisión de Juan: más vale no vender que registrar un pedido que no llega a nadie);
- **el panel de inicio lo dice en rojo** y enlaza a `/admin/ajustes`, y ajustes lo repite junto al campo que lo arregla;
- **guardar ese número se rechaza**, porque guardarlo es guardar «sin configurar».

⚠️ **No se inventa ninguna regla sobre qué números «parecen falsos».** `PLACEHOLDER_WHATSAPP_NUMBERS` contiene exactamente el valor que siembra el repositorio, ni uno más: `34600000001` es válido y debe seguir siéndolo. Un test lee el archivo de seed y falla si el valor sembrado deja de estar en la lista — misma técnica que `ACTION_BODY_LIMIT_BYTES` en `next.config.ts`.

**Alternatives:** (a) Vender igual y avisar solo en el panel: el cliente sigue creyendo que ha avisado a alguien. (b) Adivinar números falsos por su forma (`6000000…`): rompería números reales e inventaría una regla de negocio que nadie ha tomado. (c) Dejarlo como estaba: es el estado que hacía perder pedidos.

**Reason:** Un pedido que no le llega a nadie es peor que una venta no realizada: el cliente cree que ha comprado.

**Consequences:** Verificado sobre el build servido invocando la Server Action del checkout: con el placeholder el pedido **no se crea** (recuento antes y después idéntico) y el mensaje al cliente no filtra el número; con un número real el pedido **sí** se crea, el recuento sube exactamente 1 y el enlace usa `wa.me/34600112233` — el control positivo es lo que demuestra que el rechazo lo causa el número y no un payload mal formado. **Mientras Juan no escriba su número, la tienda no vende. Es el efecto buscado.**

---

## DEC-066 — Una fila de imagen cuyo objeto no existe se borra, y un detector impide que vuelva

**Status:** Accepted *(Incremento 10, migración 0037, 2026-09-09)*

**Context:** El seed insertaba una fila en `product_images` por producto y **nunca subía el objeto**: los buckets estaban vacíos. Medido: `GET /storage/v1/object/public/products/<las 4>` → **400**, y `/_next/image` → **400 «upstream response is invalid»**. Tres consecuencias, ninguna hipotética: el HTML servido llevaba un `<img>` roto (el fallback a `MockImage` vive en `onError`, que es de cliente y solo actúa tras hidratar); `og:image` y el `image` del JSON-LD `Product` servían esa misma URL de 400; y el detector de publicados sin foto (P2) informaba de que los cuatro productos **tenían** foto, porque la FILA existía. Cierto e inútil.

**Decision:** La migración 0037 (a) borra las filas cuyo objeto no existe y (b) crea `admin_products_with_broken_images()`, un detector permanente. El seed se corrige para no volver a crearlas, y un test lo comprueba. Se añade la vista `/admin/catalogo?ver=foto-rota` y un aviso en el panel de inicio.

- **Se borran, no se «arreglan»:** una fila cuyo objeto no existe no se puede pintar, optimizar ni compartir. Lo único que aportaba era hacer mentir a P2. Borrarla devuelve al producto a su estado honesto —«publicado sin foto»—, que es lo que es.
- **Alcance deliberado: solo `url` NO vacía.** La cadena vacía ya es territorio de P2, y juntarlas volvería a mezclar dos problemas que P2 separó a propósito.
- **`SECURITY DEFINER` obligado:** el dato vive en `storage.objects`, que PostgREST no expone y tiene su propia RLS. Por eso la puerta `is_admin()` va **dentro del WHERE**: un no-admin recibe cero filas, no un error. Con `is_active_market` además, por DEC-035.
- **Una sola consulta, no N+1:** cruzar `product_images` con Storage desde TypeScript habría sido una llamada por producto y además habría exigido `service_role`.
- **Aviso NEUTRO, no rojo:** el producto se compra igual. El rojo de ese panel significa solo «no se puede comprar» y no debe diluirse.

**Alternatives:** (a) Dejar las filas y solo detectar: el escaparate seguiría sirviendo imágenes rotas y OG un 400. (b) Solo borrar: no impide que vuelva a pasar si alguien borra un objeto desde el panel de Supabase.

**Reason:** Un panel que afirma que un producto tiene foto cuando el cliente ve un hueco es peor que un panel que no dice nada.

**Consequences:** Verificado contra Supabase real **con control positivo y negativo**: una fila con objeto inexistente aparece; una con objeto REAL no aparece; y si ese objeto se borra, vuelve a aparecer — es la prueba de que mira Storage y no una marca en la fila. Sobre el build servido: la ficha ya no lleva ningún `<img>` al optimizador y sirve el hueco honesto **desde el servidor**; y con una foto real subida, la misma ficha anuncia `og:image` que responde **200**, el optimizador devuelve la imagen y el JSON-LD lleva `image`.

**Consecuencia que hay que saber:** los cuatro productos del seed pasan a contarse como «publicados sin foto» en P2 —que es la verdad— y sus fichas **no anuncian `og:image` ni `image` en el JSON-LD**. `image` es propiedad requerida del rich result de producto de Google, así que **ese rich result seguirá incompleto hasta que se suban fotos reales**. No se inventa una imagen de marca para rellenarlo: sería contenido comercial inventado.

---

## DEC-067 — El stock se ESTABLECE con testigo; «Agotar» es el cero y es idempotente

**Status:** Accepted *(Incremento 12, migración 0038, 2026-09-09)*

**Context:** La tienda no tiene almacén propio: una fuente externa dicta la disponibilidad («negra M 4, negra L 0, blanca M 7») y el trabajo del administrador es copiarla. Hasta aquí, `/admin/inventario` solo sabía SUMAR (`admin_restock_variants`, DEC-047), así que para dejar una variante en 4 había que restar de cabeza contra un número que podía haber cambiado hace un segundo — la misma resta que la 0026 vino a quitarle a la máquina, hecha por una persona. La corrección absoluta existía, pero escondida dentro de la ficha del producto: 4.808 px de página y 67 campos para tocar un número (medido en Chrome a 390 px).

**Decision:** `admin_set_variant_stock(p_market_id, p_items)` (0038) con dos modos explícitos, y el inventario agrupado por producto.

- **`mode='set'` exige `expected_updated_at`.** Un valor absoluto depende del valor de partida: quien escribe 12 lo decidió mirando un 4. Si la fila ya no está en ese testigo → `STOCK_CHANGED`. **Sin testigo no es un permiso, es un error** (`EXPECTED_UPDATED_AT_REQUIRED`): deducir «no mandó testigo, luego déjale escribir» convierte un olvido en una escritura sin control.
- **`mode='exhaust'` no admite ni valor ni testigo y escribe 0.** Poner a cero converge: se aplique en el orden que se aplique, el estado final es el mismo. Medido antes de decidirlo: dos «agotar» simultáneos → ambos 200 y resultado 0; comprar con stock 0 → `OUT_OF_STOCK`. Repetirlo no es un error, se responde «ya estaba agotada».
- **El lote es TODO O NADA.** Con M=4, L=0, XL=7 y la L cambiada por debajo, no se guarda ninguna. Un guardado a medias parece correcto y no lo es.
- **Escribir el mismo número no escribe.** Movería `updated_at` y caducaría el testigo de las demás pestañas sin que nada haya cambiado; además no se audita (20 → 20 no es una decisión, DEC-055).
- **Agotar NO despublica ni desactiva.** `stock = 0` y nada más: el producto sigue publicado y su ficha dice «Agotado» (DEC-052). Tocar `is_active` haría 404 la ficha y chocaría con `enforce_publishable_product`.
- **Auditoría sin categoría nueva:** la ruta de la RPC se etiqueta `correccion` en `log_admin_change`, que es como ya se etiquetaba el PATCH del panel que hacía lo mismo. «Agotado» es una forma de PINTAR una corrección a 0, y eso es trabajo de la interfaz.

**Alternatives:** (a) Seguir con deltas: obliga al administrador a hacer la resta, que es exactamente el error que se quería evitar. (b) Absoluto sin testigo: medido en la auditoría previa —una venta simultánea desaparece sin que nadie se entere—. (c) Testigo opcional: la ausencia del dato pasa a ser un permiso. (d) Aplicar lo que se pueda del lote e informar de lo demás: deja un estado que nadie decidió.

**Consequences:** Verificado contra Supabase real (24 tests de integración) y sobre el build servido en Chrome a 390 px (36 comprobaciones E2E, una de ellas por POST `multipart/form-data` **sin JavaScript**). Dos administradores con el mismo testigo: uno gana y el otro recibe `STOCK_CHANGED`; una venta también caduca el testigo, así que el pedido no se puede borrar escribiendo encima. Límites: `stock` sigue siendo `int` con `check (stock >= 0)` y **la BD no tiene tope superior**; el 100000 de la función es el `MAX_STOCK` que ya aplicaba `lib/admin/catalog.ts`, no un número nuevo.

---

## DEC-068 — La reposición por delta sale del panel, pero no de la base de datos

**Status:** Accepted *(Incremento 12, 2026-09-09)*

**Context:** Con DEC-067 conviven dos formas de mover stock: sumar (`admin_restock_variants`, 0026) y establecer (`admin_set_variant_stock`, 0038). Dos semánticas en la misma pantalla obligan al administrador a acertar cuál está usando, y el precio de equivocarse es un número mal puesto en la tienda.

**Decision:** El panel escribe SOLO valores absolutos. `admin_restock_variants` **se queda en la base de datos, intacta y con sus tests**, pero ninguna pantalla la llama; se retiran de la aplicación el `restockVariantsAction` y los ayudantes de parseo del delta.

**Alternatives:** (a) Borrar la función: rompería el historial de migraciones para no ganar nada, y una recepción de mercancía (varias entradas concurrentes sobre la misma variante) sigue siendo el caso donde la suma atómica es superior. (b) Mantener los dos campos en la pantalla: es la confusión que este incremento eliminó.

**Consequences:** Un test comprueba que ninguna pantalla del panel vuelve a invocar la reposición por delta. Si algún día hace falta una pantalla de «recepción de mercancía», la función ya está —probada— y ese será su sitio, separada de la edición rápida.

---

## DEC-069 — La atribución es first-touch, vive en el pedido y la sanea PostgreSQL

**Status:** Accepted *(Incremento 14, migración 0040, 2026-09-09)*

**Context:** Para poder anunciarse en Meta hay que saber después qué campaña trajo cada venta. Lo único que existía era `orders.source_url`, que guarda `window.location.href` **del checkout** (`/checkout`): no dice nada del origen. Sin capturar la campaña en la entrada, cada pedido que llegue de un anuncio pierde su origen para siempre.

**Decision:** `orders.attribution jsonb` con siete claves, capturadas en la landing con `sessionStorage` y saneadas dentro de `create_order`.

- **FIRST TOUCH dentro de la sesión de pestaña.** Se guarda la primera campaña y no se sobrescribe. Quien pagó la visita fue el primer anuncio; con last-touch, volver buscando la marca en Google le daría el mérito a quien no pagó nada. La sesión es la pestaña: sin cookies propias, sin identificador persistente.
- **`sessionStorage`, no cookies.** Es suficiente para el recorrido real (entrar → mirar → comprar), no viaja en cada petición y no crea un identificador que haya que consentir. El carrito ya usa `localStorage`, así que no se introduce una categoría nueva de almacenamiento.
- **`window.location.search` dentro de un `useEffect`, NO `useSearchParams()`.** Este último marcaría el árbol como dependiente de la petición y obligaría a renderizar dinámicamente. La tienda es SSG + ISR (DEC-004, DEC-021): **los UTM no pueden convertirla en dinámica**. Medido: el HTML servido es idéntico con y sin parámetros, y la misma página cacheada sirve a todas las campañas.
- **La autoridad del saneado es PostgreSQL.** `create_order` tiene `grant execute` a `anon`: si el filtro viviera solo en TypeScript, un POST directo escribiría JSON arbitrario. La función lee una LISTA BLANCA de siete claves, recorta a 200, quita caracteres de control y descarta lo demás. **Sin PII por construcción**, no por disciplina.
- **Nunca lanza.** Un objeto corrupto, gigante (>8 KB) o con tipos absurdos deja `attribution = null` y el pedido se crea igual. ATRIBUCIÓN FALLIDA ≠ CHECKOUT FALLIDO.
- **Histórica e inmutable.** Se escribe una vez, en el INSERT. Un reintento idempotente (DEC-028) devuelve el pedido ya creado sin tocarla, así que un segundo envío con otra campaña no reescribe el origen. **No entra en el fingerprint**: meter la campaña en la identidad del pedido crearía duplicados.
- **Una sola puerta.** La firma de 7 parámetros de `create_order` se elimina, como la 0035 eliminó la de 6: si sobreviviera, quedaría un camino capaz de crear pedidos que ni siquiera puede recibir atribución.

**Alternatives:** (a) Cookies propias: identificador persistente, consentimiento y peso en cada petición, para un dato que solo hace falta durante la compra. (b) Last-touch: premia al último clic, que en esta tienda suele ser tráfico que la campaña ya había pagado. (c) Guardar la URL entera de entrada: arrastra parámetros ajenos y puede meter PII sin querer. (d) Tabla `attribution_events` aparte: un JOIN y una tabla nueva para un dato que pertenece al pedido y se consulta con él. (e) Saneado solo en la Server Action: deja `anon` escribiendo JSON libre por POST directo.

**Consequences:** Verificado contra Supabase real (17 tests) y en Chrome sobre el build servido (25 comprobaciones E2E, compra completa incluida): una campaña completa llega intacta; el tráfico directo crea el pedido con `null`; un valor de 3000 caracteres se recorta a 200; un email en la URL no se guarda; `sessionStorage` corrupto no impide comprar; `anon` no puede leer ni escribir la columna; y ninguna respuesta pública la contiene. **Coste medido en la landing: +1 petición y +1,1 KB; LCP sin cambio apreciable** (mediana de 5 cargas en frío: 164 ms antes de este trabajo 184 ms, dentro del ruido). Meta Pixel y el consentimiento quedan FUERA, con los puntos de integración documentados en `12-ATTRIBUTION.md` §8.

---

## DEC-070 — «¿Puede vender la tienda?» tiene UNA función, y `settings` se lee por columna

**Status:** Accepted *(Incremento 15, migración 0041, 2026-09-09)*

**Context:** Dos hallazgos, los dos medidos, en la pantalla que el administrador usa para configurar la tienda.

1. **La respuesta a «se puede vender» se daba en dos sitios con criterios distintos.** El panel de inicio miraba solo `isWhatsAppConfigured()`; `/admin/ajustes` tenía además un aviso suelto para cuando no quedaba ningún método de entrega. Las dos cosas impiden completar un pedido —el checkout exige elegir método y `create_order` lo valida—, pero solo una se llamaba «la tienda no puede recibir pedidos». Un panel que dice «listo» mientras el cliente no puede comprar es peor que no decir nada.
2. **`anon` podía leer la fila entera de `settings`.** Medido: `GET /rest/v1/settings?select=*` con la anon key devolvía las diez columnas. RLS decide filas, no columnas.

Y un tercero, de configuración fantasma: `contact_email`, `instagram_url`, `tiktok_url` y `facebook_url` llevaban desde la Fase 8 siendo **editables sin que nada los pintara**.

**Decision:**

- **`resolveSaleBlockers` (`lib/store/sale-status.ts`) es la única definición.** Devuelve la lista de lo que impide vender —hoy dos casos— y la consumen el panel de inicio y `/admin/ajustes`. Ninguna pantalla vuelve a evaluar el criterio por su cuenta, y hay un test que falla si alguna lo intenta. Reutiliza `isWhatsAppConfigured`, no una copia.
- **Qué cuenta como bloqueo:** solo lo que impide COMPLETAR un pedido hoy. Un catálogo vacío o sin stock **no** entra: eso es una tienda sin nada que vender, no una tienda rota, y ya lo cuentan el resumen de no vendibles y el inventario.
- **Ante la duda, se informa de BLOQUEO.** Si falla el recuento de métodos activos, la capa de datos devuelve 0: un falso «lista para vender» es peor que un falso aviso.
- **`GRANT SELECT` por columna sobre `settings` para `anon` (0041).** No arregla ninguna fuga actual: cierra la puerta por la que entraría la próxima, porque `settings` es exactamente donde va a caer un Pixel ID o un token. Con esto, **una columna nueva nace privada**.
- **El footer consume el contacto y las redes.** Se acaba la configuración que se guarda y no se publica en ninguna parte.

**Alternatives:** (a) Dejar cada pantalla con su criterio: es el estado que produjo el desfase. (b) Meter «sin productos publicados» entre los bloqueos: diluye el mensaje y llena de rojo una tienda que simplemente está empezando. (c) Vista SQL pública de `settings` en vez de grants: una vista más que mantener para lo mismo. (d) Borrar las columnas de contacto/redes en vez de publicarlas: se pierde información que el cliente sí quiere (una tienda que se anuncia en Instagram y no enlaza su Instagram).

**Consequences:** Verificado en Chrome sobre el build servido (30 comprobaciones E2E): con el número del seed la pantalla dice **VENTA BLOQUEADA** y explica por qué; al guardar un número real pasa a **LISTA PARA VENDER**, el checkout crea el pedido y el enlace `wa.me` lleva el número nuevo; cambiar el precio de envío se refleja en el checkout **y el pedido anterior conserva el suyo**; el email guardado aparece en el footer público en la siguiente carga. Verificado contra Supabase real: `anon` recibe **401 · 42501** al pedir `select=*` y 200 en las columnas públicas; ni `anon` ni un autenticado sin rol pueden escribir. **Sin cambios de esquema**: 0041 solo mueve permisos.

**Consecuencia que hay que saber:** `authenticated` conserva la lectura completa de `settings` porque el panel la necesita y hoy no existen cuentas de cliente (DEC-011). El día que existan, esa lectura hay que estrecharla.

---

## DEC-071 — La identidad pública de la tienda vive en `settings`, no en el código

**Status:** Accepted *(Incremento 16, migraciones 0042 y 0043, 2026-09-10)*

**Context:** `settings.store_name` era editable en `/admin/ajustes` desde la Fase 8, y desde el incremento 15 el Footer lo pintaba. Pero el nombre de la tienda seguía escrito a mano en otros cinco sitios, y ninguno lo leía de la base de datos:

| Dónde | Qué había escrito |
|---|---|
| `app/layout.tsx` | `title.default = "YI"`, `template = "%s · YI"`, `description = "Vive a tu propio ritmo."` |
| `app/(store)/page.tsx` | `openGraph.siteName`, `openGraph.title`, `twitter.title` y las dos `description` |
| `app/(store)/page.tsx` | los *fallbacks* del hero cuando no hay bloque editorial |
| `app/(store)/producto/[slug]/page.tsx` | `openGraph.siteName` de **cada ficha** |
| `app/opengraph-image.tsx` | el nombre y la frase de la imagen que se ve al compartir el enlace |

Consecuencia: el administrador podía renombrar la tienda y **no cambiaba ni una pestaña del navegador, ni un resultado de Google, ni la tarjeta que se ve al pegar el enlace en WhatsApp**. Renombrar exigía tocar cinco archivos y desplegar — justo lo que la regla de este incremento prohíbe.

La frase «Vive a tu propio ritmo.» estaba además **duplicada cinco veces** y no existía en ninguna columna.

**Decision:**

- **`store_name` y una columna nueva `tagline` (0042) son la identidad pública**, y las leen la metadata del grupo `(store)`, el logo del Header, el Footer, el Open Graph de la home y de cada ficha, y la imagen de portada.
- **La metadata se resuelve en `app/(store)/layout.tsx`, no en el layout raíz.** El raíz envuelve también `/admin`, que es `force-dynamic` y no se indexa: poner ahí una consulta a Supabase la cobraría en cada render del panel para pintar un título que a nadie le importa. El panel conserva su propia plantilla.
- **Coste cero en consultas.** `getStorefrontSettings` es `cache()` de React y el layout ya la llamaba para el Footer, así que `generateMetadata` y el render comparten resultado dentro de la misma petición. Verificado en el build: `/` sigue saliendo `○ (Static)` con ISR de 5 min y las fichas siguen siendo `● (SSG)`.
- **`tagline` es NULLABLE y vacío significa vacío.** Sin frase no se pinta ninguna descripción: **nunca** se sustituye por un texto por defecto escrito en el código (regla #9). El backfill de la 0042 copia el valor que tenía el código, así que el comportamiento visible no cambia hasta que alguien lo edite.
- **`app/opengraph-image.tsx` pasa de horneada en el build a ISR de 5 min**, la misma cadencia que la home, y queda dentro del alcance de `revalidateStorefront()`. Es la imagen que más se ve de una tienda que se anuncia: dejarla con la marca vieja era el peor sitio para quedarse desactualizado.
- **Los límites suben a PostgreSQL (0042, corregida por la 0043).** Nombre no en blanco y ≤ 80; frase NULL o no en blanco y ≤ 160; email con forma de email; redes solo `https://`. Medido antes: con la sesión de un admin y sin pasar por el panel, un `store_name` de tres espacios, un `instagram_url` con `javascript:` y un `contact_email` que no es un email devolvían **200 y se guardaban**. El segundo acaba en el `href` de un enlace del footer de todas las páginas.

**Alternatives:** (a) Dejar la marca en el código «porque casi nunca cambia»: es exactamente el tipo de dato que este incremento venía a sacar del código, y su coste de cambio era un despliegue. (b) Resolver la metadata en el layout raíz: más simple de escribir, pero cobra una consulta a Supabase en cada render del panel. (c) `tagline NOT NULL` con valor por defecto: impide que el administrador decida no publicar descripción y reintroduce copy inventado en el esquema. (d) Dejar `opengraph-image` estática: el enlace compartido seguiría enseñando el nombre viejo. (e) Validar solo en el formulario: es la barrera que ya existía y que el PATCH directo se saltaba.

**Consequences:** Verificado en Chrome 152 headless a 390×844 sobre el build servido (33 comprobaciones): el `<title>`, el `<meta description>`, el logo del Header, el `og:site_name` de la home y de la ficha y el Footer salen todos de la fila de `settings`; cambiar el nombre desde el panel lo refleja una ruta dinámica **sin desplegar**; borrar la frase no deja un texto por defecto. Verificado contra Supabase real (26 comprobaciones): las seis restricciones devuelven **23514**, `anon` lee `tagline` y sigue recibiendo **401** al pedir `select=*`, y ni `anon` ni un autenticado sin rol pueden escribirla.

**Lo que se rompió y se corrigió dentro del propio incremento:** la 0042 escribió `btrim(store_name) <> ''`, y **`btrim` sin segundo argumento recorta solo el carácter espacio**: un nombre hecho de un tabulador y un salto de línea la pasaba (200). Lo cazó su propio test de integración con la migración ya aplicada. La **0043** la sustituye por `~ '[^[:space:]]'`, el equivalente exacto de `String.prototype.trim()`. La 0042 se deja tal y como se ejecutó: reescribir una migración ya aplicada haría que el repositorio describiera una base de datos que no existe.

---

## DEC-072 — El cliente pregunta por el estado de venta ANTES de rellenar el checkout

**Status:** Accepted *(Incremento 16, sin cambios de esquema, 2026-09-10)*

**Context:** DEC-070 dejó `resolveSaleBlockers` como única definición de «¿puede vender la tienda?», pero **solo la consumía el panel**. La tienda pública seguía comportándose como antes: `/checkout` pintaba el formulario entero —nombre, teléfono, método de entrega, botón— y el cliente descubría que no se podía comprar **después** de rellenarlo todo y pulsar «COMPRAR POR WHATSAPP», cuando `WhatsAppChannel` devolvía `CHECKOUT_NOT_CONFIGURED`.

Reproducido en Chrome sobre el build servido con el estado REAL del repositorio (número de WhatsApp del seed): el formulario completo se pintaba y el rechazo llegaba al final del camino.

**Decision:**

- **`/checkout` resuelve los bloqueos en servidor y, si hay alguno, no pinta el formulario.** Da un mensaje neutro y una salida al carrito. El carrito no se pierde.
- **Al cliente NO se le enseñan los `title`/`fix` de los bloqueos.** Son instrucciones para el administrador y describen cómo está configurada la tienda («no hay WhatsApp», «no hay métodos de entrega»). Hay un test que falla si esa información aparece en la página.
- **El criterio es uno; la carga de datos, dos formas.** `getSaleBlockers` (`lib/store/sale-status-data.ts`) hace las dos consultas para quien no tiene los datos —el panel de inicio—. `/checkout` y `/admin/ajustes` llaman a `resolveSaleBlockers` directamente **porque ya tienen los datos en la mano**, y pedirlos otra vez sería un viaje de más. El test que impedía que una pantalla evaluara el criterio por su cuenta ahora cubre también `/checkout`.
- **Medido, y por eso está así:** un viaje de ida y vuelta a Supabase desde el entorno de desarrollo cuesta ~85 ms. Con `getSaleBlockers`, `/checkout` pasaba de un round-trip a dos secuenciales (**p50 231 ms**). Resolviendo el bloqueo con la lista de métodos que la página ya carga, quedan **dos consultas en paralelo: p50 195 ms**.
- **Cada bloqueo del panel lleva un ancla** (`blocker.anchor`) a la sección de `/admin/ajustes` que lo arregla. En un móvil, «escribe el número» sin enlace obliga a buscar el campo a mano. Un test comprueba que esas anclas **existen** en la página.

**Alternatives:** (a) Dejarlo como estaba: el cliente hace todo el trabajo para nada, y el único aviso llega en forma de error. (b) Contarle al cliente qué falta: expone la configuración de la tienda a cualquiera que abra el checkout. (c) Esconder el enlace al checkout desde el carrito: el cliente puede llegar por URL directa y el gate del servidor sigue haciendo falta. (d) Usar `getSaleBlockers` también en `/checkout`: más uniforme de leer, +85 ms medidos por carga para contar algo que la página ya sabe.

**Consequences:** Verificado en Chrome sobre el build servido (69 comprobaciones E2E entre cliente y panel): con el número del seed, `/checkout` no pinta el formulario, lo dice sin tecnicismos y conserva el carrito; al guardar un número real vuelve el formulario; al desactivar **todos** los métodos de entrega se bloquea otra vez y el checkout **no revienta**; al reactivarlos vuelve, la compra se completa y el envío y el total persistidos son **exactamente** los que vio el cliente antes de confirmar.

---

## DEC-073 — «No se pinta» no era «no se puede leer»: `supplier` y `supplier_ref` pasan a privadas

**Status:** Accepted *(Incremento 16, migración 0044, 2026-09-10)*

**Context:** El incremento 13 creó `products.supplier` y `product_variants.supplier_ref` y verificó que **la ficha pública no las muestra** — sigue siendo cierto, re-verificado en el E2E de este incremento. Pero con la anon key, que viaja en el navegador de cualquiera, las dos columnas se podían pedir directamente a PostgREST y devolvían **200**.

Hoy están a NULL en todo el catálogo, así que **no había fuga de datos: había una puerta abierta**, y se abriría de par en par en cuanto el administrador escribiera de quién se surte y con qué referencia, que es exactamente para lo que se crearon. El propio CLAUDE.md ya lo dice del campo hermano que se decidió no crear: «la condición de réplica es interna y no debe poder llegar al cliente».

**Decision:**

- **`GRANT SELECT` por columna para `anon` sobre `products` y `product_variants` (0044)**, el mismo mecanismo que la 0041 estrenó en `settings`. RLS decide qué FILAS se ven, no qué columnas: no sabe expresar esto.
- **Efecto secundario deseado: una columna nueva de cualquiera de las dos tablas nace PRIVADA.** Si tiene que ser pública, hay que decirlo en una migración a propósito.
- **Las columnas de FILTRO también se conceden.** PostgreSQL exige privilegio de SELECT sobre toda columna que aparezca en un `WHERE`, no solo en la lista de salida: sin `market_id`, `status`, `deleted_at`, `slug` o `is_active`, el escaparate entero daría 401. Hay controles positivos en los tests para cada consulta pública real.
- **`authenticated` conserva la lectura completa**: el panel las necesita para reponer, y hoy el único autenticado posible es un administrador (DEC-011). Misma advertencia que DEC-070: el día que existan cuentas de cliente, hay que estrecharla.
- **El modelo de réplicas NO cambia.** Dos productos distintos siguen pudiendo ser dos publicaciones del mismo artículo externo, sin `UNIQUE`, sin tabla de proveedores y sin campo `replica` (incremento 13). Lo único que se arregla es quién puede leer el dato.

**Alternatives:** (a) Dejarlo: el dato se vuelve sensible en cuanto se rellene, y entonces la fuga ya existe. (b) Vista pública sin esas columnas: una vista más que mantener y todo el data layer a reescribir. (c) Sacar las columnas a una tabla aparte solo-admin: una tabla y un JOIN para dos campos de texto que pertenecen al producto.

**Consequences:** Verificado contra Supabase real: `anon` recibe **401 · 42501** al pedir `supplier`, `supplier_ref` o `select=*` en cualquiera de las dos tablas, y **200** en las cinco consultas que hace el escaparate de verdad (catálogo, ficha, sitemap y variantes); un admin las sigue leyendo. Un test de integración existente cambió de forma —el PATCH anónimo ahora muere en el permiso de columna antes de llegar a la policy— y se ajustó para seguir afirmando **la propiedad real** (no se escribió nada), no un código de estado concreto.

---

## DEC-074 — El logo se administra, y el orden de escritura es la garantía

**Status:** Accepted *(Incremento 17, sin migraciones, 2026-09-10)*

**Context:** `settings.logo_url` existía desde la migración `0013`, el bucket `content` desde la `0015` con las policies correctas (lectura pública, escritura solo `is_admin()`), y la infraestructura de imágenes desde la Fase 8 (magic bytes + `sharp` → WebP). Lo único que faltaba era la pantalla, y `/admin/ajustes` decía literalmente «subida pendiente» enseñando la ruta cruda del objeto. Poner un logo exigía tocar la base de datos a mano.

**Decision:**

- **Reutilizar todo lo que ya existía.** Sin migración: el bucket `content` y sus cuatro policies de la `0015` son exactamente las que hacen falta. `checkImageUpload` (magic bytes, no `File.type` ni `allowed_mime_types`) y la recodificación con `sharp` se comparten con el catálogo. **Sin `service_role`**: escribe la sesión del admin y autoriza `admin_write_content_bucket`.
- **512 px y calidad 90**, frente a los 2000 px y calidad 80 del catálogo. Un logo se pinta a 32 px en la cabecera y a ~180 px en la tarjeta de Open Graph; por encima de 512 solo se paga transferencia. La calidad sube porque un logo tiene bordes duros y texto, donde los artefactos se ven mucho antes que en una fotografía. Se conserva la transparencia.
- **Cada subida escribe un objeto NUEVO** (`logo/{market}-{uuid}.webp`), nunca sobrescribe la ruta anterior. **Medido**: tras borrar un objeto, su URL pública **sigue devolviendo 200** un rato porque la sirve un CDN por delante de Storage. Con una ruta fija, sustituir el logo dejaría al cliente viendo el anterior y al administrador sin forma de arreglarlo desde el panel.
- **El orden de la sustitución hace que el fallo posible sea el barato:** (1) subir el objeto nuevo, (2) escribir `logo_url`, (3) borrar el anterior. Si (2) falla se descarta el objeto nuevo y **el logo anterior sigue publicado**; si (3) falla queda un objeto sin dueño, molesto e inofensivo. El orden contrario —borrar primero— abriría una ventana con `logo_url` apuntando a un objeto inexistente, es decir, la tienda entera con la imagen rota.
- **`isLogoPath` se comprueba antes de borrar.** La RLS de Storage solo mira que seas admin, no de qué es el objeto: sin esa comprobación, un `logo_url` manipulado en la base de datos haría que sustituir el logo borrase una foto del catálogo.
- **Se puede quitar el logo.** Sin esa salida, subir el archivo equivocado deja la tienda con él puesto y sin remedio desde el panel. Ahí el orden se invierte a propósito —primero la fila, después el objeto—, porque el estado final deseado es «sin logo».
- **`logo_url` guarda la RUTA, no la URL**, igual que `product_images.url`: así el identificador del proyecto de Supabase no queda escrito en las filas. `getPublicUrl` es una operación de cadena, sin red.
- **Sin DAM, sin biblioteca, sin selector, sin recorte.** Subir → guardar → usar. Un logo es uno, y el que vale es el que está publicado.

**Alternatives:** (a) Sobrescribir siempre la misma ruta: más simple y roto por el CDN, medido. (b) Borrar el objeto viejo antes de escribir la fila: cambia un huérfano de kilobytes por una tienda con la imagen rota. (c) Guardar la URL absoluta en `logo_url`: mete el project-ref de Supabase en las filas y mover el proyecto obliga a reescribirlas. (d) Un `try/finally` que «garantice» la limpieza: no crea una transacción entre Storage y PostgreSQL, solo lo aparenta.

**Consequences:** Verificado en Chrome headless a 390×844 sobre el build servido (42 comprobaciones del panel): un SVG disfrazado de PNG se rechaza **por su contenido**, un archivo de 8 MB se rechaza con «La imagen pesa 8.3 MB y el máximo son 5 MB», y ninguno de los dos deja rastro; una subida válida convierte un PNG de 900×300 en **WebP de 512×171 y 1 KB**, el panel lo confirma y el administrador lo ve al instante. Sustituir deja **exactamente un objeto** en el bucket. Quitarlo deja `logo_url` a NULL y borra su objeto. Verificado contra Supabase real (16 comprobaciones): anon y autenticado-sin-rol no pueden subir, borrar ni cambiar la referencia, y el objeto sigue intacto tras cada intento; el cliente lo lee sin sesión.

**Riesgo residual, documentado y no disimulado:** si el proceso muere entre (2) y (3), el objeto anterior queda huérfano para siempre. No hay transacción entre Storage y PostgreSQL. El coste son kilobytes y solo lo paga una sustitución interrumpida.

---

## DEC-075 — «Lista para vender» es una lista, no un semáforo

**Status:** Accepted *(Incremento 17, sin migraciones, 2026-09-10)*

**Context:** DEC-070 y DEC-072 dejaron `resolveSaleBlockers` como criterio único, pero el panel **solo enseñaba los fallos**. Con un fallo, el requisito que sí se cumplía desaparecía de la pantalla: el administrador no podía distinguir «el envío está bien» de «nadie ha mirado el envío». Y «Lista para vender» era un párrafo que había que creerse.

**Decision:**

- **`SALE_CHECKS` es la única declaración**, y cada entrada lleva su propio predicado. `resolveSaleChecklist` devuelve las comprobaciones con su resultado; `resolveSaleBlockers` es `checklist.filter(no pasa)`. Añadir una comprobación es añadir una entrada: no hay un segundo sitio que actualizar y no puede quedarse a medias. Un test comprueba que los bloqueos son **exactamente** las comprobaciones que fallan.
- **Se ven siempre las dos, con ✓ o ✕**, y cada fallo lleva **su propio botón** (`Configurar WhatsApp`, `Configurar entrega`) al ancla que lo arregla, con 44 px de alto.
- **NO se inventan comprobaciones.** Son dos porque son dos las cosas que impiden completar un pedido. Añadir «configuración de envío válida» quedaría bonito y sería mentira: los importes negativos ya los rechaza PostgreSQL (migración `0036`), así que esa comprobación no puede fallar nunca y solo añadiría un ✓ decorativo. Hay un test que fija la lista en dos.
- **Ni tecnicismos ni alarmismo.** El rojo aparece solo cuando el cliente no puede comprar. Nada de códigos, nombres de columna ni errores de SQL: eso va al log. Un test recorre los textos y falla si aparecen.
- **Cuando la tienda vende no hay botones**: «todo bien» no es una tarea.
- Se retira `getSaleBlockers`, que se quedó sin consumidores. Dejarla habría sido el camino paralelo que este incremento venía a evitar.

**Alternatives:** (a) Dejar solo los fallos: es el estado que no distinguía «bien» de «sin mirar». (b) Declarar la lista de checks aparte de los bloqueos: dos sitios que actualizar y la posibilidad de que discrepen. (c) Añadir un tercer check «configuración válida» para que la lista quede más llena: información falsa.

**Consequences:** Verificado en Chrome sobre el build servido: con el número del seed, la pantalla dice **Venta bloqueada**, enseña `✕ WhatsApp` **y** `✓ Método de entrega activo`, y ofrece un botón a `#whatsapp` de 44 px; al guardar un número real pasa a **Lista para vender** con las dos en ✓, cero botones y «La tienda puede aceptar pedidos», **sin recargar a mano**.

---

## DEC-076 — El límite del proxy hacía inalcanzable al límite de la Server Action

**Status:** Accepted *(Incremento 17, corrección de un fallo del incremento 7, 2026-09-10)*

**Context:** El incremento 7 midió que Next limita el cuerpo de una Server Action a 1 MB por defecto y lo configuró a 26 MB (`5 × 5 MB + 1 MB`) para que cupiera el lote de 5 fotos que promete la interfaz. **Ese límite nunca se alcanzaba.** Con `proxy.ts` presente —y lo hay desde la Fase 7—, Next clona y bufferiza el cuerpo en memoria para que puedan leerlo el proxy y la ruta, con un tope PROPIO de **10 MB por defecto** (`proxyClientMaxBodySize`).

Reproducido sobre el build servido, adjuntando los archivos en el formulario real del catálogo:

    3 fotos × 4,84 MB = 14,5 MB → pantalla "Algo ha fallado", 0 imágenes subidas
    log: "Request body exceeded 10MB for /admin/catalogo/…"
         "Error: Unexpected end of form"

Cada archivo pasaba su validación de 5 MB; lo que fallaba era el transporte. El administrador solo veía un error genérico — **el mismo síntoma exacto que el incremento 7 creía haber arreglado**.

**Decision:** `experimental.proxyClientMaxBodySize` se configura **derivado de la misma constante** `ACTION_BODY_LIMIT_BYTES`, para que los dos límites no puedan volver a separarse, con un test que lo comprueba. El coste es memoria del servidor mientras dura la subida; con un panel de un solo administrador es un intercambio razonable, y es exactamente lo que la interfaz ya prometía.

**Alternatives:** (a) Bajar `MAX_FILES_PER_BATCH` a 2 para caber en 10 MB: reduce la funcionalidad para adaptarse a un límite que se puede configurar. (b) Escribir `'26mb'` a mano: es el literal suelto que el test del incremento 7 ya prohíbe para el otro límite. (c) Dejarlo y documentarlo: el flujo real —fotos de móvil que llegan por WhatsApp de tres en tres— falla, y falla sin explicación.

**Consequences:** Medido antes y después con el mismo lote de 14,5 MB: **0 imágenes → 3 imágenes**. Los dos límites salen ahora de la misma constante.

---

## DEC-077 — `next/og` no sabe leer WebP, y el logo estaba rompiendo la tarjeta

**Status:** Accepted *(Incremento 17, 2026-09-10)*

**Context:** Al meter el logo en `app/opengraph-image.tsx` pasándolo como data URI WebP —el formato en el que se guarda—, la ruta devolvió **500** y el log del servidor dijo `TypeError: u2 is not iterable`. Verificado en el código compilado de Satori (`node_modules/next/dist/compiled/@vercel/og/index.node.js`): su lista de tipos admitidos no incluye WebP, y el detector se va por la rama del SVG y revienta.

Consecuencia si se hubiera publicado así: **subir un logo dejaba rota la tarjeta de Open Graph**, es decir, la imagen que se ve al pegar el enlace de la tienda en WhatsApp, en Instagram o en un anuncio. Justo el sitio donde más duele, y en el incremento que prepara el terreno para Meta Ads.

**Decision:** los bytes se traen con un tope de tiempo de 2,5 s y **se convierten a PNG con `sharp`** antes de pasarlos a `ImageResponse`. `sharp` ya es dependencia del proyecto y la ruta corre en Node, así que no añade nada nuevo; la conversión ocurre como mucho una vez cada 5 minutos (ISR). **Cualquier fallo —red, 404, objeto de más de 1 MB, `sharp`— cae al diseño tipográfico anterior**: una tarjeta sin logo es peor que una con logo, pero una tarjeta que no carga es peor que las dos.

**Alternatives:** (a) Guardar además una copia PNG del logo: dos objetos por logo, en contra de DEC-036 («un objeto por imagen»), y dos cosas que mantener sincronizadas. (b) Dejar el logo fuera de la tarjeta: se pierde precisamente donde la marca importa. (c) Dejar que `ImageResponse` pida la URL remota: es lo que no funciona de forma fiable en una ruta de metadata, y tampoco arregla el formato.

**Consequences:** Verificado sobre el build servido: con logo, `/opengraph-image` responde **200 · image/png · 30,3 KB**. Sin logo, la tarjeta es la misma de antes. El coste servido no cambia (5–6 ms, es ISR); la regeneración añade una petición a Storage y una conversión, como mucho cada 5 minutos.

---

## DEC-078 — La recuperación de contraseña es de Supabase Auth, y recuperar no es entrar

**Status:** Accepted *(Incremento 18, sin migraciones, 2026-09-11)*

**Context:** Perder la contraseña del panel dejaba al administrador fuera **sin salida**: no había recuperación, y la única forma de volver era tocar Supabase a mano. Era el riesgo operativo más caro que quedaba, porque no se manifiesta hasta el día que pasa.

**Decision:**

- **Todo el flujo es de Supabase Auth.** No se generan tokens propios, no se guarda nada en ninguna tabla, no se toca `profiles` y **no se usa la service role key en ninguna parte del código de producción** (hay un test que lo comprueba archivo por archivo). Quien emite, valida, caduca y consume el token es Supabase.
- **Ninguna recuperación alternativa**: ni código maestro, ni segunda contraseña, ni preguntas, ni WhatsApp, ni email guardado en `settings`, ni endpoint secreto.
- **La respuesta nunca enumera cuentas.** Medido: `POST /auth/v1/recover` devuelve **200 con cuerpo vacío tanto si el email existe como si no**. La action devuelve `sent: true` en **todos** los caminos que llevan un email —formato inválido incluido, y también cuando Supabase falla o limita—; el único `sent: false` es el del campo vacío, que no dice nada de ninguna cuenta. Un test lee el código fuente y falla si alguna rama corta el flujo.
- **La protección contra abuso la pone Supabase, y está medida**: durante la auditoría el proyecto respondió `429 · over_email_send_rate_limit` y `over_request_rate_limit`. No se añade un contador propio: sería un límite peor —en memoria de un proceso, sin coordinación entre instancias— delante del que ya funciona. Como no puede distinguirse sin enumerar, un 429 se presenta igual que un éxito.
- **La política de contraseñas es la del proyecto, no una inventada.** Medido: `weak_password · "Password should be at least 6 characters."`, sin requisitos de mayúsculas, dígitos ni símbolos. La pantalla dice «mínimo 6» y, si el servidor rechaza, **muestra su mensaje tal cual**, para que endurecer la política en el panel de Supabase se refleje sin tocar código.
- **⚠️ AUTENTICACIÓN ≠ AUTORIZACIÓN, y se verifica.** Recuperar devuelve el acceso a una cuenta de Supabase Auth; entrar al panel sigue dependiendo de `is_admin()`. Una cuenta sin fila en `profiles` recupera su contraseña con normalidad, entra en Supabase Auth y **sigue sin poder abrir el panel** (verificado en navegador y contra la base de datos). Por eso la pantalla de contraseña vive en el grupo `(auth)` y **no consulta el rol**: no es asunto suyo, y consultarlo invitaría a decidir accesos en el sitio equivocado.
- **Cambiar la contraseña CIERRA la sesión de recuperación** y devuelve al login. Así la contraseña nueva se prueba de inmediato, no queda abierta una sesión nacida de un enlace de correo, y el acceso al panel vuelve a pasar por `loginAction`, que es donde se comprueba `is_admin()`.
- **El proxy gana una lista de rutas públicas** (`/admin/recuperar`, `/admin/reset-password`, `/admin/auth/confirm`) y **sigue sin comprobar el rol** (DEC-031 intacta, con test). Sin esa lista la recuperación sería imposible por construcción: quien ha perdido la clave no tiene sesión.

**Alternatives:** (a) Un reset propio con tokens en una tabla: reimplementar criptografía, caducidad y de un solo uso que Supabase ya hace bien, y añadir una tabla de secretos al esquema. (b) Un código maestro o un bypass administrativo: una segunda llave permanente, que es exactamente lo que no se quiere tener. (c) Rate limiting propio: un límite peor delante del que ya funciona. (d) Meter la pantalla de contraseña en `(panel)`: el guard de admin echaría a cualquier cuenta sin rol antes de dejarle terminar, y una cuenta no-admin también tiene derecho a recuperar la suya. (e) Exigir mayúsculas y símbolos: pedir en el formulario algo que el servidor no exige.

**Consequences:** Verificado en Chrome 153 headless a 390×844 sobre el build servido (**45 comprobaciones**) y contra Supabase real (**9 de integración**): el enlace del correo lleva a la pantalla de contraseña, el token **desaparece de la barra de direcciones**, la contraseña cambia, la antigua deja de valer, el enlace **no se puede reutilizar**, y una cuenta sin perfil que recupera **no entra al panel ni gana un perfil**. Los tres casos de email —no registrado, formato inválido y registrado de verdad— producen **exactamente la misma pantalla**.

---

## DEC-079 — El token del email llega en el FRAGMENTO, y por eso hay dos caminos

**Status:** Accepted *(Incremento 18, 2026-09-11)*

**Context:** Al medir el enlace real que genera este proyecto:

    GET /auth/v1/verify?token=…&type=recovery&redirect_to=…
    → 303  Location: <redirect_to>#access_token=…&refresh_token=…&type=recovery

El token viaja en el **fragmento** de la URL. El fragmento **no se envía al servidor**: ni el proxy, ni un Route Handler, ni un Server Component pueden verlo. Un flujo 100 % de servidor no puede leerlo, y este panel es 100 % de servidor con cookies `httpOnly`.

La alternativa existe y es mejor: una plantilla de email con `{{ .TokenHash }}` enlaza directamente a una ruta propia con `?token_hash=…&type=recovery`, que sí se resuelve entero en servidor. Pero eso es **configuración del panel de Supabase** (Authentication → Email Templates), no código.

**Decision:** se admiten **los dos caminos**, y los dos acaban con la sesión en cookies `httpOnly` del servidor:

1. **`/admin/auth/confirm?token_hash=…&type=recovery`** — Route Handler que llama a `verifyOtp` en servidor. El token **no pasa nunca por JavaScript**. Es el camino preferible y el que se documenta como configuración recomendada. Acepta **solo** `type=recovery`: no es un confirmador genérico de OTP.
2. **El fragmento** — un componente cliente mínimo en `/admin/reset-password` lo lee, lo entrega **una vez** a una Server Action que llama a `setSession`, y lo **borra de la barra de direcciones** con `replaceState`. Funciona con la plantilla por defecto y sin tocar nada en Supabase.

El camino (2) acepta tokens del cliente, así que **los valida**: `setSession` solo guarda; quien decide si valen es `getUser()`, que pregunta a Supabase en vez de creerse la cookie. Si no valen, se cierra la sesión y no queda ninguna cookie. No se usa `lib/supabase/browser.ts`, que guardaría la sesión en una cookie legible por JavaScript y rompería la decisión de `lib/supabase/cookies.ts`.

**Alternatives:** (a) Solo el fragmento: obliga a que el token pase por JavaScript siempre, incluso cuando no haría falta. (b) Solo `token_hash`: más limpio, pero **no funciona con la configuración actual del proyecto** — el enlace no llegaría nunca a esa ruta. (c) Usar el cliente de navegador de Supabase: rompe `httpOnly`, que se decidió a propósito en la Fase 7. (d) Cambiar la plantilla del email desde el código: no se puede; es configuración del proyecto.

**Consequences:** Verificado en navegador: siguiendo el `action_link` real, se aterriza en `/admin/reset-password`, se pinta el formulario con el email de la cuenta y **el hash ya no está en la URL**. Un `token_hash` falso por query acaba en la misma pantalla con el mensaje único «Este enlace no sirve» — caducado, ya usado, manipulado e inexistente no se distinguen.

**Lo que depende de configuración EXTERNA y no se ha simulado:** la **entrega del correo**. El SMTP integrado de Supabase está limitado (respondió `429` en esta misma auditoría) y en proyectos alojados solo entrega a miembros del equipo. Para que el administrador reciba el correo de verdad hace falta **configurar un SMTP propio** en el panel de Supabase. Todo lo demás del flujo está verificado contra el proyecto real; el enlace de los tests se obtiene con `admin/generate_link`, que ocupa el lugar del buzón que este entorno no tiene.

---

## DEC-080 — La ficha dice el envío, y por eso el escaparate se invalida al cambiarlo

**Status:** Accepted *(Incremento 19, sin migraciones, 2026-09-11)*

**Context:** El cliente no sabía cuánto costaba recibir el pedido hasta el último paso. Peor: el carrito rotulaba **«Total»** —y en rojo, el color del precio— una cifra que **no incluye el envío**. Un carrito de 34,90 € acababa cobrando 39,80 €, y el cliente lo descubría en el checkout. Es la definición de «precio que cambia sin explicación».

**Decision:**

- La ficha y el carrito muestran el envío, y **siempre desde `shipping_methods`** del mercado activo — la misma tabla que lee `create_order` para cobrar (DEC-063). Un módulo puro común, `summarizeShipping`, resume lo que se puede afirmar: precio del método de pago más barato, umbral más bajo de envío gratis y nombre del método gratuito si existe.
- **Nunca se inventa nada.** No hay plazos de entrega —no existe ninguna columna que los guarde—, ni «envío gratis» a secas, ni importes escritos a mano. Si no hay métodos activos, **no se pinta nada**: un «envío: consultar» es peor que el silencio. Hay tests que fallan si aparece un importe, un plazo o una promesa en el código.
- **El carrito deja de llamar «Total» a un subtotal.** El importe no cambia; cambia el rótulo, que ahora dice la verdad, y debajo va la nota de envío. El total real lo sigue calculando `create_order`.
- **⚠️ LAS ACCIONES DE MÉTODOS DE ENTREGA PASAN A INVALIDAR EL ESCAPARATE.** El comentario del incremento 9 —«no hace falta, `/checkout` es dinámica»— dejó de ser cierto en cuanto la ficha y el carrito publicaron el precio: las dos son estáticas con ISR. Sin invalidar, el administrador cambiaría 4,90 € por 6,90 € y el cliente leería 4,90 € durante cinco minutos mientras `create_order` le cobra 6,90 €.
- **`/carrito` gana `revalidate = 300`.** Al empezar a leer `shipping_methods`, Next la seguía marcando `○ (Static)` **sin revalidación**: el importe habría quedado horneado en el build hasta el siguiente despliegue. Es exactamente el fallo que el incremento 8 midió en `/checkout`, y se cierra por partida doble (cadencia + invalidación).

**Alternatives:** (a) No decir nada del envío hasta el checkout: es el estado que hacía descubrir el coste al final. (b) Escribir «Envío 4,90 €» en el código: se desincroniza con la configuración el primer día. (c) Hacer la ficha `force-dynamic`: destruiría el SSG por un dato que cambia una vez al mes (DEC-021). (d) Dejar el rótulo «Total»: es literalmente falso.

**Consequences:** Verificado en Chrome 153 a 390×844 sobre el build servido: la ficha dice «Envío desde 4,90 € · gratis a partir de 60,00 € · recogida en tienda sin coste», el carrito dice «Subtotal» y repite la nota, y **el checkout cobra exactamente 4,90 €** — el pedido persistido guarda `shipping_total` 4,90 y `total` 39,80. El texto sale de los métodos reales: cambiarlos en el panel cambia las tres pantallas.

---

## DEC-081 — Un producto agotado no puede ofrecer botones de compra

**Status:** Accepted *(Incremento 19, sin migraciones, 2026-09-11)*

**Context:** Medido en Chrome sobre el build servido, con el stock puesto a cero **desde el panel** (para que la invalidación fuese real):

    tallas  → S(off) M(off) L(off)     ← ninguna se puede pulsar
    botones → «COMPRAR POR WHATSAPP» y «Añadir al carrito» HABILITADOS
    texto   → en ningún sitio ponía "agotado"
    JSON-LD → OutOfStock              ← esto sí era correcto

La causa: `isOutOfStock` exigía `selectedVariant !== null`, así que sin variante elegida la disponibilidad no se evaluaba. El cliente pulsaba comprar, se le pedía elegir una talla, y no había ninguna que pudiera elegir. **Un callejón sin salida, y el peor final posible para un clic pagado en un anuncio.**

**Decision:**

- La disponibilidad del **producto** se calcula antes de elegir nada (`productHasStock`), y manda sobre la de la variante.
- Sin stock: los dos CTA quedan **deshabilitados**, el principal pasa a decir «Agotado», y aparece un aviso explícito —«Agotado por ahora. No queda ninguna talla disponible»— **pegado al precio**, que es lo que decide si merece la pena seguir leyendo.
- **No se pide lo imposible.** Ni el mensaje de validación «elige una talla» ni la pista «Elige tu talla» aparecen cuando no queda ninguna que elegir: contradecían al aviso de agotado de justo arriba.
- **No se esconde el producto.** Su ficha sigue respondiendo 200 y sigue en el sitemap, coherente con 5B: un agotado se publica y se enseña, simplemente no se puede comprar hoy.

**Alternatives:** (a) Dejarlo: el cliente choca con una pared sin explicación. (b) Despublicar automáticamente al agotarse: cambia una regla de negocio que 5B decidió a propósito y tira el SEO acumulado de la ficha. (c) Deshabilitar solo tras elegir talla: es lo que fallaba, porque no se puede elegir ninguna.

**Consequences:** Verificado en E2E: con las tres tallas a 0 los botones salen `Agotado:off` y `Añadir al carrito:off`, la página lo dice, el JSON-LD sigue en `OutOfStock` y ya no se pide elegir talla. Al reponer stock desde el panel, la ficha vuelve a vender en la misma comprobación.

---

## DEC-082 — Sin foto, el hueco no ocupa media pantalla y la ficha se comparte igual

**Status:** Accepted *(Incremento 19, sin migraciones, 2026-09-11)*

**Context:** Dos medidas sobre el catálogo real, que hoy **no tiene ninguna fotografía**:

1. **El CTA quedaba a 1,3 pantallas de scroll.** El placeholder con proporción 3/4 ocupa 520 px en un móvil de 390, y empujaba todo hacia abajo: `h1` a 639 px, precio a 748, tallas a 920 y el botón de comprar a **1108 px**. Quien llega desde un anuncio veía un recuadro gris enorme y tenía que bajar dos veces para encontrar cómo comprar.
2. **`og:image` era `null` y `twitter:card` era `summary`.** Pegar el enlace de un producto en WhatsApp o usarlo como destino de un anuncio daba una tarjeta **sin imagen**, justo cuando la imagen es lo único que detiene el scroll.

**Decision:**

- **Sin foto, el hueco usa proporción ancha; con foto, retrato 3/4.** El recuadro vacío no comunica nada, así que no se gasta la primera pantalla; el retrato se conserva donde sí hay fotografía que enseñar, porque es el formato del producto y el que decide el LCP.
- **`og:image` cae a la PORTADA de la tienda** (`app/opengraph-image.tsx`) cuando el producto no tiene fotos, y la tarjeta es **siempre** `summary_large_image`. La foto del producto manda cuando existe. No es una imagen inventada del producto: es la marca —logo y frase administrables (DEC-071, DEC-074)—, que es lo único que la tienda puede afirmar con verdad mientras no haya fotografía.
- **No se rellena el catálogo con imágenes falsas.** Ni servicios de placeholder, ni fotos de stock, ni plantillas que simulen el producto. El hueco sigue siendo un hueco; lo que se arregla es que no estorbe.

**Alternatives:** (a) Quitar el hueco del todo sin foto: la ficha perdería la referencia visual de dónde irá la imagen y saltaría al llegar. (b) Generar una imagen de producto con el nombre: parece una foto y no lo es. (c) Dejar la tarjeta sin imagen: se paga el clic y la tarjeta no llama la atención.

**Consequences:** Medido después, mismo dispositivo y mismo build: `h1` **639 → 363 px**, precio **748 → 472**, tallas **920 → 644**, CTA **1108 → 832 px**. Las tallas y el botón de comprar entran ahora en la primera pantalla (844 px). La página pasa de 1743 a 1551 px de alto. `og:image` responde 200 y la tarjeta es grande.

**Lo que esto NO arregla, y hay que decirlo:** el cliente sigue sin ver el producto. **Falta que se suban las fotos reales**; la vía está probada y funciona (incrementos 7 y 17), y el panel ya lleva de «sin foto» directamente a subirla.

## DEC-083 — La IA propone; guardar sigue siendo un acto del administrador

**Status:** Accepted *(Incremento 20, sin migraciones, 2026-09-11)*

**Context:** Llenar el catálogo es hoy el trabajo principal de la tienda, y la pantalla de alta lo hacía cuesta arriba. Medido en Chrome 153 a 390×844 antes de tocar nada:

- `/admin/catalogo/nuevo` pedía **13 campos visibles** repartidos en **2,5 pantallas**, y **no tenía ningún control de archivo**: la foto —lo único que el administrador tiene en la mano cuando le llega un artículo— se subía después, en otra pantalla.
- `/admin` **no ofrecía «añadir producto» en ninguna parte**. Tenía cuatro secciones con título de las cuales **tres decían que no había nada que hacer**, y el único aviso real («4 productos publicados no tienen ninguna foto») caía a **825 px**, fuera de la primera pantalla.

**Decision:** la creación de producto pasa a ser **foto primero, cuatro campos y una sola pantalla**, y la IA entra como capa de ayuda con un contrato explícito:

- **La IA solo PROPONE.** Rellena campos del mismo formulario que el administrador ya está mirando; guardar sigue siendo la Server Action de siempre, con `requireAdmin()` y RLS. **Nunca publica**: `createProductWithPhotoAction` crea en `draft` y publicar sigue siendo un acto aparte.
- **Solo puede proponer lo que se ve en una fotografía**: nombre, descripción corta, descripción, categoría, color aparente y palabras clave. La lista blanca vive en `SUGGESTABLE_FIELDS`.
- **Lo que no se ve no existe en el tipo.** Composición, materiales, cuidados, tallas, precio, stock, proveedor, referencia y origen están en `FORBIDDEN_FIELDS` con su motivo, y **no hay campo donde ponerlos**: no es un filtro posterior, es que la sugerencia no tiene esa forma. Un modelo escribiría «100 % algodón orgánico» mirando una camiseta gris, y sonaría perfectamente creíble.
- **La categoría y el color se validan contra el catálogo REAL.** Si el modelo propone una categoría que no existe, el campo queda sin determinar; no se crea nada.
- **«No determinado» es una respuesta correcta**, se dice en la pantalla, y lo completa una persona.
- **No se guarda una segunda copia de lo generado.** No hay `ai_description`, ni `ai_category`, ni tabla de prompts: lo que se guarda es el campo real del producto, y para la Server Action un valor sugerido y uno escrito a mano son indistinguibles.

**Alternatives:** (a) Un asistente conversacional en el panel: convierte una tarea de 40 segundos en una conversación, y ninguna decisión de esta tienda mejora por charlar. (b) Guardar la sugerencia en columnas propias para «comparar después»: duplica el dato y crea dos verdades sobre lo mismo. (c) Dejar que la IA publique si su confianza es alta: la confianza de un modelo no es una garantía comercial, y publicar es lo único irreversible de cara al cliente.

**Consequences:** medido después, mismo dispositivo y mismo build: la pantalla de alta pasa de **13 campos a 4** (`name`, `categoryId`, `shortDescription`, `description`), gana el control de archivo, la zona de foto queda a **297 px** —antes del primer campo, que está a 603— y la página cabe en **1223 px**. `/admin` gana la acción primaria «+ Añadir producto» dentro de la primera pantalla. Precio, stock y tallas **no entran** en el alta: viven en las variantes y se deciden después.

## DEC-084 — La IA no puede escribir nada, y eso lo garantiza el código que NO existe

**Status:** Accepted *(Incremento 20, sin migraciones, 2026-09-11)*

**Context:** Una Server Action es un endpoint POST público. Si la que habla con el proveedor de IA pudiera además escribir en la base de datos, la frontera entre «proponer» y «hacer» dependería de que nadie se confundiera al editarla.

**Decision:**

- **`analyzeProductPhotoAction` no importa ningún cliente de escritura.** Ni `supabase/server`, ni `supabase/admin`, ni `.insert(`, ni `.rpc(`, ni `revalidatePath`. No recibe ningún id de producto. Su único retorno es una sugerencia. **Hay un test que lee el archivo y falla si aparece cualquiera de esas cosas.**
- **`requireAdmin()` va lo primero**, antes incluso de leer la imagen del formulario: sin eso, cualquiera podría gastar la cuota del proveedor mandando fotos. Un test comprueba el orden.
- **La imagen se valida por magic bytes antes de salir del servidor**, con la misma función que el catálogo (`checkImageUpload`). Ni `File.type` ni la extensión deciden qué se manda.
- **Lo que sale del proyecto está acotado por el tipo**: los bytes de UNA fotografía que el administrador acaba de elegir, más las categorías y los colores, que son públicos y se pintan en la tienda. `AssistantContext` **no tiene forma** de contener un cliente, un pedido, un teléfono, un email ni un proveedor. Un test falla si esas palabras aparecen en la action.
- **No se almacena el prompt ni la respuesta.** La sugerencia vive en la pantalla hasta que el administrador decide.
- **La clave sale del entorno** (`ANTHROPIC_API_KEY`, sin `NEXT_PUBLIC_`), el adaptador es `server-only` y al cliente solo viaja un booleano. Un test comprueba que no hay ninguna clave escrita en el código.

**Alternatives:** (a) Reutilizar una action del catálogo añadiéndole un modo «sugerir»: una sola función que a veces escribe y a veces no es exactamente el error que esto evita. (b) Llamar al proveedor desde el navegador: expone la clave. (c) Confiar en la revisión humana del diff: no sobrevive a un refactor.

**Consequences:** la prohibición del punto 15 del encargo —publicar, cambiar precios, cambiar stock, borrar productos, tocar pedidos, modificar configuración, mandar WhatsApp— no está escrita como una comprobación en tiempo de ejecución: está garantizada porque **el código que haría falta no está importado**, y hay tests que lo mantienen así.

⚠️ **Un archivo con `"use server"` solo puede exportar funciones async.** Exportar desde `ai-actions.ts` la constante del estado inicial reventaba el módulo en el servidor —«A "use server" file can only export async functions, found object»— y, con el grafo roto, el formulario de crear producto **no llegaba a enviarse**: ni error en pantalla, ni navegación, ni producto. Por eso `ASSIST_IDLE` vive en `lib/ai/assist-state.ts`. Medido sobre el build servido.

## DEC-085 — El panel enseña lo que hay que hacer, no lo que el sistema sabe hacer

**Status:** Accepted *(Incremento 20, sin migraciones, 2026-09-11)*

**Context:** medido a 390×844: los ocho enlaces del menú, todos con el mismo peso, ocupaban **tres filas (68→164 px)** y el contenido de cualquier pantalla del panel empezaba a **245 px** — casi un tercio de la altura útil gastada en recordar todo lo que el sistema es capaz de hacer. En el inicio, tres de las cuatro secciones existían solo para decir que no había nada que hacer.

**Decision:**

- **Un bloque sin contenido no se pinta.** «Ninguna variante activa está por debajo de su umbral» y «todavía no ha entrado ningún pedido» desaparecen: no le sirven a nadie para hacer nada. La excepción es la cola de pedidos, donde **el vacío es la información** («ningún pedido pendiente de atender») y es la pregunta que trae al administrador a esta pantalla.
- **El menú se separa por frecuencia de uso real**, no por área del sistema: *operar* (inicio, pedidos, catálogo, inventario) siempre visible; *configurar* (categorías, colores y tallas, home, ajustes) dentro de un `<details>`. **No se ha quitado ninguna ruta.** Es HTML puro: sin estado, sin efecto, sin JavaScript.
- **`/admin/ajustes` sigue siendo configuración y no se mezcla con la creación.**
- **Sin métricas de vanidad**: ni conversión, ni ingresos, ni CAC, ni ROAS, ni embudos, ni gráficas. Ninguna decisión de esta tienda se toma mirando una curva.

**Alternatives:** (a) Quitar rutas del menú: se pierde acceso a pantallas que hacen falta al montar la tienda. (b) Abrir el `<details>` en escritorio forzando `::details-content`: depende de cómo lo implemente cada motor, y un enlace inalcanzable por un detalle de CSS es peor que un clic de más. (c) Dejar las secciones vacías «para que se vea que el sistema las vigila»: es justo lo que empujaba el único aviso real fuera de la pantalla.

**Consequences:** medido después: el menú pasa de **3 filas a 1** (4 enlaces visibles, el resto a un clic), el contenido empieza a **197 px** en vez de 245, y el inicio solo enseña secciones con algo dentro. El enlace de marca del panel, que medía **28 px**, pasa a 44. TTFB mediano de `/admin` 181 ms y FCP 484 ms sobre el build servido.
