# CURRENT-STATE — Estado real del proyecto

> ⚠️ **Este archivo debe actualizarse al final de CADA fase.** Es la primera consulta para saber dónde estamos. Describe el estado REAL del repositorio, no el deseado.

---

## STATUS

**FASE 9.5 — Panel Operativo · Incrementos 1–4, 5A/5B/5C, 6, P2, P3, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20 y 21: COMPLETADOS**
**FASE 10 — CSP/HSTS (DEC-086) hechos · Límites anti-abuso del checkout (DEC-088, migraciones `0046` y `0047`): COMPLETADO**

Última actualización: 2026-10-10

Fase 9 quedó completada salvo la auditoría CWV. Fase 9.5 añade lo que hace el panel *operable a diario*: contacto por WhatsApp desde el pedido (Inc. 1), data layer sin descargas completas (Inc. 2), centro operativo (Inc. 3), inventario con reposición atómica (Inc. 4), **el pedido como expediente** (5A), **publicación consistente** (5B), **trazabilidad administrativa** (5C), **colores y tallas administrables** (Inc. 6), el **detector de publicados sin foto** (P2), la **búsqueda de pedidos por teléfono y nombre** (P3), la **subida de varias fotos** (Inc. 7), el **envío con total fiable** (Inc. 8), los **métodos de entrega administrables** (Inc. 9), el **bloqueo de venta sin WhatsApp real + el detector de fotos rotas** (Inc. 10) y, con los incrementos **16 y 17**, la **identidad de la tienda fuera del código** —nombre, frase y **logo**—, un **checkout que avisa antes de que el cliente rellene nada**, un **estado de venta accionable** y, con los incrementos **18 y 19**, la **recuperación de contraseña del administrador** y un **catálogo preparado para vender**.

Con el incremento **20**, el panel deja de enseñar todo lo que el sistema sabe hacer y enseña lo que hay que hacer ahora: **dar de alta un producto empezando por la foto**, con una capa de IA que **propone y nunca decide**.

**Estado global tras el incremento 20:** lint limpio · tsc limpio · **npm test 1114/1114** · build correcto · **E2E 37/37 + 12/12 (inc. 20) + 44/44 (inc. 19) + 45/45 (inc. 18) + 78/78 (inc. 17) + 69/69 (inc. 16) + 30/30 (inc. 15) + 25/25 (inc. 14) + 30/30 (inc. 13) + 36/36 (inc. 12)** en Chrome real sobre el build servido · BD y Storage en el baseline verificado · **sin commits**.

---

## Incremento 20 — Admin minimalista y alta de producto asistida: COMPLETADO

**Qué se midió antes** (Chrome 153, 390×844, build servido):

| Medida | Antes | Después |
|---|---|---|
| Campos visibles en `/admin/catalogo/nuevo` | **13** | **4** |
| Control de archivo en el alta | **ninguno** | sí, y es lo primero (297 px) |
| Alto de la pantalla de alta | ~2,5 pantallas | 1223 px |
| Acción «añadir producto» en `/admin` | **no existía** | primaria, primera pantalla |
| Secciones del inicio que decían «no hay nada que hacer» | **3 de 4** | 0 |
| Filas del menú del panel | **3** (68→164 px) | **1** (4 enlaces; 4 más a un clic) |
| Inicio del contenido en cualquier pantalla del panel | 245 px | 197 px |
| Enlace de marca del panel (objetivo táctil) | **28 px** | 44 px |

**Qué se hizo:**

- **Alta de producto foto primero** (`components/admin/NewProductFlow.tsx`): la foto, cuatro campos imprescindibles (nombre, categoría, descripción corta, descripción) y el resto dentro de «Información avanzada» plegada. El producto se crea **en borrador** y **con su foto ya subida en el mismo envío** (`createProductWithPhotoAction`), reutilizando la tubería de imágenes del catálogo. Precio, stock y tallas **no se piden aquí**: viven en las variantes.
- **Capa de asistencia por IA** (`lib/ai/`): un puerto `ProductAssistant`, un adaptador sobre la API de Claude y una Server Action que **no puede escribir nada**. La IA propone nombre, descripción, categoría y color; lo que no se ve en una foto **no existe en el tipo de la sugerencia** (DEC-083, DEC-084).
- **Panel simplificado** (DEC-085): los bloques sin contenido dejan de pintarse, el menú se separa entre operar y configurar sin perder ninguna ruta, y no hay ni una métrica de vanidad ni una gráfica.

~~**Dependencia nueva:** `@anthropic-ai/sdk`~~ — **RETIRADA en el incremento 21** (DEC-087). El proveedor pasó a ser Gemini y su API es JSON plano, así que el adaptador habla por `fetch`: el proyecto vuelve a tener **cero dependencias de IA**.

⚠️ **La integración con el proveedor NO está verificada de extremo a extremo, y no se va a decir que sí.** Este entorno **no tiene `ANTHROPIC_API_KEY`**. Lo verificado en Chrome real es: (a) sin clave, el botón sale desactivado, la pantalla lo explica y **crear un producto funciona igual**; (b) con una clave que existe pero no vale, la petición **sale de verdad** hacia el proveedor, vuelve un 401, la pantalla dice «El asistente no ha podido ayudar esta vez. Rellena la ficha a mano.» sin jerga ni códigos, no se rellena ningún campo a medias y el formulario sigue guardando. **Lo que falta por comprobar es la calidad de una sugerencia real**, y para eso hace falta una clave válida de Juan.

**Verificación:** `npm test` **1114/1114** (26 nuevos: lista blanca y negra, validación contra el catálogo real, «no determinado», respuestas rotas, e invariantes de seguridad leídas del propio código) · **E2E 37/37** del flujo completo de alta con foto real subida a Storage · **E2E 12/12** del asistente caído · **perf 9/9** (`/admin` TTFB 181 ms, FCP 484 ms) · lint, tsc y build verdes · BD y Storage devueltos al baseline (4 productos, 0 imágenes, 0 pedidos, 1 perfil, 1 usuario de Auth, bucket vacío) · **sin commits**.

---

## Incremento 19 — Catálogo preparado para vender: COMPLETADO

**Cero migraciones.** Nada de funcionalidad nueva por si acaso: cuatro fricciones comerciales **medidas en Chrome** sobre el catálogo real, y sus arreglos.

| Problema encontrado (medido) | Estado |
|---|---|
| **El botón de comprar quedaba a 1,3 pantallas de scroll.** El hueco de la foto que no existe ocupa 520 px: `h1` a 639, precio a 748, tallas a 920, CTA a **1108 px** | Sin foto el hueco pasa a proporción ancha. Medido después: `h1` **363**, precio **472**, tallas **644**, CTA **832 px** — tallas y botón **dentro de la primera pantalla** |
| **Un producto agotado ofrecía botones de compra activos** y en ningún sitio ponía «agotado»: el cliente pulsaba comprar y se le pedía elegir una talla que no se podía pulsar | La disponibilidad se calcula sobre TODAS las variantes. Sin stock: CTA deshabilitados, «Agotado por ahora» junto al precio, y ya no se pide lo imposible |
| **El carrito llamaba «Total» —y en rojo— a una cifra sin envío.** 34,90 € rotulado Total, 39,80 € cobrados | Se llama «Subtotal», que es lo que es. El importe no cambia; el rótulo deja de mentir |
| **`og:image` era `null`** y la tarjeta era `summary`: un producto compartido o usado como destino de anuncio iba **sin imagen** | Respaldo a la portada de la tienda; tarjeta siempre grande. La foto del producto manda cuando existe |
| El cliente no sabía el envío hasta el último paso | Ficha y carrito lo dicen, **siempre desde `shipping_methods`**: «Envío desde 4,90 € · gratis a partir de 60,00 € · recogida en tienda sin coste» |
| En el panel, «publicados sin foto» dejaba al administrador arriba del formulario de edición | Cada fila lleva a `#imagenes` con el rótulo «Subir foto →». Verificado: el destino tiene el control de subida |

**Riesgo que apareció al implementarlo y se cerró:** al leer `shipping_methods` en `/carrito`, Next la seguía marcando `○ (Static)` **sin revalidación** — el precio de envío habría quedado horneado en el build. Es el mismo fallo que el incremento 8 midió en `/checkout`. Se cierra con `revalidate = 300` **y** con que las tres acciones de métodos de entrega ahora invaliden el escaparate (la nota del incremento 9 que decía lo contrario queda corregida en el código y en la matriz).

**Lo que NO se tocó porque ya funcionaba** (verificado, no supuesto): la talla sin stock ya se deshabilitaba y se tachaba; el carrito conserva la variante exacta (`Piedra/M` llega igual al `order_item`); el precio de la ficha es el que se cobra y el que viaja a WhatsApp; el pedido sigue siendo snapshot; la atribución entra por la ficha y llega al pedido.

**Rendimiento medido** (build servido, p50 de 9 peticiones): `/` **12 ms / 32,5 KB** · ficha **10 ms / 27,5 KB** · `/carrito` **8 ms / 18,4 KB** · `/checkout` 200 ms. En navegador, 5 cargas en frío: landing **20 peticiones, 254,3 KB, LCP 160 ms**; ficha **22 peticiones, 259,2 KB, LCP 192 ms**. La ficha y el carrito hacen **una consulta más** (los métodos de envío), en paralelo con lo que ya pedían. El build sigue igual: `/` y `/carrito` estáticas con ISR, las fichas `● (SSG)`.

> ⚠️ **LO QUE FALTA NO ES CÓDIGO: SON LAS FOTOS.** Los 4 productos siguen sin ninguna imagen, y es lo único que separa esta ficha de estar lista para un anuncio — el cliente entiende qué es, cuánto cuesta, qué tallas hay y cuánto cuesta el envío, pero **no ve el producto**. La vía está probada de punta a punta (incrementos 7 y 17) y el panel lleva de «publicados sin foto» directamente al control de subida. Subirlas no requiere tocar código.

> ⚠️ **La tienda sigue sin poder vender hasta que se escriba el número de WhatsApp real** en `/admin/ajustes` (DEC-065).

**Fuera de alcance, y documentado como decisión pendiente:** promociones, cupones y descuentos siguen esperando la regla de acumulación; el footer anuncia «Envíos · Devoluciones (próximamente)», que exige una política real escrita por el negocio antes de poder publicarla.

**Estado global tras el incremento 19:** lint limpio · tsc limpio · **npm test 1088/1088** · build correcto · **E2E 44/44** en Chrome 153 headless a 390×844 sobre el build servido · BD y Storage en el baseline · **sin commits**.

---

## Incremento 18 — Recuperación de contraseña del administrador: COMPLETADO

**Cero migraciones, cero tablas, cero tokens propios.** Perder la contraseña del panel dejaba al administrador fuera sin salida; ahora hay una, y es la de Supabase Auth.

| Pieza | Verificación |
|---|---|
| Salida desde el login | «¿Has olvidado tu contraseña?» debajo del botón, 44 px, lleva a `/admin/recuperar` |
| **No enumera cuentas** | Los tres casos —email no registrado, formato inválido y registrado de verdad— dan **exactamente la misma pantalla** (comprobado comparando el texto completo). Medido en Supabase: `POST /auth/v1/recover` devuelve 200 y cuerpo vacío exista o no la cuenta |
| Campo vacío | Único error de forma que se muestra: no dice nada de ninguna cuenta |
| **El enlace del email funciona** | Siguiendo el `action_link` real: se aterriza en `/admin/reset-password`, se pinta el formulario con el email de la cuenta, y **el token desaparece de la barra de direcciones** |
| Enlace inválido, caducado, ya usado o a pelo | Mensaje ÚNICO «Este enlace no sirve» + botón para pedir otro. No se distingue el motivo |
| **Un solo uso** | Medido contra Supabase: el segundo canje del mismo token devuelve **403 · otp_expired**. Verificado también en navegador reabriendo el enlace ya usado |
| Política de contraseñas | La del proyecto y solo esa: **mínimo 6**, sin mayúsculas ni símbolos inventados. Si el servidor rechaza, se muestra **su** mensaje |
| Validaciones | Campos vacíos, contraseñas distintas y contraseña corta, cada una con su mensaje. Mostrar/ocultar funciona |
| Cambio efectivo | La contraseña nueva entra al panel; **la antigua deja de entrar** |
| **Cierra la sesión de recuperación** | Al guardar vuelve al login con «Contraseña actualizada. Entra con la nueva», así el acceso vuelve a pasar por `is_admin()` |
| **AUTENTICADO ≠ ADMINISTRADOR** | Una cuenta **sin perfil** recupera su contraseña con normalidad, entra en Supabase Auth… y **no entra al panel**: se le dice «Esta cuenta no tiene acceso al panel», `/admin` la sigue rebotando y **no se le ha creado ningún perfil** |
| Login intacto | Correcto, incorrecto con mensaje genérico, logout, protección de `/admin`, `?next=` respetado y sesión persistente: todo sigue igual |
| Móvil 390×844 | Sin desbordamiento en las tres pantallas. **Todos los objetivos táctiles ≥44 px** — el botón mostrar/ocultar medía 40 y se corrigió |
| El proxy sigue sin autorizar | Gana una lista de rutas públicas y **no consulta el rol** (DEC-031 intacta, con test que lo comprueba) |
| Sin `service_role` | Ningún archivo del flujo la toca, y hay un test que lo verifica archivo por archivo |

**Lo que NO se ha hecho, y es deliberado:** ningún código maestro, segunda contraseña, preguntas de seguridad, recuperación por WhatsApp, endpoint secreto ni bypass administrativo. Tampoco un rate limiter propio: Supabase ya limita de verdad (`over_email_send_rate_limit` y `over_request_rate_limit`, los dos medidos en esta auditoría).

> ⚠️ **DEPENDE DE CONFIGURACIÓN EXTERNA: la ENTREGA del correo.** El SMTP integrado de Supabase está limitado —respondió `429` durante esta auditoría— y en proyectos alojados solo entrega a miembros del equipo. **Para que el administrador reciba el email de verdad hay que configurar un SMTP propio** en el panel de Supabase. Todo lo demás del flujo está verificado contra el proyecto real; en los tests el enlace se obtiene con `admin/generate_link`, que ocupa el lugar del buzón que este entorno no tiene. **No se declara «recuperación por email verificada».**

> ℹ️ **Mejora opcional documentada:** con una plantilla de email que use `{{ .TokenHash }}` (Authentication → Email Templates), el enlace apunta a `/admin/auth/confirm` y **el token no pasa nunca por JavaScript**. La ruta ya existe y está probada. Con la plantilla por defecto el token llega en el fragmento de la URL y lo recoge un componente cliente mínimo (DEC-079).

**Rendimiento medido** (build servido, p50 de 9 peticiones): `/admin/login` **34 ms** · `/admin/recuperar` **24 ms** · `/admin/reset-password` **23 ms** · `/admin` 8 ms (307 al login) · `/` 13 ms. Las tres pantallas de acceso son `ƒ (Dynamic)`, como ya lo era el login: dependen de cookies de sesión y **no había nada estático que convertir**. La tienda pública no cambia: `/` sigue `○ (Static)` con ISR y las fichas `● (SSG)`.

**Estado global tras el incremento 18:** lint limpio · tsc limpio · **npm test 1064/1064** · build correcto · **E2E 45/45** en Chrome 153 headless a 390×844 sobre el build servido + **9 de integración** contra Supabase real · BD y Storage en el baseline · **sin commits**.

---

## Incremento 17 — Logo administrable, estado de venta accionable y dos límites que estaban rotos: COMPLETADO

**Cero migraciones.** El bucket `content` ya tenía las policies correctas desde la `0015` y `settings.logo_url` existía desde la `0013`: lo que faltaba era la pantalla. Lo que sí apareció fueron **dos fallos reales medidos**, uno de ellos en una funcionalidad que se daba por terminada.

| Pieza | Verificación |
|---|---|
| **Logo administrable** | Subir → guardar → usar, desde `/admin/ajustes`. Un PNG de 900×300 sale como **WebP de 512×171 y 1 KB**; el panel confirma medidas y peso, y el administrador ve el resultado al instante |
| Validación reutilizada | Un **SVG disfrazado de PNG** se rechaza por su CONTENIDO (magic bytes), no por lo que declara el navegador. Un archivo de 8 MB: «La imagen pesa 8.3 MB y el máximo son 5 MB». **Ninguno de los dos deja rastro** |
| **Sustituir no deja huérfanos** | Objeto nuevo → referencia → borrar el viejo. Tras sustituir queda **exactamente un objeto** en el bucket. Quitar el logo deja `logo_url` a NULL y borra su objeto |
| **Cada subida es una ruta NUEVA, y hay motivo** | Medido: tras borrar un objeto, su URL pública **sigue devolviendo 200** un rato — la sirve un CDN por delante de Storage. Sobrescribir la misma ruta dejaría al cliente viendo el logo anterior sin arreglo posible desde el panel |
| Seguridad | anon y autenticado-sin-rol **no** pueden subir, borrar ni cambiar la referencia; el objeto queda intacto tras cada intento. El cliente lo LEE sin sesión. **Sin `service_role`** |
| **El logo llega al cliente** | Cabecera con `alt` = nombre de la tienda, caja de altura reservada (32 px, sin salto de layout), por `next/image`, y **el nombre no se repite al lado**. Sin logo, la cabecera vuelve al nombre escrito |
| **Estado de venta = lista, no semáforo** | Se ven **siempre las dos comprobaciones**, con ✓ o ✕. Antes, un fallo escondía el requisito que sí se cumplía y el administrador no sabía si estaba bien o sin mirar. Cada fallo lleva **su botón** (44 px) al ancla que lo arregla; sin fallos, cero botones |
| Un solo criterio, y ahora demostrado | `SALE_CHECKS` es la única declaración; los bloqueos son `checklist.filter(no pasa)`. Un test comprueba que coinciden **exactamente** en los cuatro estados posibles. Se retira `getSaleBlockers`, que se quedó sin consumidores |
| **P1 corregido: el lote de fotos NUNCA cupo** | El incremento 7 configuró 26 MB para la Server Action, pero `proxy.ts` bufferiza el cuerpo con un tope propio de **10 MB**. Medido con el formulario real del catálogo: **3 fotos × 4,84 MB → «Algo ha fallado», 0 subidas**. Tras derivar `proxyClientMaxBodySize` de la misma constante: **3 subidas** |
| **P0 evitado: el logo rompía el Open Graph** | Con el logo como data URI WebP, `/opengraph-image` devolvía **500** (`TypeError: u2 is not iterable`): **`next/og` no sabe decodificar WebP**, verificado en su código compilado. Se convierte a PNG con `sharp` y cualquier fallo cae al diseño tipográfico anterior. Ahora **200 · image/png · 30,3 KB** |

**Lo que se verificó y NO se tocó** (el encargo era comprobar, no cambiar):

- **Réplicas.** Dos productos públicos distintos pueden apuntar al mismo artículo externo: misma `supplier_ref` en variantes de productos distintos, proveedores distintos, y el `sku` sigue siendo único (409 al repetirlo). El cliente no puede leer ninguna de las dos columnas ni con la anon key.
- **Precio histórico.** `order_items` es un snapshot completo. Subir el precio de la variante y renombrar el producto **no tocan ni una línea** de un pedido ya hecho, y `line_total` cuadra consigo mismo. Es la condición que tendrán que cumplir las promociones el día que existan: **ya se cumple**.
- **Meta Ads.** Las siete claves llegan íntegras desde la URL al `sessionStorage` (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `landing_path`) y de ahí a `orders.attribution`. Sin cookies nuevas, sin cambiar la política de consentimiento.

**Rendimiento medido** (build servido, p50 de 9 peticiones, sin logo → con logo): `/` **7 → 6 ms** · ficha **7 → 7 ms** · `/checkout` **160 → 156 ms** (+6 KB de HTML por el marcado del logo) · `/opengraph-image` **5 → 6 ms** y 30,3 KB. En el build, `/` sigue saliendo `○ (Static)` con ISR de 5 min y las fichas `● (SSG)`: **cargar el logo desde Storage no ha vuelto dinámica ninguna página**. Landing en Chrome con logo: 20 peticiones, 253,9 KB, **LCP p50 152 ms**. La regeneración de la tarjeta de Open Graph añade una petición a Storage y una conversión a PNG, como mucho una vez cada 5 minutos.

**NO implementado, y deliberado:** DAM, biblioteca multimedia, selector de logos, recorte, favicon derivado del logo, editor de páginas, bloques, rich text, temas, colores o fuentes configurables, promociones, descuentos, cupones, entidad `suppliers`, campo `replica`, Meta Pixel y Conversions API.

**Estado global tras el incremento 17:** lint limpio · tsc limpio · **npm test 1039/1039** · build correcto · **E2E 78/78** (42 panel + 36 cliente) en **Chrome 153 headless** a 390×844 sobre el build servido · BD y Storage devueltos al baseline exacto · **sin commits**.

> ⚠️ **El navegador de este entorno se actualizó a Chrome 153.0.8010.36** entre el incremento 16 y este. Las mediciones se hicieron sobre esa versión, no sobre la 152 de los incrementos anteriores.

> ⚠️ **LA TIENDA SIGUE SIN PODER VENDER, Y SIGUE SIENDO DELIBERADO.** El número de WhatsApp del seed sigue en la base de datos. La diferencia de este incremento: el panel ahora lo dice como lista con un botón que lleva directo al campo, y el cliente lo sabe al entrar en `/checkout`. Los 4 productos siguen sin foto — y desde este incremento el lote de fotos **sí se puede subir**.

---

## Incremento 16 — La identidad de la tienda sale del código, y el cliente no rellena un checkout que no puede terminar: COMPLETADO

Tres migraciones (0042, 0043 y 0044) y ninguna abstracción nueva. La pregunta que guía el incremento no era «¿qué más se puede configurar?» sino «¿qué obliga hoy a desplegar, y qué puede romper una venta?».

| Pieza | Verificación |
|---|---|
| **El nombre de la tienda deja de estar en el código** | Estaba escrito a mano en **cinco sitios** —título y plantilla del layout raíz, `og:site_name` y títulos de la home, `og:site_name` de cada ficha, logo del Header e imagen de portada— y ninguno leía `settings`. E2E: el `<title>`, el `<meta description>`, el logo, el `og:site_name` de la home y de la ficha y el Footer salen todos de la fila de la BD; cambiarlo en el panel lo refleja una ruta dinámica **sin desplegar** |
| **`settings.tagline` (0042)** | La frase estaba **duplicada cinco veces** y no existía como columna. Ahora es editable, y **vacío significa vacío**: sin frase no se pinta ninguna descripción, nunca un texto por defecto (verificado: al borrarla, «Vive a tu propio ritmo.» desaparece de la tienda) |
| **`/opengraph-image` pasa a ISR de 5 min** | Era un archivo horneado en el build con la marca escrita a mano: la imagen que se ve al pegar el enlace en WhatsApp o en un anuncio se habría quedado con el nombre viejo. Sigue respondiendo 200 y `image/png` |
| **Cero consultas nuevas en la tienda** | `getStorefrontSettings` es `cache()` de React y el layout ya la llamaba para el Footer. En el build, `/` sigue siendo `○ (Static)` con ISR de 5 min y las fichas `● (SSG)` |
| **`/checkout` pregunta ANTES de pintar el formulario** | Reproducido en Chrome con el estado real del repositorio: el cliente rellenaba nombre, teléfono y método de entrega y **solo al pulsar «COMPRAR POR WHATSAPP»** recibía `CHECKOUT_NOT_CONFIGURED`. Ahora la página no se pinta: mensaje neutro, salida al carrito y **el carrito no se pierde** |
| **El cliente no se entera de CÓMO está configurada la tienda** | Los `title`/`fix` de los bloqueos son del administrador. Hay un test que falla si «WhatsApp», «métodos de entrega» o el código del bloqueo aparecen en `/checkout` |
| **Una sola respuesta a «¿puede vender?»** | El test que impedía duplicar el criterio en el panel ahora cubre también `/checkout`. `getSaleBlockers` carga los datos para quien no los tiene; quien ya los tiene (`/checkout`, `/admin/ajustes`) llama al criterio directamente — **medido**: hacerlo de la otra forma costaba +85 ms por carga |
| **Integridad en PostgreSQL (0042 + 0043)** | Medido ANTES, con sesión de admin y sin pasar por el panel: `store_name` en blanco, `instagram_url` con `javascript:` y un email inválido devolvían **200 y se guardaban** — y el segundo acaba en el `href` del footer de todas las páginas. Ahora **23514** en los tres, con controles positivos |
| **`supplier` y `supplier_ref` dejan de ser legibles por `anon` (0044)** | El incremento 13 verificó que la ficha no las **pinta**; seguían pudiéndose **pedir** a PostgREST con la anon key (200). Hoy están a NULL, así que no había fuga: había una puerta. Ahora **401 · 42501**, y el escaparate sigue leyendo lo suyo |
| **`/admin/ajustes` ordenado para un móvil** | Antes empezaba por una tabla de solo lectura y el campo de WhatsApp quedaba el último, detrás de un formulario de alta. Ahora: estado de venta → WhatsApp → entrega → identidad → solo lectura. Cada bloqueo **enlaza** a la sección que lo arregla, y un test comprueba que esas anclas existen |
| **Objetivo táctil de «Editar» un método** | **Medido a 390 px: 20 px de alto**, el interlineado de su propio texto — y es el gesto que hay que acertar para cambiar lo que cobra la tienda. Ahora 44 px o más, como todos los demás (17 objetivos medidos, mínimo 44) |

**El recorrido que este incremento tenía que hacer posible, verificado en Chrome a 390×844:** abrir Ajustes → ver «Venta bloqueada» → tocar el bloqueo → escribir el número → guardar → **ver «Lista para vender» sin recargar**. Y: abrir un método → cambiar 4,90 → guardar → la fila enseña 6,90 → **el cliente ve 6,90 en el checkout**.

**Rendimiento medido** (build servido, p50): `/` **9 ms** · `/carrito` 7 ms · ficha 7 ms · `/sitemap.xml` 4 ms · `/opengraph-image` 6 ms · `/checkout` **195 ms** · `/admin/ajustes` 435 ms · `/admin` 430 ms · `/admin/inventario` 340 ms. La landing carga **19 peticiones y 258,5 KB**, de las cuales 3 son prefetches RSC que dependen del tiempo de espera de la medida: **no es comparable con las 17 / 222 KB del incremento 15**, medidas con otra ventana. Lo que sí es comparable y es el dato importante: **este incremento no añade ni un solo script de cliente**. `/checkout` paga una consulta más que antes del incremento, en paralelo con la que ya hacía; costó 231 ms cuando esa consulta era secuencial y quedó en 195 ms al resolverla con la lista de métodos que la página ya carga.

**NO implementado, y deliberado:** subida de logo, editor de políticas, Meta Pixel, Conversions API, banner de consentimiento, historial de cambios de configuración, tabla de proveedores y cualquier `settings` genérico de clave/valor.

**Estado global tras el incremento 16:** lint limpio · tsc limpio · **npm test 990/990** · build correcto · **E2E 69/69** (33 cliente + 36 panel) en Chrome 152 headless a 390×844 sobre el build servido · BD y Storage devueltos al baseline exacto · **sin commits**.

> ⚠️ **LA TIENDA SIGUE SIN PODER VENDER, Y SIGUE SIENDO DELIBERADO.** El número de WhatsApp del seed (`34600000000`) sigue en la base de datos, así que desde DEC-065 el checkout rechaza las compras — y desde este incremento **el cliente lo sabe nada más entrar en `/checkout`**, en vez de descubrirlo tras rellenar el formulario. Se arregla escribiendo el número real en `/admin/ajustes`. Los 4 productos siguen sin foto.

---

## Incremento 15 — Configuración operativa administrable: COMPLETADO

Lo que ya era editable se verificó de punta a punta; lo que estaba roto o a medias se arregló. **Sin cambios de esquema.**

| Pieza | Verificación |
|---|---|
| WhatsApp administrable de verdad | E2E: se escribe `+34 611 222 333` en el panel → se guarda `34611222333` → el pedido se crea → **el enlace `wa.me` lleva el número nuevo**, no el del seed |
| Validación | El número del seed y uno de 3 dígitos se rechazan con mensaje claro y **no** se guardan |
| Estado de venta con UNA fuente | `resolveSaleBlockers` decide, y lo consumen el panel de inicio y Ajustes. Antes el inicio solo miraba WhatsApp y no veía el segundo bloqueo real: quedarse sin métodos de entrega activos |
| Envío configurable, histórico intacto | Cambiar 4,90 € → 6,90 € se refleja en el checkout, y **el pedido anterior sigue cobrando 4,90 €** (verificado en integración y en E2E) |
| Configuración fantasma eliminada | `contact_email` y las redes eran editables **sin que nada las pintara**. Ahora salen en el footer de toda la tienda, y al guardar se ven en la siguiente carga (`revalidateStorefront`) |
| `settings` por columna (0041) | Medido ANTES: `GET /settings?select=*` con la anon key devolvía la fila entera. Ahora **401 · 42501**, y las columnas públicas siguen dando 200. Una columna nueva nace privada |
| Autorización | anon y autenticado-sin-rol no escriben; anónimo redirigido al login; precio, umbral y nombre inválidos los rechaza PostgreSQL (23514) |
| Móvil | 390 px sin desbordamiento; objetivos táctiles ≥44 px (la casilla mide 20 px, pero su `<label>` envolvente —que es el objetivo real— mide 44) |

**Rendimiento medido** (build servido): `/admin/ajustes` p50 **748 ms** · `/admin` 665 ms · `/checkout` 336 ms · landing (HTML) **59 ms**. La landing añade **una consulta** por render de ISR (el footer) y sigue en 17 peticiones y 222 KB. LCP p50 216 ms; **la medida de LCP en este momento es ruidosa** —una página NO tocada por el incremento marcó 1296 ms de mediana en la misma tanda—, así que no se afirma ni mejora ni regresión.

**NO implementado, y deliberado:** subida de logo, editor de políticas, Meta Pixel ID, historial de cambios de configuración (`admin_change_log` tiene `product_id NOT NULL`: es el historial del catálogo) y cualquier settings genérico.

---

**Estado global tras el incremento 14:** lint limpio · tsc limpio · **npm test 942/942** · build correcto · **E2E 25/25 (inc. 14) + 30/30 (inc. 13) + 36/36 (inc. 12) en Chrome real sobre el build servido** · BD y Storage en el baseline verificado · **sin commits**.

---

## Incremento 14 — Atribución mínima: de qué anuncio vino el pedido: COMPLETADO

| Pieza | Verificación |
|---|---|
| `orders.attribution jsonb` (0040) | Siete claves: los cinco UTM, `fbclid` y `landing_path`. **Sin PII por construcción**: `create_order` lee una lista blanca y descarta el resto |
| Captura | `sessionStorage`, **first touch**: la segunda campaña de la sesión no pisa a la primera (verificado en Chrome). Una pestaña nueva empieza de cero |
| No rompe el SSG | Se lee `window.location.search` en un `useEffect`, no `useSearchParams()`: el HTML servido es idéntico con y sin UTMs y `/` sigue siendo estática con ISR de 5 min |
| Compra completa desde un anuncio | E2E real: entrar con 6 parámetros → navegar por `/carrito` y `/` → añadir al carrito → checkout → **el pedido conserva la atribución exacta** |
| Tráfico directo | El pedido se crea con `attribution = null`, y el panel lo dice: «— directo» |
| Nunca rompe una venta | Valor de 3000 caracteres → recortado a 200 · objeto de 100 KB → `null` · tipos absurdos → descartados · `sessionStorage` corrupto → pedido creado igual. **En todos los casos la compra se completa** |
| Nada de PII | Un `email=` en la URL no llega a la tabla (verificado en E2E y en integración) |
| Histórica | Un reintento con OTRA campaña devuelve el mismo pedido y **no reescribe** el origen. La atribución no entra en el fingerprint |
| Una sola puerta | La firma de 7 parámetros de `create_order` se elimina; solo existe la de 8 (verificado leyendo el esquema OpenAPI del proyecto real) |
| Privacidad | `anon` no puede leerla ni escribirla; no aparece en el HTML de `/`, de la ficha ni de `/pedido/[numero]` |
| Panel | Una línea en el pedido: «instagram · paid · lanzamiento». Sin JSON crudo, sin pantalla nueva |

**Rendimiento medido en la landing** (mediana de 5 cargas en frío, Chrome, 390 px): **+1 petición y +1,1 KB** (221,6 → 222,7 KB). LCP 164 ms frente a 184 ms medidos antes del incremento: **sin cambio apreciable**, la diferencia está dentro del ruido.

**NO hecho, y deliberado:** Meta Pixel, Conversions API, banner de consentimiento, dashboard de marketing y ROAS (falta el coste publicitario). Los puntos exactos de integración del Pixel están escritos en `docs/12-ATTRIBUTION.md` §8.

---

**Estado global tras el incremento 13:** lint limpio · tsc limpio · **npm test 902/902** · build correcto · **E2E 36/36 (inc. 12) + 30/30 (inc. 13) en Chrome real a 390 px sobre el build servido** · BD y Storage en el baseline verificado · **sin commits**.

---

## Incremento 13 — Proveedor y referencia externa: COMPLETADO

Dos columnas de texto, ninguna entidad nueva. Responden a «¿de dónde viene esto y qué referencia pido cuando me llegue disponibilidad?».

| Pieza | Verificación |
|---|---|
| `products.supplier` · `product_variants.supplier_ref` (0039) | Texto libre con CHECK de «no en blanco» y ≤ 120. **Sin tabla de proveedores, sin `market_id` propio, sin índice** |
| **Sin UNIQUE, a propósito** | Verificado contra Supabase real: dos productos distintos comparten proveedor **y** referencia sin error, y dos variantes del mismo producto también. Lo que sigue siendo único es el `sku` (control positivo: SKU repetido → 409) |
| La referencia no se normaliza | `abc-123-blk/m` se guarda exactamente así. Convertirla a mayúsculas sería inventarse el formato del proveedor |
| Integridad | Escribir referencia no cambia stock, sku, precio, `is_active`, color ni talla (comparación campo a campo antes/después). Escribir proveedor no toca ninguna variante |
| No entra en la auditoría | `admin_change_log` sigue registrando solo `price`, `stock`, `status` y `deleted_at`: escribir una referencia deja **cero** filas |
| No viaja al pedido | `order_items` no tiene la columna y no se le añade: el snapshot guarda lo que el cliente compró, no de dónde se surte la tienda |
| Autorización | anon y autenticado-sin-rol: **0 filas afectadas** y dato intacto (RLS responde 200 con lista vacía, no 403). Mercado inactivo (CO): 0 filas |
| Límites en PostgreSQL | `'   '` → 23514 · 121 caracteres → 23514 · 120 justos → 200 |
| Búsqueda | El inventario busca por nombre, slug, **proveedor** y **referencia**, en las MISMAS dos consultas de antes: `supplier` va en el `or` de productos y `supplier_ref` en el `or` de variantes |
| Invisible para el cliente | Verificado sobre el build servido: la ficha pública del producto **no contiene** ni el proveedor ni la referencia |

**Rendimiento medido sobre el build servido** (5 peticiones, p50): `/admin/inventario` **337 ms** · con búsqueda **424 ms** · ficha de producto **481 ms**. Consultas: **1** sin búsqueda y **2** con búsqueda, igual que antes del incremento. `scrollWidth == 390` sigue cumpliéndose.

**NO hecho, y deliberado:** el buscador del **catálogo** (`/admin/catalogo`) sigue mirando solo nombre y slug — el flujo de stock pasa por Inventario y ahí es donde se necesita. Sin índice para `ilike '%…%'` (un btree no lo sirve; GIN + `pg_trgm` es una extensión nueva para un catálogo de 4 productos).

---

## Incremento 12 — Inventario operativo: «Dejar en X» + «Agotar»: COMPLETADO

El stock ahora se ESCRIBE, no se suma: la fuente externa dicta «hay 12» y el panel copia ese número.

| Pieza | Verificación |
|---|---|
| `admin_set_variant_stock` (0038) | `mode='set'` con testigo obligatorio · `mode='exhaust'` escribe 0 sin testigo porque converge. 24 tests de integración contra Supabase real |
| No perder cambios | Dos admins con el mismo testigo → uno guarda y el otro recibe `STOCK_CHANGED`. Un testigo viejo NO pisa el valor nuevo. **Una VENTA también caduca el testigo**: escribir encima habría borrado el pedido en silencio |
| Todo o nada | Lote M=4/L=0/XL=7 con la L cambiada por debajo → **ninguna de las tres se guarda**, verificado leyendo las tres filas después |
| Agotar | 7 → 0; 0 → 0 sin error; solo toca su variante; **no despublica ni desactiva** (comprobado sobre el producto y sobre `is_active`) |
| Escribir lo mismo no escribe | 7 → 7 no mueve `updated_at` (no caduca testigos ajenos) y no deja auditoría |
| Auditoría | Queda como `correccion` con actor, sku, valor anterior y nuevo. **Sin categoría nueva en el CHECK** |
| Mercado | Variante de CO enviada como ES → `VARIANT_NOT_IN_MARKET`; `p_market_id: CO` tampoco escribe (RLS exige mercado ACTIVO) |
| Autorización | anon y autenticado-sin-rol rechazados por POST directo a la RPC, con control positivo de admin |
| **Buscador arreglado** | Antes: CUALQUIER búsqueda en `/admin/inventario` caía en «Algo ha fallado» (`400 PGRST100`, columna embebida dentro de un `or`) — reproducido en el navegador. Ahora busca por nombre, slug y SKU en dos consultas |
| **Barra del panel arreglada** | Antes, a 390 px el documento medía **833 px** y TODAS las pantallas del panel se desplazaban de lado. Ahora `scrollWidth == 390` en las 5 pantallas medidas |
| Móvil de verdad | Campos y botones de 48 px (mínimo pedido: 44). Un formulario por producto; tras guardar, el campo muestra el valor nuevo sin recargar y sin salir de la página |
| Sin JavaScript | La pantalla se sirve entera con los scripts apagados y **guarda por POST `multipart/form-data`** |

**Retirado del panel, no de la BD:** `admin_restock_variants` (0026) sigue intacta y probada, pero ninguna pantalla la llama (DEC-068). Con ella se van `restockVariantsAction` y los ayudantes de parseo del delta.

**NO hecho, y deliberado:** no hay edición masiva entre productos, ni importador, ni historial de inventario. **No se ha medido el rendimiento con catálogo grande**: con 4 productos y 9 variantes no significaría nada.

> ⚠️ **LA TIENDA NO PUEDE VENDER AHORA MISMO, Y ES DELIBERADO.** El número de WhatsApp sigue siendo el del seed (`34600000000`), así que desde DEC-065 el checkout rechaza las compras en vez de registrar pedidos que no le llegan a nadie. Se arregla escribiendo el número real en `/admin/ajustes`. Los 4 productos siguen **sin foto** (ahora contados como tales, que es la verdad): se suben desde `/admin/catalogo`.

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

## Incremento 5C — Trazabilidad administrativa: COMPLETADO (corregido por la 0033)

| Pieza | Verificación |
|---|---|
| `admin_change_log` (migración 0032) | Cuatro campos: `status`, `deleted_at`, `price`, `stock`. Nada más |
| Solo el trigger escribe | Un admin recibe error al INSERT, PATCH y DELETE sobre la tabla, con control positivo de que sí la lee |
| El POST directo también se audita | Comprobado sobre el build servido: un `PATCH /product_variants` con la sesión del admin, sin pasar por el panel, deja el mismo registro |
| No duplica `order_events` | Una venta y una cancelación completas dejan **cero** filas en la auditoría; el `order_event` de la cancelación sí guarda actor y unidades |
| Concurrencia | +5 y +7 sobre 10 → 10→15 y 15→22, encadenados. Dos correcciones → 10→20 y 20→30, nunca 10→20 y 10→30. Una corrección rechazada por bloqueo optimista **no deja rastro** |
| No genera basura | 20 → 20 no registra. NULL → NULL tampoco. Nombre, descripción, SEO y umbral no se auditan |
| El borrado lógico sí se registra | `is distinct from` en vez de `<>`: con `<>`, NULL → fecha daría NULL y no se registraría nunca |
| UI sin JSON | En la ficha del producto: «Repuso +12 uds (20 → 32)», «Precio: 25,00 € → 22,00 €», «Retirado de la tienda», con autor y fecha — **comprobado en el HTML del build servido** |
| El límite se dice | Con más de 20 cambios la ficha avisa de que enseña solo los últimos; no promete un historial completo |

### ⚠️ Lo que se encontró ROTO en la 0032 y se corrigió en la 0033

Los tres se **reprodujeron contra el proyecto real** antes de tocar nada.

| Fallo | Medido antes | Después de la 0033 |
|---|---|---|
| **La auditoría podía DENEGAR una venta.** `actor_id` referencia `profiles` y la puerta era `auth.uid() is not null`: un autenticado sin perfil hacía saltar la FK dentro de `create_order` | `409 · 23503 · Key (actor_id)=… is not present in table "profiles"`, transacción deshecha, **pedido no creado**, stock intacto en 10 | **200**, pedido creado, stock cobrado 10 → 8, cero filas de auditoría |
| **Una compra con sesión de admin se auditaba como decisión.** Solo se excluía `admin_update_order_status` | `stock, 10 → 8, source=rpc` → la ficha pintaba «Stock corregido: 10 → 8» | Cero filas, con control positivo de que el stock sí se movió |
| **El historial sobrevivía al aislamiento de mercado.** Única tabla del admin cuya policy decía solo `is_admin()` | Producto → `[]`; su historial → sku, precio anterior y precio nuevo, legibles | Producto → `[]` y historial → `[]`, con la fila **intacta** en la tabla: se esconde, no se borra |

**Huecos asumidos, no fallos:** el historial de stock NO incluye ventas ni cancelaciones, así que puede saltar de 24 a 20 sin una entrada. La interfaz lo dice literalmente. **Nada verificado en navegador.**

**Rendimiento — lo que se midió y lo que no:** `EXPLAIN` **no es obtenible en este entorno**: el proyecto hosted responde `PGRST107` al `Accept: application/vnd.pgrst.plan`, no hay `psql` ni driver de Postgres, y crear una función auxiliar solo para medir ensuciaría el historial de migraciones. Los números de plan que esta ficha traía antes vienen de una sesión anterior y **no se han podido reverificar**. Lo que sí se midió aquí, con 30.000 filas y el mismo producto acumulando 10.000: la consulta real de la ficha pasa de **p50 110 ms (tabla vacía) a 130 ms**, y de 116 a 130 ms comparada consigo misma sin RLS —todo dentro del RTT de red—, es decir **no escala con el tamaño de la tabla**. No se ha añadido ningún índice: el de la 0032 sigue igual.

**Números de 5C:** `npm test` **626/626** · **E2E 15/15** sobre el build servido, sin navegador · 2 migraciones (0032 + 0033).

---

## Incremento 6 — Colores y tallas administrables: COMPLETADO

Antes de esto, añadir un color exigía un `INSERT` a mano en Supabase: era el **único paso del alta de un producto que obligaba a salir del panel**.

| Pieza | Verificación |
|---|---|
| `/admin/atributos` — listar, crear, editar, retirar y eliminar colores y tallas | E2E sobre el build servido: creado, editado y retirado **por POST `multipart/form-data` sin JavaScript de cliente** |
| Sin migración de esquema | `is_active`, `unique(slug)`, `unique(label,size_group)` y el CHECK de los tres grupos **ya existían** desde la 0004. La 0034 solo endurece |
| `hex_code` deja de admitir basura | Reproducido antes: `"rojo"` → 201, guardado como `'rojo   '` (`char(7)` rellena). Ahora 23514. Las 4 filas del seed ya cumplían el patrón, así que la migración entró sin tocar datos |
| Un valor retirado no crea variantes nuevas | Reproducido antes: la RPC devolvía `{"created":1}` con un color inactivo. Ahora `INVALID_COLOR` / `INVALID_SIZE`, con control positivo de que activo sí crea (DEC-061) |
| …y las variantes que ya lo usan siguen editándose | PATCH de precio y stock sobre una variante con color retirado: aceptado. Es el motivo de validar en la transición y no con un CHECK sobre la fila |
| No se borra lo que está en uso | `DELETE` de color y de talla en uso → **23503**, y la variante queda intacta. Sin usar → se borra |
| Renombrar no reescribe el pasado | Con un pedido REAL: `order_items.color_name` y `size_label` no cambian; la variante viva sí muestra el nombre nuevo |
| Unicidad bajo concurrencia | Dos altas simultáneas del mismo slug → una 201 y una 23505, **una sola fila**. Igual con `(label, grupo)`. Doble submit → una fila |
| anon y no-admin | 42501 al crear, editar y borrar, con control positivo de admin |
| Globales, no por mercado | Test que **afirma** que `colors`/`sizes` no tienen `market_id` y que `sizes` no tiene `slug` (DEC-062) |

**Corregido sobre la marcha:** los formularios de edición estaban tras un `useState`, así que **no existían en el HTML sin JavaScript** — la misma deuda que la Fase 9 dejó apuntada con las categorías. Se cambiaron a `<details>`: ahora van servidos y el E2E puede ejercitarlos por POST.

**Límite conocido, no tapado:** las casillas de color y talla de la matriz de variantes son `<button onClick>` (Fase 8), así que **seleccionarlas necesita JavaScript**. Lo que sí se verificó sin navegador es qué se ofrece y qué no, leyendo el payload servido. **Nada verificado en navegador.**

**Números:** `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm test` **678/678** · `npm run build` correcto · **E2E 26/26** sobre el build servido · 1 migración (0034) · BD en el baseline exacto · **sin commits**.

---

## Incremento P2 — Publicados sin foto: COMPLETADO

Un producto se podía publicar sin una sola fotografía y **nada en el panel lo decía**: el cliente veía un recuadro gris y el dueño no se enteraba.

| Pieza | Verificación |
|---|---|
| Definición | Publicado (`active` + `deleted_at is null`) sin ninguna imagen **utilizable** |
| La url vacía cuenta como sin foto | `product_images.url` es NOT NULL pero **admite `''`** (comprobado: 201). El renderizador público la trata como ausencia, así que el detector también. Sin esto, ese producto se escapaba |
| Sin migración, sin RPC, sin tocar RLS | PostgREST **sí** sabe expresar el `NOT EXISTS`: `product_images!left(id)` + `product_images=is.null`. Un comentario del repositorio afirmaba lo contrario; corregido |
| Recuento sin traer filas | `count: "exact"` + `head: true` |
| Recuento y lista no pueden discrepar | Salen del mismo constructor (`withoutImageQuery`) |
| El predicado | Detecta SinFoto y UrlVacia; **no** detecta ConFoto, DosFotos, Borrador, Archivado ni borrado lógico |
| Reversible | Subir una foto lo saca de la lista y baja el aviso de 2 a 1; borrarla lo devuelve |
| Aviso NEUTRO y separado | Sin rojo, sin «urgente». **No se suma** a `unsellable_products`: el rojo sigue significando solo «no se puede comprar» |
| No bloquea publicar | `enforce_publishable_product` **sin tocar**. La ficha del producto sin foto responde 200 sobre el build servido |
| Accionable | El aviso enlaza a `?ver=sin-foto` y cada fila a su ficha, donde ya se suben imágenes |

**Nueva superficie de escritura: NINGUNA.** El incremento es solo de lectura, así que no hay concurrencia nueva que probar.

**Qué NO protege, y conviene no exagerarlo:** un producto publicado ya es público. Verificado que `anon` ve los publicados —son la tienda— y no ve borradores ni archivados, y que la ruta del panel le redirige al login. El detector no expone ni un dato nuevo.

**EXPLAIN: NO DISPONIBLE** (`PGRST107` en este proyecto hosted). **No se añadió ningún índice**, así que tampoco hacía falta: la consulta se apoya en los que ya existen (`idx_product_images_product_id`, `idx_products_public`). Con 4 productos, "va rápido" no significa nada y no lo afirmo.

**Números:** `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm test` **688/688** · `npm run build` correcto · **E2E 22/22** sobre el build servido · **0 migraciones** · BD en el baseline exacto · **sin commits**.

---

## Incremento P3 — Buscar pedidos por teléfono y nombre: COMPLETADO

El canal es WhatsApp: lo único que el cliente trae consigo es su número, y era justo por lo que **no se podía buscar**. Antes solo existía `ilike` sobre `order_number`.

| Pieza | Verificación |
|---|---|
| Los tres caminos a la vez | Número, teléfono y nombre en una sola caja. **Sin heurística**: `000003` es a la vez cola de número y trozo de teléfono, así que adivinar fallaría justo ahí |
| Teléfono pegado del chat | `+34 600 999 888` encuentra a `34600999888`. `customers.phone` se guarda solo con dígitos, así que se extraen del texto |
| Nombre con tilde y ñ | «Bruno Núñez» encuentra su pedido. La normalización anterior lo destruía: dejaba «BRUNONEZ» |
| Nombre parcial | «Ana» devuelve los pedidos de dos clientes distintos |
| Unión sin duplicados | Un token que casa por número **y** por teléfono no repite filas; el recuento coincide con las filas |
| Dos consultas, y por qué | **PostgREST NO admite una columna embebida dentro de un `or=(…)`**: devuelve `PGRST100 · failed to parse logic tree` (medido). Se resuelve con `or` sobre `customers` y luego `or` sobre columnas reales de `orders` |
| Sin migración, sin RLS, sin índices | Cero cambios de esquema |
| Aislamiento de mercado | Los mismos `market_id` que ya filtraban ambas tablas. Buscar en CO no encuentra fixtures de ES |
| anon y no-admin | Cero resultados; `orders` y `customers` no tienen policy pública. La ruta redirige al login |
| Inyección | `%`, `*`, `a,b)`, `name.ilike.*x*` y `a)or(b` ni rompen la consulta ni listan de más |

### ⚠️ Lo que se encontró ROTO durante el incremento

**Buscar `%` devolvía TODOS los pedidos.** Medido sobre el build servido: el saneado dejaba la búsqueda vacía, y una búsqueda vacía se comportaba como "no he buscado", así que la pantalla listaba los tres pedidos de prueba — que se lee como «tu búsqueda lo ha encontrado todo». Ahora se distingue "no buscar" de "buscar algo inservible": cero resultados y un mensaje que lo explica.

**Límite conocido y declarado en la propia interfaz:** los acentos cuentan — «Perez» **no** encuentra «Pérez» (verificado, con control positivo de que con tilde sí). Y si la búsqueda casa con más de 200 clientes, el resultado puede estar incompleto y se avisa. **Nada verificado en navegador.**

**Números:** `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm test` **723/723** · `npm run build` correcto · **E2E 18/18** sobre el build servido · **0 migraciones** · BD en el baseline exacto · **sin commits**.

---

## Incremento 7 — Subida de varias fotos: COMPLETADO

| Pieza | Verificación |
|---|---|
| **La subida estaba ROTA para fotos de móvil** | Medido sobre el build servido ANTES de tocar nada: 0,32 MB → 200; **1,20 MB → 500 «Body exceeded 1 MB limit»**. Next limita el cuerpo de una Server Action a 1 MB y no estaba configurado, mientras la app decía admitir 5 MB |
| Ahora entran varias fotos de móvil de golpe | 1,8 + 2,4 + 1,2 MB en **un solo envío** → 3 filas, 3 objetos WebP reales en Storage, ~5,9 s |
| Éxito parcial honesto | Una válida + un SVG disfrazado → la buena se guarda, la mala no, y la respuesta **nombra los dos archivos** |
| Lote excesivo | 6 archivos se rechazan enteros **antes de subir ninguno** |
| **Carrera por la principal, reproducida y corregida** | Dos admins a la vez sobre un producto vacío: antes **se perdía una imagen** (2 → 1). Ahora entran las dos y sigue habiendo exactamente una principal |
| Doble submit simultáneo | Dos envíos del mismo archivo → dos imágenes distintas, una sola principal |
| Sin huérfanos | Tras todo el E2E: ninguna fila apunta a un objeto inexistente y ningún objeto queda sin fila |
| Seguridad | Autenticado sin admin y anónimo no suben nada; anónimo redirigido al login |
| Integración con P2 | El producto deja de aparecer en «Sin foto» en cuanto recibe imágenes |
| Alt automático | «ZZ E2P7 Camiseta», «… (2)», «… (3)» — decisión de producto de Juan |

**Cero migraciones. Cero cambios de esquema, RLS o Storage policies.** El único cambio de configuración es `bodySizeLimit`, derivado de las constantes de validación con un test que impide que diverjan.

**Límites conocidos y aceptados:** el alt automático identifica la foto pero no la describe (peor accesibilidad que un texto escrito a mano); dos subidas concurrentes pueden compartir `sort_order`, cuyo desempate queda indefinido (preexistente); y si el proceso muere entre subir el objeto y escribir la fila, quedan bytes sin dueño — la compensación cubre el fallo de la BD, no la muerte del proceso. **Nada verificado en navegador.**

### 🚩 Bloqueo operativo detectado, NO tocado

**Las 4 imágenes del catálogo no existen en Storage.** Verificado contra Storage real: el bucket `products` está **vacío** y las 4 filas de `product_images` apuntan a objetos que devuelven **400**. Consecuencias: el cliente ve un recuadro gris en los cuatro productos, y el detector P2 dice «todos tienen foto» porque la FILA existe. Por decisión de Juan **no se toca ningún dato**: se arregla subiendo las fotos reales, que es justo lo que este incremento hace fácil.

**Números:** `npm run lint` limpio · `npx tsc --noEmit` limpio · `npm test` **739/739** · `npm run build` correcto · **E2E 24/24** sobre el build servido con Supabase y Storage reales · **0 migraciones** · BD y Storage en el baseline exacto · **sin commits**.

---

## Incremento 8 — Envío, total del pedido y fiabilidad del checkout: COMPLETADO

Antes de esto, `create_order` escribía `shipping_total = 0` y `total = subtotal` **siempre**, no había selector de envío y `orders` no podía registrar qué método eligió el cliente. El importe que veía el cliente no era el que se le iba a cobrar.

| Pieza | Verificación |
|---|---|
| El total incluye el envío | **Supabase real**: 30,00 + 4,90 = 34,90 · recogida 30,00 + 0,00 = 30,00 |
| **El umbral de 60 € estaba en los datos y NADIE lo aplicaba** | Hallazgo de esta auditoría, que ninguna anterior vio. Ahora: en el umbral exacto (60,00) el envío sale **gratis**; con 50,00 se cobra |
| La regla no puede divergir | Un test ejecuta `resolveShippingCost` (TypeScript) y el `case` de la 0035 (SQL) sobre los mismos casos y los compara céntimo a céntimo |
| El navegador no decide el precio | Inyectar `shipping_total` y `total` en el POST → **rechazado de plano**: no existen como parámetros de la función. Inyectar `unit_price` → se ignora, el subtotal sigue siendo el real |
| Método inválido | Inexistente, **retirado** o **de otro mercado** → `INVALID_SHIPPING_METHOD`. Sin método → `SHIPPING_METHOD_REQUIRED` |
| **La firma vieja se eliminó** | La de 6 parámetros creaba pedidos con envío 0. Un POST con ella ahora falla |
| Idempotencia | Doble envío simultáneo → **un** pedido, **un** cobro (24,90), stock descontado una vez. Misma clave con OTRO método → `IDEMPOTENCY_KEY_REUSED` en vez de devolver el total viejo |
| Snapshot del método | Renombrar el método **no reescribe** pedidos pasados |
| WhatsApp | Imprime «Envío (método): importe» con los valores del pedido, también cuando es 0. **No recalcula**: un total incoherente inyectado se imprime tal cual |
| Admin | Filas «Entrega» y «Envío» en el detalle del pedido, sin abrir el chat |
| Sin supuestos españoles | Ni precios, ni umbrales, ni nombres de método en el código: todo sale de `shipping_methods` filtrado por mercado |

### ⚠️ Encontrado y corregido durante el incremento

**`/checkout` era `○ (Static)`.** Al pasar a leer `shipping_methods`, seguir siendo estática habría horneado los precios de envío EN EL BUILD: cambiar 4,90 € en la base de datos no se vería hasta el siguiente despliegue, y el cliente vería un importe distinto del que se le va a cobrar. Ahora es `ƒ` dinámica.

**Regresiones asumidas y arregladas:** cambiar la firma de `create_order` rompió cinco archivos de test que la llamaban. Se arreglaron resolviendo el método en tiempo real contra la BD, sin fijar ningún uuid.

**NO VERIFICADO — el selector RENDERIZADO.** `CheckoutForm` corta en `!isHydrated`, así que sin navegador no existe HTML pintado del formulario. Lo que sí se comprobó sobre el build servido es que el servidor resuelve los métodos y manda su **precio y su umbral reales** en el payload, y que **ninguno viene preseleccionado**.

**Números:** lint limpio · tsc limpio · `npm test` **779/779** · build correcto · **E2E 14/14** sobre el build servido · 1 migración (0035) · BD y Storage en el baseline exacto · **sin commits**.

---

## Incremento 9 — CRUD de métodos de entrega: COMPLETADO

El incremento 8 dejó `shipping_methods` decidiendo **lo que cobra la tienda** y sin ninguna forma de editarla que no fuera SQL a mano. Este incremento la hace administrable y le pone límites en la BD.

| Pieza | Verificación |
|---|---|
| CRUD dentro de `/admin/ajustes` | **Build servido**: crear, editar y borrar por POST `multipart/form-data` **sin JavaScript** (el desplegable es `<details>`) |
| El precio y el umbral se leen sin abrir nada | **Build servido**: la fila del seed imprime `4,90 €` y `gratis desde 60,00 €` en el HTML |
| Coma decimal | **Supabase real**: `9,90` se guarda como `9.90` |
| **Umbral vacío ≠ umbral cero** | **Supabase real**: vaciar el campo deja `NULL` (nunca gratis), no `0`. Los dos casos tienen test unitario, de integración y E2E |
| `market_id` lo pone el servidor | **Build servido**: inyectar `market_id=CO` en el POST no mueve nada de mercado |
| **Tres agujeros reales de la BD, cerrados** | Hallazgo de esta auditoría: antes de la 0036 la BD aceptaba con **201** un umbral `-50` (envío gratis para todos, en silencio), un `name = ''` y un nombre duplicado. Ahora: `23514`, `23514` y `23505` |
| Las 2 filas del seed pasan las restricciones | Comprobado **antes** de aplicar la migración |
| RLS y autorización | **Supabase real**: `anon` → 42501 · autenticado sin rol → 42501 · admin escribiendo en mercado inactivo → 42501 (DEC-035). Ninguna action usa `service_role` |
| Retirar quita del checkout al instante | **Build servido**: desmarcar «Ofrecer» y el método desaparece de `/checkout` **sin redeploy** (`force-dynamic`) |
| Borrar un método con pedidos es seguro | **Supabase real**: DELETE → 204, y el pedido conserva `shipping_method_name`, `shipping_total` y `total`; solo `shipping_method_id` pasa a NULL |
| La fila avisa antes de borrar | Cuenta los pedidos que lo usan con `orders(count)` embebido: **no viaja ni una fila de pedido** |
| Avisos de tienda no vendible | Sin métodos, o con todos retirados, la pantalla avisa en rojo de que **nadie puede completar un pedido** |
| Anónimo | Redirigido al login |

**NO VERIFICADO — el render en navegador.** Sin navegador no se ha comprobado el `<details>` abriéndose, el repintado tras guardar ni el responsive real. Lo que sí está verificado es que el HTML servido contiene el formulario completo y que los POST funcionan sin JavaScript.

**Decisión nueva:** DEC-064.

**Números:** lint limpio · tsc limpio · `npm test` **818/818** (176 suites) · build correcto · **E2E 24/24** sobre el build servido · **17/17** de integración contra Supabase real · 1 migración (0036) · BD y Storage en el baseline exacto · **sin commits**.

---

## Incremento 10 — Número de WhatsApp y fotos reales: COMPLETADO (con lo que depende de Juan, pendiente)

Dos defectos con la misma causa: **el seed dejaba la tienda en un estado roto que ninguna pantalla contaba.**

### A · El número de WhatsApp (DEC-065)

| Pieza | Verificación |
|---|---|
| **El guard anterior NO detectaba el placeholder** | `normalizePhone("34600000000")` → 11 dígitos → **válido**. Hallazgo de esta auditoría |
| Qué pasaba de verdad | **Build servido**: el checkout **creaba el pedido** y redirigía a `wa.me/34600000000`. El pedido quedaba `pending` y nadie se enteraba |
| Ahora rechaza | **Build servido**, invocando la Server Action: `CHECKOUT_NOT_CONFIGURED` y el recuento de pedidos **no cambia** |
| **CONTROL POSITIVO** | Con un número real el pedido **sí** se crea, el recuento sube exactamente 1 y el enlace usa `wa.me/34600112233`. Es lo que prueba que el rechazo lo causa el número |
| El cliente no ve el número | El mensaje de error no contiene `34600000000` |
| Un solo predicado | Panel y checkout llaman al mismo `isWhatsAppConfigured`: no pueden discrepar |
| El panel lo dice | Aviso rojo en `/admin` («La tienda no puede recibir pedidos», con enlace) y junto al campo en `/admin/ajustes` |
| Guardarlo se rechaza | POST del placeholder → no cambia nada. **CONTROL**: un número real sí se guarda por el mismo camino |
| Sin inventar reglas | `34600000001` sigue siendo válido. Un test lee el seed y falla si el valor sembrado se separa de la lista (comprobado alterando la lista: falla con el mensaje exacto) |

### B · Las fotos rotas (DEC-066, migración 0037)

| Pieza | Verificación |
|---|---|
| El estado real | **Supabase real**: 4 filas, **0 objetos**. `/_next/image` → **400 «upstream response is invalid»** en las cuatro |
| Lo que veía el cliente | El HTML **servido** llevaba el `<img>` roto: el fallback a `MockImage` es `onError` de cliente y solo actúa tras hidratar |
| Lo que veía Google | `og:image` y el `image` del JSON-LD `Product` servían esa URL de 400 |
| Lo que decía el panel | P2 informaba de que los 4 productos **tenían** foto, porque la FILA existía |
| Limpieza | Las 4 filas borradas por la 0037; el seed corregido para no recrearlas, con test que lo comprueba |
| Detector permanente | `admin_products_with_broken_images()`, una consulta contra `storage.objects`, sin N+1 y sin `service_role` |
| **Control positivo Y negativo** | Fila con objeto inexistente → aparece. Fila con objeto **real** → no aparece. Se borra ese objeto → **vuelve a aparecer**. Es la prueba de que mira Storage y no una marca en la fila |
| RLS | `anon` sin datos · autenticado sin rol → **cero filas, no error** (la puerta `is_admin()` va dentro del WHERE) · mercado inactivo → cero (DEC-035) |
| Escaparate | **Build servido**: ni la ficha ni la home llevan ya ningún `<img>` al optimizador, y el hueco honesto viaja **desde el servidor** |
| **CONTROL POSITIVO con foto real** | Subida una imagen de verdad: la ficha anuncia `og:image` que responde **200**, el optimizador devuelve la imagen y el JSON-LD recupera `image`. El detector deja de reportarla |

### ⚠️ Lo que este incremento NO arregla

- **Las fotos reales siguen sin existir.** Juan no las tiene todavía; se suben desde `/admin/catalogo`. Los 4 productos del seed pasan a contarse como «publicados sin foto» en P2, **que es la verdad**.
- **`og:image` y el `image` del JSON-LD ya no existen en esas fichas.** Es correcto —no se inventa una imagen— pero `image` es propiedad REQUERIDA del rich result de producto de Google: **seguirá incompleto hasta que haya fotos**.
- **La tienda no vende** hasta que Juan escriba su número. Es el efecto buscado, no un fallo.
- **NO VERIFICADO en navegador:** el render real de los avisos y el responsive. Sin navegador solo se comprueba el HTML servido y los POST sin JavaScript.

**Cambio deliberado de baseline:** `product_images` pasa de **4** a **0**. Es la única cifra que cambia y lo hace por decisión explícita.

**Regresión propia, encontrada y corregida:** importar `@/lib/whatsapp/phone` en `lib/admin/catalog.ts` rompió dos suites enteras con `ERR_MODULE_NOT_FOUND` —ese módulo corre bajo `node --test` y el alias no lo resuelve Node—. Corregido a ruta relativa con extensión. Y dos asserts míos sobre `og:image` eran **vacuos** (pasaban porque no había ninguna etiqueta): sustituidos por el control positivo con foto real.

**Decisiones nuevas:** DEC-065 y DEC-066.

**Números:** lint limpio · tsc limpio · `npm test` **836/836** (180 suites) · build correcto · **E2E 31/31** sobre el build servido · **8/8** de integración contra Supabase real · 1 migración (0037) · baseline verificado · **sin commits**.

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
- ~~**CSP y HSTS**~~: **HECHOS en Fase 10** (DEC-086). Pendiente solo la comprobación en navegador, que exige `next build` y, por tanto, la base de datos en pie.
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
- ~~Rate limiting del checkout~~ — **acotado en Fase 10** (DEC-088, migraciones `0046` y `0047`).
- Multi-admin con roles granulares, import/export CSV, reportes.

### ⚠️ DEUDA TÉCNICA

- **Sin navegador automatizado en este entorno**: ningún clic real del panel está comprobado. Lo que sí se validó: 78 comprobaciones end-to-end sobre el build servido, 39 de RLS, 38 de sesión y 295 tests. Los *hydration mismatch* y el repintado tras una acción **no** están verificados.
- `order_items` **no guarda la imagen** del producto: un pedido histórico no puede mostrar la foto (heredado de Fase 6, documentado en `03-DATABASE.md`).
- `create_order` sigue siendo un endpoint público sin autenticación. **Desde la 0046 (DEC-088)** un pedido admite 10 unidades como máximo y hay límites por teléfono y por mercado; un script que invente teléfonos solo lo frena el límite global, que también frena a los clientes legítimos mientras dure el ataque.
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
- [x] `robots.ts` que bloquee `/admin` — **hecho en Fase 9**, no pendiente: `app/robots.ts` deniega `/admin`, `/api`, `/carrito`, `/checkout` y `/pedido` (verificado sirviendo `/robots.txt`). Esta línea llevaba obsoleta desde entonces. **No es seguridad**: lo que impide entrar sigue siendo `proxy.ts` → layout → `requireAdmin()` → RLS.
- [x] Headers de seguridad — **CSP y HSTS hechos en Fase 10** (DEC-086), en `lib/security/headers.ts`. ⬜ Falta cargarlos en un navegador.
- [x] Límites anti-abuso del checkout — **hechos y verificados** (DEC-088, `0046` + `0047`).
- [ ] Recorrido manual en navegador real de tienda **y** panel.
- [ ] Assets de marca reales y copy final aprobado — pendiente de Juan.
- [ ] Regla "promoción más favorable" — pendiente de Juan; bloquea promociones.

---

## Próximos pasos (según ROADMAP, renumerado en DEC-038)

→ **FASE 10 — Testing**: consolidar la red de seguridad antes de producción. `node:test` (DEC-025) ya cubre 438 tests; falta decidir si hacen falta Vitest para componentes y Playwright para E2E de navegador — **que es justo lo que este entorno no puede hacer hoy**, y por eso los CWV y cualquier clic real siguen sin verificar.

Dos cosas siguen esperando a Juan:
1. **Promociones.** Bloqueada por la regla "promoción más favorable", que nadie ha definido. Afecta a precios, carrito, checkout y pedidos: no se puede implementar a medias.
2. **Dominios definitivos.** Sin ellos, `NEXT_PUBLIC_SITE_URL` sigue en `localhost` y el sitemap de producción no sirve.

Antes del deploy (Fase 11) quedan además: el backfill del blur de las 4 imágenes del seed y el redirect 301 al cambiar un slug. **CSP y HSTS ya están** (DEC-086), a falta de cargarlos en un navegador.

✅ **RESUELTO el 2026-09-23: Juan despausó el proyecto y la verificación se ejecutó entera.** Lo de abajo queda como registro de lo que estuvo bloqueado y de cómo se diagnosticó.

**Resultado de la verificación** (Chrome 153 headless, 390×844, `next build` + `next start`):

| Comprobación | Resultado |
|---|---|
| `npm run lint` · `npx tsc --noEmit` | limpios |
| `npm test` | **1140/1140**, integración incluida |
| `npm run build` | correcto; las 4 fichas vuelven a prerenderizarse (SSG) |
| CSP en 13 rutas de tienda y panel | **0 violaciones**, 0 errores de consola, 0 recursos bloqueados |
| HSTS | aparece solo con build HTTPS: `max-age=31536000; includeSubDomains`, sin `preload` |
| Alta de producto con foto real | producto en `draft`, WebP en Storage, `is_primary`, blur generado en servidor |
| Borrador en público | 404 y fuera del `sitemap.xml` |
| IA | **fallback verificado**: sin clave de proveedor el botón sale deshabilitado con «Asistente no configurado: rellena la ficha a mano» y el alta funciona igual |
| Objetivos táctiles <44 px en `/admin` | ninguno |
| Scroll horizontal a 390 px | ninguno |
| Baseline | restaurado: 4 productos, 9 variantes, 0 imágenes, 0 pedidos, 1 perfil, 1 usuario, bucket vacío |

⚠️ **`headers()` se congela en el build**: cambiar `NEXT_PUBLIC_SITE_URL` con el servidor arrancado no cambia las cabeceras; hay que reconstruir.

<details><summary>Diagnóstico del bloqueo (histórico)</summary>

⚠️ **El proyecto de Supabase ya no existía en el DNS** (medido el 2026-09-23, antes de despausarlo). No era «lento» ni «pausado»: el nombre no resolvía.

```
nslookup xyxxpnwzmmgarnrfmxax.supabase.co   → Non-existent domain
nslookup … 1.1.1.1                          → sin respuesta (igual que un ref inventado)
nslookup supabase.co 1.1.1.1                → 76.76.21.21  (control: el DNS funciona)
curl https://supabase.com                    → 200          (control: hay internet)
```

Un proyecto **pausado** sigue resolviendo; uno cuyo host desaparece del DNS está **suspendido o eliminado**. Recuperarlo no es «arrancarlo»: si el proyecto ya no está, hay que crear uno nuevo, volver a aplicar las 44 migraciones (`npm run db:push`), sembrar (`db:push:seed`), regenerar `types/database.types.ts` y actualizar `.env.local`. **Es una acción de Juan; no se toca el esquema ni el código para disimularlo.**

Y no hay alternativa local: esta máquina **no tiene Docker ni Podman**, así que `supabase start` tampoco levanta nada.

Consecuencia medida, toda ella bloqueada por esto y **ninguna por el código**:

| Comprobación | Estado |
|---|---|
| 14 ficheros `*.integration.test.ts` | ⬜ `TypeError: fetch failed` |
| `npm run build` | ⬜ falla al recoger datos de `/producto/[slug]` (`MarketResolutionError`) |
| `next start` | ⬜ depende del build |
| CSP real en Chrome 390×844 (DEC-086) | ⬜ depende de `next start` |
| Recorrido de tienda, panel y checkout en navegador | ⬜ depende de `next start` |
| Calidad de una sugerencia real de IA (incremento 20) | ⬜ además falta la clave del proveedor |

</details>

**Único pendiente que sobrevive a la verificación:** la **calidad de una sugerencia real de IA**. Sigue sin haber clave de proveedor —desde el incremento 21 es `GEMINI_API_KEY`, del tramo gratuito—, así que lo probado es el camino sin asistente (escenario B). Lo demás está verde.

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

---

## Incremento 21 — La ayuda con IA se enciende, se apaga y deja de costar dinero: COMPLETADO

Última actualización: 2026-09-24. **Migración `0045`.**

**Qué lo motivó, medido:** con la clave real de Anthropic configurada, la API devolvía `400 invalid_request_error · "Your credit balance is too low to access the Anthropic API"`. El asistente estaba bien construido y no proponía nada. Y no había forma de apagarlo sin desplegar.

**Qué se hizo:**

| Antes | Después |
|---|---|
| El asistente estaba «activo» si existía la clave | Interruptor en `/admin/ajustes` (`settings.ai_assist_enabled`, 0045), **apagado por defecto** |
| Un único booleano: «configurado» o no | Tres estados (`OFF`, `NOT_CONFIGURED`, `READY`) con mensajes distintos, porque se arreglan en sitios distintos |
| Proveedor de pago, sin saldo | **Gemini Flash, tramo gratuito** (permanente, sin tarjeta, 10/min y 1.500/día) |
| `@anthropic-ai/sdk` (12 MB) | **Retirada.** `fetch` contra JSON plano: cero dependencias de IA |
| El guardia vivía en el botón | El guardia vive **también en la Server Action**, antes de tocar la foto |

**Verificación (Chrome 153 headless, 390×844, build servido):**

- IA apagada → botón desactivado, «La ayuda con IA está desactivada. Puedes activarla en Ajustes» y enlace a la sección.
- Encender desde `/admin/ajustes` → «Ayuda con IA activada», y aparece el aviso de que falta el proveedor.
- Encendida sin clave → mensaje **distinto**: «El asistente no está configurado. Rellena la ficha a mano».
- **Guardia del servidor**: con la IA apagada, quitando el `disabled` desde la consola y pulsando, la action responde que está desactivada, **no se rellena ningún campo** y **no sale ni una petición externa del navegador**.
- `anon` leyendo la columna nueva → **401** (nace privada, 0041).
- Cero violaciones de CSP, cero errores de consola, cero objetivos táctiles por debajo de 44 px, sin scroll horizontal.
- `npm test` **1170/1170** (30 nuevos) · lint, tsc y build verdes · baseline restaurado.

⬜ **Lo que NO está verificado, y no se finge:** la **calidad de una sugerencia real**. Este entorno no tiene `GEMINI_API_KEY`. Se consigue gratis y sin tarjeta en <https://aistudio.google.com/apikey>; con ella puesta y el interruptor encendido, queda probar una foto real.

---

## Fase 10 — Límites anti-abuso del checkout (DEC-088): COMPLETADO

Última actualización: 2026-10-10. **Migraciones `0046` y `0047`.**

**Qué lo motivó, medido en el código:** `create_order` la puede llamar `anon` por POST directo y admitía 50 líneas × 99 unidades: **una sola llamada vaciaba el stock**. Un limitador en Next no servía (se lo salta quien va directo a PostgREST) y contar por IP tampoco (todos los clientes llegan con la IP del servidor).

| Límite | Código | Umbral |
|---|---|---|
| Unidades por pedido (sumando líneas) | `ORDER_TOO_LARGE` | **10**, constante (decisión de Juan) |
| Pedidos por teléfono en 1 hora | `TOO_MANY_ORDERS` | `settings.checkout_max_orders_per_phone_hour` = 3 |
| Pedidos por mercado en 10 minutos | `CHECKOUT_BUSY` | `settings.checkout_max_orders_per_market_10min` = 30 |

Bajo un candado por mercado tomado ANTES de la idempotencia (0047), con los límites después de la idempotencia y antes de tocar stock. El carrito limita cada línea a 10 y `/checkout` avisa antes de rellenar nada si las líneas suman más.

**Regresión encontrada al ejecutar la integración, y corregida (`0047`):** la 0046 tomaba el candado DESPUÉS de leer la clave de idempotencia. Con dos envíos simultáneos de la misma clave, el segundo pasaba la comprobación, esperaba el candado y al seguir chocaba con el índice único (`23505`): el cliente habría visto «Algo ha ido mal» en vez de su pedido. Medido: el test del doble envío falló **2 de 3**. Con el candado antes de la idempotencia, **5/5**. Antes de la 0046 el hueco era de milisegundos y pasaba por suerte.

**Verificación:**

- `npm test` **1198/1198** con integración: los 8 tests nuevos de límites contra Supabase real (tope, suma de líneas, teléfono, reintento al límite, mercado, **10 simultáneos con hueco para 3 → entran 3**, CHECK a 0 → `23514`, `anon` no lee los umbrales) + `limits.test.ts` (17), que lee las migraciones.
- `npx tsc --noEmit`, `npm run lint` y `npm run build` verdes; mismas formas de ruta (`/` y `/carrito` estáticas con ISR, fichas SSG, `/checkout` dinámica). `types/database.types.ts` regenerado (las dos columnas nuevas).
- **E2E 15/15** en Chrome 155 headless a 390×844 sobre el build servido: carrito manipulado a 15 → 10 y botón de sumar deshabilitado; la ficha se para en 10; con 11 uds el aviso sale **por encima del primer campo** (201 px frente a 383), el enlace mide 44 px y COMPRAR sigue deshabilitado con todo relleno; con 10 uds el pedido se crea de verdad (6 + 4); **cero errores de consola y cero violaciones de CSP**; sin scroll horizontal.
- Baseline restaurado: umbrales 3/30, número de WhatsApp del seed, 0 pedidos, 0 clientes, stocks originales.
