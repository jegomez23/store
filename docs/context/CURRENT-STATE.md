# CURRENT-STATE — Estado real del proyecto

> ⚠️ **Este archivo debe actualizarse al final de CADA fase.** Es la primera consulta para saber dónde estamos. Describe el estado REAL del repositorio, no el deseado.

---

## STATUS

**FASE 9.5 — Panel Operativo · Incrementos 1–4 y 5A/5B/5C: COMPLETADOS**

Última actualización: 2026-09-03

Fase 9 quedó completada salvo la auditoría CWV. Fase 9.5 añade lo que hace el panel *operable a diario*: contacto por WhatsApp desde el pedido (Inc. 1), data layer sin descargas completas (Inc. 2), centro operativo (Inc. 3), inventario con reposición atómica (Inc. 4), **el pedido como expediente** (5A), **publicación consistente** (5B) y **trazabilidad administrativa** (5C).

**Estado global tras 5C:** `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm test` **623/623** · `npm run build` correcto · BD en el baseline exacto · **sin commits**.

**Incremento 5A — qué es real ahora:**

| Pieza | Verificación |
|---|---|
| Tabla `order_notes` (0027 + 0028) | Append-only con `revoke update, delete`; PATCH y DELETE de un admin no alteran la fila (verificado) |
| Autoría no falsificable | Enviar el `actor_id` de otro admin o un uuid inventado devuelve **403** (verificado por POST directo a PostgREST) |
| Invisible fuera del panel | `anon` y autenticado-sin-rol reciben conjunto vacío, con control positivo de admin. La nota no aparece en `/pedido/[numero]` (verificado sobre el build) |
| Sin efectos colaterales | Escribir una nota no cambia `orders.status`, no mueve `orders.updated_at` y no crea ningún `order_event` (verificado) |
| Concurrencia | Dos admins simultáneos → dos filas, cada una con su firma. Diez notas simultáneas → diez filas. Doble submit → dos apuntes (deliberado: una nota no es idempotente) |
| Aislamiento de mercado | La action resuelve el pedido por NÚMERO contra el mercado del servidor: un número de CO enviado desde ES no escribe nada (verificado sobre el build) |
| Progressive enhancement | Todo el E2E se hace por POST `multipart/form-data` **sin JavaScript de cliente** |
| Hilo cronológico | Eventos y notas en un solo orden, con desempate estable probado (evento antes que nota en el mismo instante) |
| Cliente recurrente | Recuento exacto por `(market_id, customer_id)` con `head: true` — **no viaja ni una fila**. Control negativo: en la primera compra no se afirma nada |
| Antigüedad de estado en el listado | Columna "En estado" en escritorio y en la tarjeta móvil |
| `orders.notes` retirada | Ya no viaja del `select` al tipo para no pintarse en ninguna pantalla |

**Decisión de negocio consultada y cerrada:** la dirección de envío va en una nota interna. El checkout **no** se toca y `shipping_address` sigue sin usarse (DEC-049).

**NO hecho en 5A, y consciente:** 5B (publicación consistente) y 5C (trazabilidad de precio/stock/status/deleted_at) siguen pendientes. `OperationsSummary.oldestWaitingAt` continúa siendo un campo que la RPC calcula y ninguna pantalla pinta — retirarlo exige tocar la migración 0023 y su test, y se deja para cuando 5C entre en esa zona. **Nada verificado en navegador:** el repintado tras guardar y el responsive real siguen NO VERIFICADOS.

**Números:** `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm test` **572/572** (111 → 121 suites) · `npm run build` correcto · **E2E 17/17** sobre el build servido · BD devuelta al baseline exacto · **sin commits**.

---

## Incremento 5B — Publicación consistente: COMPLETADO

| Pieza | Verificación |
|---|---|
| El sitemap ya no anuncia 404 | Reproducido ANTES: 2 de 8 URLs del sitemap respondían 404. Ahora, sobre el build servido, **las 8 responden 200** |
| `generateStaticParams` deja de prerenderizar fichas rotas | 6 rutas en vez de 7 con los mismos fixtures |
| El agotado sigue publicándose | Control positivo: su ficha responde 200 y muestra «Agotado». No se inventa la regla de esconderlo |
| Publicar sin variante activa se rechaza | Por la Server Action **y** por POST directo a PostgREST: ambos reciben `NO_ACTIVE_VARIANT` |
| El seed sigue funcionando | El trigger es `deferrable initially deferred`: producto + variantes en la misma transacción es válido |
| Un producto roto se puede editar y despublicar | Corrección de la 0031 sobre la 0030, que lo dejaba bloqueado |
| La alerta lleva a los afectados | `?ver=no-vendibles`, separando «da 404» de «agotado». El número del resumen y la lista salen del mismo predicado, con test que lo comprueba |

**NO hecho, y deliberado:** no hay despublicación automática al desactivar la última variante (fuera de alcance); la invariante «publicado ⇒ publicable» no se garantiza, solo se impide entrar en publicación estando roto. **Nada verificado en navegador.**

**Números de 5B:** `npm test` **592/592** · **E2E 13/13** sobre el build servido · 3 migraciones (0029, 0030, 0031).

---

## Incremento 5C — Trazabilidad administrativa: COMPLETADO

| Pieza | Verificación |
|---|---|
| `admin_change_log` (migración 0032) | Cuatro campos: `status`, `deleted_at`, `price`, `stock`. Nada más |
| Solo el trigger escribe | Un admin recibe error al INSERT, PATCH y DELETE sobre la tabla, con control positivo de que sí la lee |
| El POST directo también se audita | Comprobado sobre el build servido: un `PATCH /product_variants` con la sesión del admin, sin pasar por el panel, deja el mismo registro |
| No duplica `order_events` | Una venta y una cancelación completas dejan **cero** filas en la auditoría; el `order_event` de la cancelación sí guarda actor y unidades |
| Concurrencia | +5 y +7 sobre 10 → 10→15 y 15→22, encadenados. Dos correcciones → 10→20 y 20→30, nunca 10→20 y 10→30. Una corrección rechazada por bloqueo optimista **no deja rastro** |
| No genera basura | 20 → 20 no registra. NULL → NULL tampoco. Nombre, descripción, SEO y umbral no se auditan |
| El borrado lógico sí se registra | `is distinct from` en vez de `<>`: con `<>`, NULL → fecha daría NULL y no se registraría nunca |
| UI sin JSON | En la ficha del producto: «Repuso +8 uds (12 → 20)», «Precio: 19,90 € → 24,90 €», «Retirado de la tienda», con autor y fecha |
| Índice medido | 30.000 registros: Index Scan, 5 buffers, 0,17 ms. Sin índice: Seq Scan de 30.000 filas + top-N heapsort, 406 buffers, 4,09 ms |

**Huecos asumidos, no fallos:** el historial de stock NO incluye ventas ni cancelaciones, así que puede saltar de 24 a 20 sin una entrada. La interfaz lo dice literalmente. **Nada verificado en navegador.**

**Números de 5C:** `npm test` **623/623** · **E2E 10/10** sobre el build servido · 1 migración (0032).

---

## Fase 9 — Estado por categoría

### ✅ IMPLEMENTADO (existe, se ejecuta y está verificado)

| Pieza | Verificación |
|---|---|
| `app/robots.ts` | Servido por HTTP: `text/plain`, `Allow: /`, `Disallow` de `/admin`, `/api`, `/carrito`, `/checkout`, `/pedido`, y `Sitemap:` anunciado |
| **robots ≠ seguridad** | Con `robots.txt` ya publicado, un anónimo sigue recibiendo redirect al login en `/admin` y `/admin/pedidos` |
| `app/sitemap.ts` | XML válido con la home + 4 fichas; **las 5 URLs comprobadas una a una: todas 200**; ninguna ruta de admin, carrito, checkout ni `/categoria` |
| El sitemap solo lleva contenido público | Fixtures reales: un producto en borrador y otro eliminado **no aparecen**, ni siquiera pidiéndolos con la clave anónima (RLS) |
| Metadata de la ficha | canonical propia, `og:title`/`og:url`/`og:image`/`og:site_name`, `twitter:card`, description. `og:image` es la foto real del bucket |
| Metadata de la home | canonical + Open Graph |
| JSON-LD `Product` | Parseado del HTML: `offers.price` con 2 decimales, `priceCurrency` EUR, `availability` derivada del stock REAL, `url` canónica, `image` con URLs públicas de Storage |
| JSON-LD `BreadcrumbList` | Parseado: empieza en Inicio, posiciones 1..n |
| `<` escapado en JSON-LD | Test: un nombre con `</script><img onerror=...>` no deja ni un tag literal en el HTML |
| `app/opengraph-image.tsx` | `/opengraph-image` → 200 `image/png`, 31 KB, generada en build con `next/og` (**sin dependencias nuevas**) |
| Producto inexistente | 404 |
| **Migración `0022`** — `product_images.blur_data_url` | El CHECK rechaza SVG, `text/html`, una URL remota, un data URI de 4100 caracteres y uno demasiado corto — **incluso escribiendo con la service role key** |
| Blur generado en SERVIDOR | Subida real por la Server Action **sin navegador y sin JS**: la fila queda con un data URI de 111 caracteres / **66 bytes**, que es un WebP real de **16 px** verificado con `sharp` |
| El placeholder llega a la ficha | El HTML servido incluye el `data:image/webp;base64,` |
| DEC-036 intacta | El objeto subido sigue siendo WebP recomprimido y más pequeño que el original; al borrar no queda huérfano en el bucket |
| **Invalidación: publicar/retirar** | Retirar → ficha 404 inmediato **y el producto desaparece del sitemap**; publicar → 200 y vuelve al sitemap |
| **Invalidación: categorías** | Crear categoría, regenerar, borrarla con la Server Action real → `/` y `/producto/<slug>` responden `MISS` y ya no la muestran, estable en la segunda lectura |
| Headers de seguridad | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` comprobados en home, ficha y login |
| Sin secretos ni `sharp` en el cliente | 0 ocurrencias de la service role key, de su nombre de variable, de `sharp` y de `lib/supabase/server|admin` en los 796 archivos del build (41 en `.next/static`) |
| `lib/cart` sigue aislado | 0 imports de supabase, data, admin o storage |

### ⚠️ LO QUE SE ENCONTRÓ ROTO Y SE ARREGLÓ

- **El panel de pedidos seguía invalidando por patrón.** `app/admin/(panel)/pedidos/actions.ts` llamaba a `revalidatePath("/producto/[slug]", "page")`, exactamente la forma que DEC-037 había declarado inservible en Fase 8. Consecuencia real: **cancelar un pedido devolvía el stock a la BD y la ficha seguía mostrando el anterior** hasta 5 minutos. Ahora se resuelven los slugs reales de las líneas del pedido y se invalida cada ficha por ruta literal. Un test estático recorre `app/`, `lib/` y `components/` y falla si alguien reintroduce el patrón.
- **El sitemap no se invalidaba con nada.** `sitemap.ts` es un Route Handler cacheado: un producto retirado seguía anunciado a Google aunque su ficha ya diera 404. Ahora se invalida en cada mutación de producto.
- **Un comentario del código mentía.** `updateWhatsAppNumberAction` decía "el número se lee en el checkout". Medido: el número **no aparece en ningún HTML**; lo lee `getCheckoutChannel()` dentro de la Server Action, que no se cachea. Comentario corregido.
- **`getCategories()` no filtraba `is_active` ni `deleted_at`.** No era una fuga —la policy `public_read_active_categories` ya lo tapaba— pero dejaba la defensa entera en manos de RLS. Ahora el filtro también está en la query, como en `products`.

### ✅ DEUDA DE FASE 8 CERRADA

La Fase 8 dejó esto: *"la invalidación del chrome de la tienda no está verificada: dio medidas inconsistentes"* y *"un cambio de categorías no invalida las fichas ya generadas"*.

Se reprodujo **sobre el build de Fase 8, antes de tocar una línea**: crear una categoría, forzar la regeneración de home y ficha con una acción real, borrarla con la Server Action real y medir `x-nextjs-cache`. Resultado idéntico en **tres ejecuciones seguidas**: `/` y `/producto/<slug>` responden `MISS` y ya no muestran la categoría.

Conclusión honesta: **la deuda no era reproducible**. `revalidatePath('/', 'layout')` sí invalida las fichas ya generadas, como dicen los docs de Next 16. La medida inconsistente de Fase 8 venía de comprobar `settings.store_name`, que no se pinta en ninguna página pública. Queda documentado en DEC-041.

### ⬜ PENDIENTE (no iniciado, NO "hecho a medias")

- **Auditoría CWV / Lighthouse**: LCP, INP y CLS **sin medir**. Requiere navegador.
- **Backfill del blur** de las 4 imágenes anteriores a Fase 9 (siguen con `blur_data_url IS NULL` y se pintan sin placeholder). Exige descargar y reprocesar cada objeto: operación externa, no una migración.
- **Redirect 301 al cambiar el slug** de un producto: hoy el slug antiguo pasa a dar 404. `09-SEO-PERFORMANCE.md` §38 lo prevé "en admin futuro".
- **CSP y HSTS**: van con el dominio real (Fase 11, DEC-042).
- **`/categoria/[slug]` e `/info/[slug]`**: no existen; por eso no están en el sitemap ni en el breadcrumb (DEC-039).
- **OG dinámica por producto**: diferida a propósito por la propia `09-SEO-PERFORMANCE.md` §29.
- Heredado y sin tocar en esta fase: promociones, imágenes de home/logo, reset de contraseña, `lib/i18n/`, invalidación por tags, drag&drop.

### ⚠️ DEUDA TÉCNICA NUEVA DE ESTA FASE

- **`revalidatePath('/', 'layout')` es un martillo**: un cambio de categoría o de ajustes tira el caché de TODA la tienda. Correcto hoy (el menú vive en el layout y lo pintan todas las páginas) y barato con 4 productos; con un catálogo grande habrá que reevaluar tags.
- **`NEXT_PUBLIC_SITE_URL` vale `http://localhost:3000`** en este entorno, así que el sitemap y las canonical se emiten con esa base. Es configuración, no código — en producción hay que apuntarla al dominio real o el sitemap será inservible.
- **Los formularios de alta y edición de categorías se montan tras un clic** (estado de cliente), así que sin navegador no están en el HTML y no se pueden ejercitar por POST directo. La invalidación de categorías se verificó por el camino de **borrado**, que sí se renderiza. `createCategoryAction` y `updateCategoryAction` comparten exactamente la misma llamada de invalidación, pero **su POST no está verificado end-to-end**.

---

## Fase 8 (histórico) — CMS de catálogo: estado por categoría

### ✅ IMPLEMENTADO (existe, se ejecuta y está verificado)

| Pieza | Verificación |
|---|---|
| **Migración `0020`** — el admin solo escribe en mercados ACTIVOS (DEC-035) | Crear producto/categoría/home/settings en CO → rechazado por PostgreSQL; **mover un producto de ES a CO → rechazado**; ES sigue funcionando (controles positivos) |
| DEC-022 completada en `home_content`, `promotions` y `shipping_methods` | El contenido de un mercado inactivo ya no es público (verificado con la anon key) |
| Buckets con `file_size_limit` (5 MiB) y `allowed_mime_types` | Consultado en `storage.buckets`; un SVG y un archivo de 5 MB+ son rechazados |
| Índice UNIQUE parcial: una sola imagen principal por producto | La BD rechaza la segunda |
| **Migración `0021`** — `admin_create_variant_matrix` (`SECURITY INVOKER`) | 15 tests: atomicidad (un precio inválido deja 0 variantes), idempotencia, NULL de DEC-019, no-admin y anónimo rechazados |
| `/admin/catalogo` — búsqueda y filtro por estado | Verificado sobre el build servido |
| `/admin/catalogo/nuevo` — crear producto | **Creado por POST directo a la Server Action, sin UI ni JavaScript**, con control positivo: el admin sí, el no-admin y el anónimo no |
| `/admin/catalogo/[id]` — General · SEO · Variantes · Imágenes · Eliminar | Verificado |
| Publicar → la ficha aparece; despublicar → **404 inmediato** (DEC-037) | Medido con `x-nextjs-cache`: MISS tras invalidar |
| **Subida de imagen con conversión a WebP** (DEC-036) | JPEG 4032×3024 → WebP 2000×1500: **×13,2 menos espacio**. El objeto es WebP real y se sirve públicamente |
| Validación por magic bytes | Un SVG y un PHP declarados `image/png` son rechazados; los rechazos **no dejan objetos huérfanos** |
| `/admin/categorias` — jerarquía de 2 niveles | El **tercer nivel lo rechaza el trigger**; borrar una categoría con productos lo rechaza la FK |
| `/admin/home` — los tres bloques reales | Crear, editar, desactivar (deja de ser público) |
| `/admin/ajustes` — nombre, email, redes, WhatsApp | Cambiado por POST directo con control positivo; una URL `javascript:` se rechaza |
| Sin `service_role` y sin `sharp` en el bundle cliente | 0 ocurrencias en los 532 archivos del build |

### ⬜ PENDIENTE (no iniciado, NO "hecho a medias")

- **Promociones**: fuera del alcance acordado. La regla "promoción más favorable" sigue pendiente de Juan.
- **Imágenes de home y logo de tienda** (bucket `content`): el bucket está endurecido y listo, pero no hay UI.
- **Reset de contraseña** por email.
- **Drag&drop** de orden en imágenes y categorías: hoy el orden es un campo numérico.
- `compare_at_price`, SKU editable y umbral de stock bajo desde el panel.
- `lib/i18n/` e invalidación por tags.

### ⚠️ DEUDA TÉCNICA NUEVA DE ESTA FASE

- **La invalidación del *chrome* de la tienda no está verificada**: cambiar el menú de categorías o los ajustes dio medidas inconsistentes entre ejecuciones (`MISS` una vez, `HIT` otras). Lo funcional —publicar, retirar, precio, stock, fotos— sí está verificado y es reproducible.
- Un cambio de categorías **no invalida las fichas ya generadas** (habría que enumerar todos los slugs): tardan hasta 5 min. Desfase cosmético.
- El admin **no ve** el catálogo de un mercado inactivo (consecuencia de DEC-035). Si algún día se desactivara ES, el panel se quedaría sin catálogo; reactivarlo sigue siendo posible porque la policy de `markets` no se tocó.
- `product_images` sigue **sin `blur_data_url`**, que `09-SEO-PERFORMANCE.md` §57 da por hecho. Requiere migración en la fase de SEO.

---

## Fase 7 (histórico) — Panel de pedidos: estado por categoría

### ✅ IMPLEMENTADO (existe, se ejecuta y está verificado)

| Pieza | Verificación |
|---|---|
| Login de admin (`/admin/login`, Supabase Auth email+contraseña) | Login real end-to-end sobre el build servido |
| Logout (`logoutAction`, revoca sesión y limpia cookies) | Verificado |
| `proxy.ts` — renueva la sesión y redirige si no hay ninguna (DEC-031) | **Token marcado como caducado → `Set-Cookie` con un `access_token` distinto y la siguiente request mantiene la sesión** |
| Cookie de sesión `httpOnly` + `Secure` derivado del protocolo | Comprobado en la cabecera `Set-Cookie` real (la librería la enviaba sin `HttpOnly`) |
| Guard real: `app/admin/(panel)/layout.tsx` con `getUser()` + `is_admin()` | Anónimo → redirect; autenticado sin rol → "Acceso denegado"; admin → entra |
| `requireAdmin()` en cada Server Action **y en cada función de `lib/data/admin/`** | Server Action invocada **directamente sin UI y sin JS**, con control positivo: el admin muta, el no-admin y el anónimo no |
| `safeAdminRedirect()` contra open redirect en `?next=` | 6 tests unitarios (absolutas, `//host`, backslashes, bucle al login) |
| `/admin` — dashboard: pedidos por estado, recientes, stock bajo | Verificado con datos reales |
| `/admin/pedidos` — filtro por estado, búsqueda por número, paginación 20/pág. | 22 pedidos reales: 20 en la página 1, navegación a la 2, filtros y estados vacíos |
| `/admin/pedidos/[numero]` — snapshots, totales, cliente, canal, historial | Todos los campos comprobados en el HTML servido |
| Pedido inexistente → **404** con el 404 del panel | Verificado (y corregido: antes devolvía 200) |
| `admin_update_order_status` (migración `0019`, `SECURITY INVOKER`) | 28 tests de integración llamando a la RPC **con el JWT de un usuario** |
| Transiciones impuestas por PostgreSQL; `delivered`/`cancelled` terminales | Cadena completa válida; saltos, retrocesos y repeticiones rechazados |
| `paid` exige `p_payment_confirmed` — jamás automático | Rechazado sin el flag y con el flag a `false` |
| Cada transición escribe su `order_event` con `actor_id` | Verificado; una transición **rechazada** no deja evento |
| `order_events` append-only **incluso para el admin** | UPDATE y DELETE rechazados (403) |
| **Cancelar devuelve el stock exactamente una vez** (DEC-033) | Cancelación simple, repetida, **10 simultáneas** (una triunfa, stock vuelve una vez, un solo evento) y línea con variante borrada |
| `/admin/catalogo` — publicar/retirar producto; stock, precio y activa por variante | Verificado; `market_id`, ids, SKU, color y talla NO son editables |
| `/admin/ajustes` — número de WhatsApp del mercado activo | Cambiado y restaurado por el camino real de la Server Action |
| Invalidación de la tienda tras cambios de stock/precio/publicación | Se hacía con el patrón `'/producto/[slug]'`. **Fase 8 descubrió que ese patrón no invalidaba nada** y lo sustituyó por la ruta literal (DEC-037) |
| RLS intacta y reauditada | **39 comprobaciones con controles positivos de admin** |
| Sin `service_role` en la app | 0 ocurrencias en los 466 archivos del build; `lib/supabase/admin.ts` sigue sin existir |

### 🟡 PREPARADO (código listo, sin uso real todavía)

- `lib/supabase/browser.ts`: sigue **sin consumidor**. Es precisamente lo que permite forzar `httpOnly` en la cookie de sesión.
- Líneas de descuento y envío en pedidos: el detalle las pinta, pero hoy siempre valen 0 (sin promociones ni cálculo de envío).
- `OnlinePaymentChannel` (Fase 11): interfaz y factory existen; falta la implementación.

### ⬜ PENDIENTE

- **CRUD completo de productos**: crear, matriz color×talla, SEO, archivar/desarchivar. Hoy solo se publica/retira y se corrigen stock y precio.
- **Imágenes / Storage desde el panel**: subir, reordenar, marcar principal, alt text. Los buckets siguen vacíos y sin `file_size_limit`/`allowed_mime_types`.
- **Categorías, promociones y editor de home**: no iniciados.
- **Reset de contraseña por email**: `05-ADMIN.md` §2 lo prevé; no implementado.
- `lib/i18n/`: el panel usa `TODO(i18n)` igual que el resto de la app.
- **Invalidación por tags** (`catalog`, `home`, `settings`, `orders`): siguen sin existir porque el data layer usa el cliente de Supabase, no `fetch` etiquetado. Se usa `revalidatePath`.
- GitHub Secrets de CI · fotografías reales · `/categoria/[slug]`.

### ❌ NO IMPLEMENTADO (fuera de alcance deliberado)

- Pagos online, Stripe/MercadoPago/Wompi (Fase 11).
- Login/cuentas de cliente e historial de pedidos para el comprador.
- Emails, SMS, tracking, analytics.
- Rate limiting del checkout (Fase 10).
- Multi-admin con roles granulares, import/export CSV, reportes.

### ⚠️ DEUDA TÉCNICA

- **Sin navegador automatizado en este entorno**: ningún clic real del panel está comprobado. Lo que sí se validó: 78 comprobaciones end-to-end sobre el build servido, 39 de RLS, 38 de sesión y 295 tests. Los *hydration mismatch* y el repintado tras una acción **no** están verificados.
- `order_items` **no guarda la imagen** del producto: un pedido histórico no puede mostrar la foto (heredado de Fase 6, documentado en `03-DATABASE.md`).
- `create_order` sigue siendo un endpoint público sin autenticación: se pueden crear pedidos basura que consuman stock. Mitigación (rate limiting) prevista para Fase 10.
- `is_admin()` e `is_active_market()` conservan `EXECUTE` para PUBLIC (herencia de Fases 3/4.5). Necesario para que las policies se evalúen, e inocuo para un anónimo, pero no está acotado a `anon`/`authenticated`.
- **Las policies de admin no filtran por mercado**: un admin ve ES y CO. El filtrado por `market_id` es responsabilidad del código (`lib/data/admin/*` y `variantBelongsToMarket()`), no de RLS.
- **Cancelar un pedido `shipped` devuelve stock** aunque la mercancía haya salido físicamente. Es coherente con el modelo (se descontó al crear) y queda auditado, pero si el negocio necesita distinguir "devolución" de "cancelación" harán falta estados nuevos.
- `npm test` corre en serie (`--test-concurrency=1`) porque las suites de integración comparten la misma instancia real de Supabase. Sube el tiempo de ~20 s a ~37 s.
- Cobertura: `lib/cart/`, `lib/checkout/`, `lib/whatsapp/` y `lib/admin/` tienen tests; `lib/money/` y `lib/data/` siguen sin ellos.

---

## Fase 6 (histórico) — Checkout por WhatsApp

Primer checkout real. Migración `0018`: `create_order` (`SECURITY DEFINER`) resuelve precio, stock, nombre, color, talla y totales dentro de PostgreSQL, descuenta stock con guard atómico y crea `orders` + `order_items` + `order_events` en una transacción. `order_counters` (DEC-027) y `client_request_id` + fingerprint (DEC-028). `lib/checkout/` (dominio) y `lib/whatsapp/` (canal) separados; `getCheckoutChannel()` mantiene DEC-007.

Validado con 40 tests de integración usando la anon key: precio manipulado (1 € sobre una variante de 89,90 €) → el pedido guarda 89,90 €; 10 compras simultáneas contra 3 unidades → exactamente 3 tienen éxito; doble submit, 3 reintentos y 3 pestañas → un solo pedido. **Sin service_role, sin policies públicas de INSERT, sin dependencias nuevas.**

## Fase 5 (histórico) — Carrito

Carrito local funcional, persistente y desacoplado del checkout (`lib/cart/`: reducer puro + storage versionado + context), `/carrito`, contador en Header/BottomNav. 108 tests. **Límite explícito:** el carrito no es autoridad de nada; `unitPrice` y `stockSnapshot` son snapshots de UX editables por el usuario, y hay un test que lo documenta.

## Fase 4.5 (histórico) — La validación que hizo posible todo lo demás

Fases 3 y 4 se escribieron sin poder ejecutarlas. La 4.5 conectó el repo a un Supabase real (PostgreSQL 17.6) y ejecutó todo por primera vez: 17 migraciones aplicadas, seed idempotente, `types/database.types.ts` generado, RLS validada empíricamente (78 comprobaciones), Storage validado, **`npm run build` pasando por primera vez**.

**7 bugs reales corregidos, ninguno teórico:** rutas de Storage rotas, precios redondeados a «90 €», 404 de producto en blanco, home sin destacados, seed no idempotente, DEC-022 (catálogo de mercado inactivo público) y DEC-023 (TRUNCATE concedido a `anon`).

---

## Pendientes heredados

- [ ] **GitHub Secrets** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — acción manual en GitHub. Sin ellos CI falla. Ver `11-ENVIRONMENT.md` §4.1. **Único bloqueo externo pendiente.**
- [ ] **Fotografías reales** en los buckets `products`/`content` — vacíos a propósito. `RemoteImage` cae a `MockImage`. El pipeline está verificado.
- [ ] **Endurecer los buckets**: sin `file_size_limit` ni `allowed_mime_types`. Cobra sentido cuando el panel suba imágenes (no en esta fase).
- [x] ~~Primer admin real~~ — **creado en Fase 7** (fila real en `profiles` con `role='admin'`). El alta sigue siendo manual y fuera de banda (DEC-020): no existe signup ni ningún camino en la app que conceda el rol.
- [ ] **Stack local con Docker** (`npm run db:start`) sigue sin probarse: este entorno no tiene Docker. El flujo remoto sí está validado.
- [ ] `/categoria/[slug]` y `lib/i18n/` — sin cambios.
- [ ] Recorrido manual en un navegador real (tienda **y** panel).

---

## Resumen ejecutable

La tienda vende y **ahora se puede operar**. El catálogo se sirve desde Supabase; el checkout crea pedidos reales resolviendo precio y stock en PostgreSQL; y el panel permite iniciar sesión, ver los pedidos, moverlos por su ciclo y cancelarlos devolviendo stock. Todo verificado contra la instancia real, no deducido.

Lo que **no** existe todavía y no debe confundirse con hecho: crear productos, imágenes, categorías, promociones y editor de home.

> Leyenda: **IMPLEMENTADO** (existe y funciona) · **PREPARADO** (código listo, sin uso real aún) · **PENDIENTE** (documentado, no iniciado) · **NO IMPLEMENTADO** (fuera de alcance deliberado) · **DEUDA TÉCNICA** (existe y funciona, pero con una limitación conocida).

---

## Stack real detectado

| Tecnología | Versión | Notas |
|---|---|---|
| Next.js | **16.3.3** | App Router, Turbopack por defecto, `proxy.ts` en uso desde Fase 7 |
| React / React DOM | **19.2.8** | `useActionState` + `useFormStatus` en los formularios del panel |
| TypeScript | ^5 (strict) | Alias `@/*` → raíz del proyecto |
| Tailwind CSS | **^4** | Sintaxis `@theme inline` |
| ESLint | ^9 flat config | `eslint-config-next` core-web-vitals + typescript |
| Node.js | ≥ 20.9 requerido por Next 16 | La suite corre con `--experimental-strip-types` |

### Cambios críticos de Next.js 16 que afectan al código

- `middleware.ts` deprecado → **`proxy.ts`** (runtime Node.js). En uso.
- APIs de request **siempre asíncronas**: `await params`, `await searchParams`, `await cookies()`.
- Type helpers globales: `PageProps<'/ruta'>`, `LayoutProps<'/ruta'>`. Regenerar con `npx next typegen` al añadir rutas.
- Una **Server Function es un POST a la ruta donde se usa**: un cambio de `matcher` puede sacarla de la cobertura del proxy. Por eso cada action verifica por su cuenta.
- **En RSC el layout y la página se renderizan en paralelo**: un guard en el layout no impide que la página hermana se renderice (ver DEC-034).
- Un `loading.tsx` compromete el código HTTP antes de resolver la página: rompe el 404 de `notFound()` en rutas hijas.
- `revalidateTag(tag, perfil)` exige segundo argumento; existen `updateTag()` y `refresh()`. **Hoy se usa `revalidatePath`.**
- Cache Components (`use cache`) existe pero está **desactivado** (DEC-004).

---

## Estructura actual del repositorio

```
store_ropa/
├── proxy.ts                    # IMPLEMENTADO (Fase 7) — sesión viva + guard optimista
├── app/
│   ├── layout.tsx · globals.css · not-found.tsx
│   ├── robots.ts · sitemap.ts · opengraph-image.tsx   # Fase 9
│   ├── (store)/                # tienda pública (Fases 2-6)
│   │   ├── carrito/ · checkout/ · pedido/[numero]/ · producto/[slug]/ · page.tsx
│   └── admin/                  # IMPLEMENTADO (Fase 7)
│       ├── (auth)/login/       # page.tsx + actions.ts (login y logout) — SIN guard
│       └── (panel)/            # layout.tsx = guard real (getUser + is_admin)
│           ├── page.tsx        # dashboard
│           ├── error.tsx       # boundary del panel
│           ├── pedidos/        # page.tsx + actions.ts + [numero]/{page,not-found}.tsx
│           ├── catalogo/       # page.tsx + actions.ts + image-actions.ts (F8)
│           │   ├── nuevo/      # crear producto (Fase 8)
│           │   └── [id]/       # editar: general, SEO, variantes, imágenes (Fase 8)
│           ├── categorias/     # page.tsx + actions.ts (Fase 8)
│           ├── home/           # page.tsx + actions.ts (Fase 8)
│           └── ajustes/        # page.tsx + actions.ts
│                               # NO hay loading.tsx: rompería el 404 (ver AI-DEVELOPMENT §12)
├── components/
│   ├── ui/                     # Button, Container, Badge, Divider, SectionHeading,
│   │                             # icons, MockImage, RemoteImage, QuantityStepper
│   ├── store/                  # Header, BottomNav, Footer, ProductCard, VariantPicker,
│   │                             # cart/, checkout/
│   └── admin/                  # Fase 7: AdminShell, AdminSkeleton, LoginForm,
│                                 # LogoutButton, OrderStatusBadge, OrdersFilters,
│                                 # OrderStatusForm, ProductStatusToggle, VariantRow,
│                                 # WhatsAppNumberForm
│                                 # Fase 8: FormBits, ProductForm, VariantMatrix,
│                                 # ProductImages, CategoryForms, HomeBlockForms,
│                                 # StoreSettingsForm, DeleteProductButton
├── lib/
│   ├── supabase/               # server.ts · browser.ts · static.ts · proxy.ts (F7)
│   │                             # cookies.ts (F7, fuerza httpOnly) · admin.ts NO EXISTE
│   ├── admin/                  # Fase 7: auth.ts (DAL), orders.ts, catalog.ts,
│   │                             # redirect.ts. Fase 8: slug.ts, products.ts,
│   │                             # variants.ts, images.ts, content.ts, revalidate.ts
│   │                             # + __tests__/ (lógica pura e integración)
│   ├── storage/                 # IMPLEMENTADO (Fase 8) — product-images.ts (sharp,
│   │                             # SOLO servidor: nunca en bundle cliente)
│   ├── data/
│   │   ├── categories · home · products · settings   (público)
│   │   └── admin/              # Fase 7: orders.ts, catalog.ts · Fase 8: cms.ts
│   ├── seo/                    # Fase 9: urls.ts + json-ld.ts (PUROS) + __tests__/
│   ├── cart/ · checkout/ · whatsapp/ · money/ · markets.ts
├── types/database.types.ts     # GENERADO — regenerar con npm run db:types tras migrar
├── supabase/
│   ├── migrations/             # 22 migraciones aplicadas y verificadas
│   │                             # (0019 = F7; 0020 y 0021 = F8; 0022 = F9, blur)
│   └── seed/                   # seed dev ES, idempotente
└── docs/                       # 01–11 + rules/ + context/
```

---

## Funcionalidades

| Funcionalidad | Estado |
|---|---|
| Design tokens, primitivos UI, store shell | ✅ Fases 1-2 |
| Esquema de BD (18 tablas, RLS, Storage) | ✅ Aplicado y verificado contra Postgres 17.6 real |
| Data layer público + Home y ficha reales | ✅ Fase 4 / 4.5 |
| Carrito local persistente | ✅ Fase 5 |
| Checkout por WhatsApp con pedido real | ✅ Fase 6 (DEC-026) |
| **Autenticación de admin (login, logout, sesión, guard)** | ✅ **Fase 7 (DEC-031)** |
| **Panel de pedidos (lista, detalle, estados, historial)** | ✅ **Fase 7 (DEC-032)** |
| **Cancelación con devolución de stock** | ✅ **Fase 7 (DEC-033)** |
| **CMS: crear/editar productos, SEO, publicar** | ✅ **Fase 8 (DEC-035, DEC-037)** |
| **Matriz de variantes color × talla** | ✅ **Fase 8 (migración 0021)** |
| **Imágenes en Storage con conversión a WebP** | ✅ **Fase 8 (DEC-036) — ×13,2 menos espacio** |
| **Categorías con jerarquía de 2 niveles** | ✅ **Fase 8** |
| **Editor de bloques de home** | ✅ **Fase 8** |
| **Ajustes: nombre, email, redes, WhatsApp** | 🟡 **Fase 8** — sin logo, políticas ni métodos de envío |
| Promociones | ⬜ Pendiente — bloqueada por la regla "promoción más favorable" |
| Reset de contraseña · `lib/i18n/` · invalidación por tags | ⬜ Pendiente |
| SEO técnico (sitemap, robots, JSON-LD) | ⬜ **Fase 9** — `robots.ts` debe bloquear `/admin` |
| Pagos online | 🔮 Fase 12 |

> Regla: "documentado" ≠ "implementado". Solo se marca ✅ lo que existe en código y se ha ejecutado.

---

## Dependencias

### Instaladas

`next@16.3.3`, `react@19.2.8`, `react-dom@19.2.8`, `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `typescript@^5`, `eslint@^9`, `eslint-config-next@16.3.3`, `@supabase/supabase-js@2.112.4`, `@supabase/ssr@0.12.5`, `sharp@0.35.3` (Fase 8, DEC-036), `supabase@2.116.0` (CLI, devDependency), tipos de React/Node.

**Fase 9 no añadió ninguna.** La imagen Open Graph usa `next/og`, que viene dentro de Next 16; el placeholder blur lo genera `sharp`, que ya estaba.

**Fase 8 añadió `sharp@^0.35.3`**, aprobada explícitamente por Juan (DEC-036). Ya venía instalada como dependencia transitiva de Next 16; ahora es explícita porque la usa `lib/storage/product-images.ts`. Es la primera dependencia nueva desde Fase 1.

**Fase 7 no añadió ninguna.** Ni UI kit, ni librería de formularios, ni validación: los formularios usan `useActionState`/`useFormStatus` de React 19 y la validación es manual (DEC-029).

### Explícitamente no instaladas

Zustand, Framer Motion, shadcn/ui, React Hook Form, Zod. Ver `/docs/rules/frontend.md` #17-18.

---

## Configuración pendiente conocida

- [ ] GitHub Secrets — **único bloqueo externo pendiente** (DEC-021, `11-ENVIRONMENT.md` §4.1).
- [ ] Subir imágenes reales a `products`/`content` y endurecer los buckets.
- [ ] `robots.ts` que bloquee `/admin` (Fase 8). Hoy cada página del panel lleva `robots: { index: false }` en su metadata, pero no hay `robots.txt`.
- [ ] Headers de seguridad en `next.config.ts` (Fase 10).
- [ ] Rate limiting del checkout (Fase 10).
- [ ] Recorrido manual en navegador real de tienda **y** panel.
- [ ] Assets de marca reales y copy final aprobado — pendiente de Juan.
- [ ] Regla "promoción más favorable" — pendiente de Juan; bloquea promociones.

---

## Próximos pasos (según ROADMAP, renumerado en DEC-038)

→ **FASE 10 — Testing**: consolidar la red de seguridad antes de producción. `node:test` (DEC-025) ya cubre 438 tests; falta decidir si hacen falta Vitest para componentes y Playwright para E2E de navegador — **que es justo lo que este entorno no puede hacer hoy**, y por eso los CWV y cualquier clic real siguen sin verificar.

Dos cosas siguen esperando a Juan:
1. **Promociones.** Bloqueada por la regla "promoción más favorable", que nadie ha definido. Afecta a precios, carrito, checkout y pedidos: no se puede implementar a medias.
2. **Dominios definitivos.** Sin ellos, `NEXT_PUBLIC_SITE_URL` sigue en `localhost` y el sitemap de producción no sirve.

Antes del deploy (Fase 11) quedan además: CSP y HSTS, el backfill del blur de las 4 imágenes del seed, y el redirect 301 al cambiar un slug.

---

## Historial de estados

| Fecha | Fase | Nota |
|---|---|---|
| 2026-08-26 | Fase 0 | Documentación y sistema de contexto completados |
| 2026-08-31 | Fase 1 | Cimientos técnicos: clientes Supabase, tokens YI, primitivos UI, CI mínimo. Cero negocio |
| 2026-08-31 | Fase 2 | Store shell + Home + ficha con datos mock. DEC-016 (mantener Geist) |
| 2026-08-31 | Fase 3 | Esquema completo (15 migraciones) + RLS + Storage + seed. **Sin Docker: nunca ejecutado** |
| 2026-08-31 | Fase 4 | Data layer real; `lib/mock/` eliminado; DEC-021. `npm run build` fallaba sin backend |
| 2026-09-01 | Fase 4.5 | **Primera ejecución real de todo.** 7 bugs reales corregidos; build pasa por primera vez |
| 2026-09-01 | Fase 5 | Carrito local real, 108 tests. DEC-024, DEC-025 |
| 2026-09-01 | Fase 6 | **Primer checkout real.** Migración `0018` (`create_order`); 227 tests. DEC-026…DEC-030 |
| 2026-09-02 | Fase 8 | **La tienda pasa a poder llenarse sin SQL.** CMS de catálogo: CRUD de productos con SEO, matriz de variantes atómica (migración `0021`), categorías con jerarquía, imágenes en Storage con conversión a WebP en servidor (**×13,2 menos espacio**, DEC-036), editor de home y ajustes. Migración correctiva `0020` aplicada **antes** del CMS: el admin ya no puede escribir en un mercado inactivo (DEC-035), DEC-022 completada en las 3 tablas que la `0016` se dejó, buckets endurecidos y unicidad real de la imagen principal. **Tres problemas reales corregidos**: escritura cruzada ES→CO, DEC-022 incumplida y —el más grave— **la invalidación por patrón no invalidaba nada**, así que un producto despublicado seguía comprándose (DEC-037). Roadmap renumerado (DEC-038). 391 tests + 78 comprobaciones end-to-end + 53 de integración nuevas. Una dependencia nueva aprobada: `sharp` |
| 2026-09-02 | Fase 9 | **La tienda pasa a ser indexable.** `robots.ts`, `sitemap.ts` (solo contenido público y todas sus URLs comprobadas a 200), metadata canónica + OG con la foto real, JSON-LD `Product`/`BreadcrumbList`, OG image de la home con `next/og` y placeholder blur generado en servidor (migración `0022`, DEC-040). **Matriz de invalidación medida** (DEC-041): se reprodujo primero la deuda de Fase 8 —resultó NO reproducible: `revalidatePath('/', 'layout')` sí invalida las fichas— y se corrigió un fallo todavía vivo: el panel de pedidos seguía invalidando por patrón, así que **cancelar un pedido devolvía stock que la ficha no mostraba**. El sitemap pasa a invalidarse con cada mutación de producto. Headers de seguridad (DEC-042). 438 tests + 75 comprobaciones E2E + 16 del blur + 12 de integración nuevas. Sin dependencias nuevas. **CWV sin medir: no hay navegador** |
| 2026-09-02 | Fase 7 | **La tienda pasa a ser operable.** Auth de admin + `proxy.ts` (DEC-031); migración `0019` con la máquina de estados en PostgreSQL (DEC-032) y devolución de stock al cancelar (DEC-033); data layer admin sin service role y con guard por función (DEC-034). Panel de pedidos completo; catálogo y ajustes mínimos. **Dos debilidades reales corregidas** (cookie sin `httpOnly`; el guard del layout no frenaba el render de la página hermana en RSC) y **un bug de comportamiento** (`loading.tsx` convertía el 404 del detalle en 200). 295 tests + 78 comprobaciones end-to-end + 39 de RLS + 38 de sesión. Sin dependencias nuevas |
