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

## Decisiones abiertas (resumen para revisión humana)

| ID | Tema | Quién decide |
|---|---|---|
| — | Pasarela de pago futura (Stripe recomendado para ES; evaluar Wompi/MercadoPago para CO) | Juan (Fase 11) |
| — | Dominios definitivos por mercado | Juan (antes de Fase 10) |
| ~~—~~ | ~~Formato definitivo de `order_number`~~ | ✅ Resuelto en DEC-027 (`YI-ES-000001`) |