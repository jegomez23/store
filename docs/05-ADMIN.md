# 05 — ADMIN: Panel de administración

> Especificación funcional del panel privado. Seguridad técnica en `08-SECURITY.md`; esquema en `03-DATABASE.md`.
>
> **Estado real (tras la Fase 9, 2026-09-02).** Fase 7 entregó el núcleo
> operativo (auth + pedidos) y Fase 8 el CMS de catálogo. Lo que sigue sin
> implementarse está marcado como tal:
>
> | Módulo | Estado |
> |---|---|
> | §2 Acceso y autenticación | ✅ IMPLEMENTADO (Fase 7; desviación de estructura en §2). **Recuperación de contraseña: ✅ IMPLEMENTADA (incremento 18, DEC-078)** — la entrega del correo depende de configurar un SMTP propio en Supabase |
> | §4.4 Pedidos (lista, detalle, estados, timeline) | ✅ IMPLEMENTADO (Fase 7) y verificado contra Supabase real |
> | §4.7 Dashboard | ✅ IMPLEMENTADO (Fase 7): pedidos por estado, recientes, stock bajo |
> | Inventario (`/admin/inventario`) | ✅ IMPLEMENTADO (Incremento 12): agrupado por producto, **stock por valor ABSOLUTO con testigo** y **Agotar** por variante, atómico por producto (DEC-067). La reposición por delta sale del panel, no de la BD (DEC-068) |
| §4.1 Productos | ✅ IMPLEMENTADO (Fase 8): CRUD, matriz color × talla, imágenes y SEO (`meta_title`/`meta_description`). Desde Fase 9, cada subida de imagen genera además su **placeholder blur en servidor** (DEC-040) y toda mutación invalida la ficha, la home y el sitemap (DEC-041). **Sin** drag&drop: el orden se edita por número. Sin `compare_at_price`, SKU editable ni umbral low-stock. **Sin redirect 301** al cambiar el slug: el antiguo pasa a dar 404 |
> | §4.2 Categorías | ✅ IMPLEMENTADO (Fase 8): jerarquía de 2 niveles, orden, activar/desactivar, borrado bloqueado por la FK real. **Sin** drag&drop ni imagen de categoría |
> | §4.5 Home | ✅ IMPLEMENTADO (Fase 8): CRUD de los tres tipos de bloque que existen. **Sin** vista previa embebida ni imagen del bloque |
> | §4.6 Ajustes | ✅ IMPLEMENTADO (incrementos 8, 9, 15 y 16): nombre, **frase**, email de contacto, redes, número de WhatsApp, métodos de entrega y **estado de venta** en una sola pantalla, **ordenada por urgencia operativa** y con cada bloqueo enlazado a su sección. El nombre y la frase son la **identidad pública** de la tienda (título, Open Graph, logo del Header, footer e imagen de portada); el contacto y las redes se pintan en el footer. **Sin** logo ni políticas |
> | §4.3 Promociones | ⬜ PENDIENTE — fuera del alcance acordado; la regla "promoción más favorable" sigue pendiente de Juan |
> | §5 Textos en `lib/i18n/` | ⬜ PENDIENTE (el panel usa `TODO(i18n)`, como Fase 2) |

---

## 1. Principios del panel

- **La interfaz enseña primero lo que el administrador necesita ahora, no todo lo que el sistema es capaz de hacer** (incremento 20). La complejidad vive en el sistema, no necesariamente en la pantalla: lo que no sirve para actuar ahora se pliega, no se borra.
- Gestiona el 100% de la tienda sin tocar código.
- Escrito con los mismos componentes base (`components/ui/`) pero layout propio (sidebar desktop, tabs móvil).
- Toda mutación pasa por Server Actions con validación de sesión + rol + input.
- Feedback inmediato: toasts + actualización optimista donde aporte (`updateTag`/`refresh`).

---

## 2. Acceso y autenticación

| Aspecto | Definición |
|---|---|
| Login | `/admin/login` — email + contraseña (Supabase Auth) |
| Sesión | Cookie httpOnly vía `@supabase/ssr` |
| Guard de sesión | `proxy.ts`: **renueva el token** y escribe las cookies; sin sesión → redirect a login. **No comprueba el rol** (DEC-031) |
| Guard real | `app/admin/(panel)/layout.tsx`: `getUser()` + `is_admin()`. Sesión sin rol → pantalla "Acceso denegado" con logout (redirigir causaría un bucle) |
| Guard de mutaciones | `requireAdmin()` al inicio de **cada** Server Action y de cada función de `lib/data/admin/` (DEC-034) |
| Recuperación | **Reset por email de Supabase Auth** (incremento 18). `/admin/login` → `/admin/recuperar` → email → `/admin/reset-password` → login. Sin tokens propios, sin tablas nuevas y **sin `service_role`**. ⚠️ La ENTREGA del correo exige un SMTP propio en el panel de Supabase |
| Alta de admins | Solo por invitación manual (panel Supabase o SQL) en v1 |

### 2.1 Recuperación de contraseña (incremento 18, DEC-078 y DEC-079)

```
/admin/login  →  ¿Has olvidado tu contraseña?
                        ↓
                 /admin/recuperar  (email)
                        ↓
                 email de Supabase Auth
                        ↓
                 /admin/reset-password  (nueva + repetir)
                        ↓
                 /admin/login  →  panel
```

**Es la recuperación de Supabase Auth.** No hay tokens propios, ni tablas nuevas, ni `service_role`, ni recuperación alternativa de ningún tipo (ni código maestro, ni WhatsApp, ni preguntas).

- **No enumera cuentas.** Email no registrado, formato inválido y email real dan **la misma pantalla**. Un 429 de Supabase también: distinguirlo diría que la cuenta existe.
- **El abuso lo limita Supabase**, y está medido (`over_email_send_rate_limit`, `over_request_rate_limit`). No se añade un contador propio.
- **La política de contraseñas es la del proyecto**: mínimo 6, sin complejidad inventada. Si el servidor rechaza, se muestra **su** mensaje.
- **El enlace es de un solo uso** (403 · `otp_expired` al reutilizarlo) y caducado, usado, manipulado o inexistente comparten un mensaje único.
- **Al guardar se cierra la sesión de recuperación** y se vuelve al login: la contraseña nueva se prueba enseguida y el acceso vuelve a pasar por `is_admin()`.

⚠️ **AUTENTICACIÓN ≠ AUTORIZACIÓN.** Recuperar devuelve el acceso a una cuenta de Supabase Auth; el panel sigue dependiendo de `is_admin()`. Una cuenta sin fila en `profiles` recupera su contraseña, entra en Supabase Auth y **sigue sin poder abrir el panel** — verificado en navegador. Por eso `/admin/reset-password` vive en `(auth)` y **no consulta el rol**.

⚠️ **Dos formas de llegar, por cómo es el enlace de Supabase** (DEC-079): con la plantilla por defecto el token viaja en el **fragmento** de la URL, que no llega al servidor, y lo recoge un componente cliente mínimo que lo entrega una vez y lo borra de la barra de direcciones. Con una plantilla que use `{{ .TokenHash }}` el enlace apunta a `/admin/auth/confirm` y **el token no pasa nunca por JavaScript**: es preferible, y es configuración del panel de Supabase.

⚠️ **La ENTREGA del correo es configuración externa.** El SMTP integrado de Supabase está limitado y solo entrega a miembros del equipo. Sin un SMTP propio configurado, el administrador **no recibirá el email**, aunque todo el resto del flujo funcione.

---

## 3. Mapa de pantallas

Rutas **existentes** hoy (tras la Fase 8):

```
/admin/login               Acceso (route group (auth), fuera del guard)
/admin/recuperar           Pedir el enlace de recuperación (público)
/admin/reset-password      Establecer la contraseña nueva (público; exige token)
/admin/auth/confirm        Route Handler que canjea ?token_hash= (público)
/admin                     Resumen: pedidos por estado, recientes, stock bajo
/admin/pedidos             Lista: filtro por estado, BÚSQUEDA por número, teléfono o
                           nombre del cliente (P3), paginación (20/pág.)
/admin/pedidos/[numero]    Detalle + contactar + cambio de estado + EXPEDIENTE
                           (notas internas + historial de estados en un solo hilo)
/admin/catalogo            Lista de productos: búsqueda, filtro por estado y filtro
                           "Sin foto" → cada fila lleva a /admin/catalogo/[id]#imagenes
                           ("Subir foto →", incremento 19)
                           "No se pueden comprar" (?ver=no-vendibles, Fase 9.5)
/admin/catalogo/nuevo      Crear producto (nace en borrador)
/admin/catalogo/[id]       Editar: General (con PROVEEDOR) · SEO · Variantes (matriz,
                           con REFERENCIA EXTERNA por variante) · Imágenes ·
                           Historial de cambios (Fase 9.5) · Eliminar
/admin/categorias          Jerarquía de 2 niveles, orden, activar/desactivar
/admin/atributos           Colores y tallas: crear, editar, retirar, eliminar
                           (GLOBALES, sin mercado — Fase 9.5, incremento 6)
/admin/home                Bloques hero / banner / strip_promo
/admin/inventario          Agrupado por PRODUCTO: escribir el stock que hay de cada
                           variante y guardar por producto, o «Agotar» una variante
                           (Incremento 12). Busca por nombre, slug, SKU, proveedor
                           o referencia externa (Incremento 13)
/admin/ajustes             Nombre, email, redes, número de WhatsApp y métodos de entrega
```

Desviación deliberada: el producto vive en `/admin/catalogo/[id]` y no en
`/admin/productos/[id]`. Se mantuvo `catalogo` porque es la ruta que ya existía
desde Fase 7; renombrarla habría roto enlaces sin aportar nada.

**Desviación respecto al plan original, deliberada:** el detalle se direcciona
por `order_number` (`/admin/pedidos/YI-ES-000001`), no por `id`. Es el
identificador que el negocio dicta por WhatsApp, y la ruta está detrás del
guard, así que la enumerabilidad de DEC-027 no aplica aquí.

Ruta **prevista y todavía inexistente**: `/admin/promociones`.

---

## 4. Funcionalidad por módulo

### 4.1 Productos
- CRUD completo; campos según `03-DATABASE.md` §2.6.
- Estados: borrador / activo / archivado (+ soft delete).
- Flags: destacado, nuevo.
- **Variantes:** matriz color × talla generable en lote ("crear todas las combinaciones"), edición inline de precio/compare_at/SKU/stock por celda, activar/desactivar variante, umbral low-stock.
- **Imágenes:** subida MÚLTIPLE real (hasta 5 por envío, incremento 7), reordenar por número, marcar principal, eliminar. El alt se genera del nombre del producto.
- Validaciones: slug único por mercado (autogenerado editable), SKU único, precio ≥ 0, compare_at > precio.

### 4.1quinquies Alta de producto: la foto primero (incremento 20, DEC-083)

`/admin/catalogo/nuevo` **no monta `ProductForm`**. Ese formulario tiene sentido para EDITAR una ficha que ya existe —trece campos, cada uno con su dato dentro—, pero como puerta de entrada pedía trece decisiones antes de la primera. Medido a 390×844: 13 campos, 2,5 pantallas y **ningún control de archivo**.

El alta es ahora una sola pantalla:

```
+ Añadir producto
[ FOTO ]                      ← lo primero: es lo que el admin tiene en la mano
[ Analizar foto ]             ← opcional; desactivado si no hay proveedor de IA
Nombre            [sugerido]
Categoría         [sugerido]
Descripción corta [sugerido]
Descripción       [sugerido]
Información avanzada ↓        ← slug, proveedor, materiales, cuidados, SEO
[ Guardar producto ]
```

- **El producto nace en `draft`.** Publicar sigue siendo un acto explícito y aparte.
- **La foto se sube en el mismo envío** (`createProductWithPhotoAction`), reutilizando la tubería del catálogo: magic bytes, `sharp` → WebP, blur, `is_primary`, alt automático. **Si la foto falla, el producto se queda creado**: es mucho mejor que perder los datos recién revisados, y la foto se añade desde la ficha, que es el camino que ya existe.
- **Precio, stock y tallas no se piden aquí.** Viven en la matriz de variantes de la ficha, que es donde el modelo los guarda; pedirlos ahora obligaría a decidirlos antes de tener el producto.
- **El orden importa**: la ruta del objeto se compone con el slug, así que la fila del producto se crea primero. Si la fila de imagen falla, el objeto se descarta (`discardOrphanObject`) para no dejar bytes sin dueño.

`createProductAction` y la rama `product === null` de `ProductForm` **siguen funcionando**: son el alta sin foto. No se retira una acción que funciona solo porque ninguna pantalla la monte hoy.

### 4.1sexies El asistente de catálogo (incremento 20, DEC-084)

**La IA propone. El administrador decide.** «Analizar foto» rellena campos del **mismo** formulario; no hay modo IA ni flujo paralelo, y al guardar la Server Action no distingue un valor sugerido de uno escrito a mano. Cada campo tocado se marca «sugerido»; editarlo quita la marca, porque deja de ser una propuesta.

| Puede proponer | No puede proponer, y no existe en el tipo |
|---|---|
| nombre, descripción corta, descripción | composición, materiales, gramaje, cuidados |
| categoría (de las que existen) | tallas, precio, stock |
| color aparente (de los que existen) | proveedor, referencia, origen, certificaciones |
| palabras clave | el estado de publicación |

- **Lo que no se determina se queda vacío y se dice.** «No determinado» es una respuesta correcta.
- **Sin proveedor configurado el botón sale desactivado y la pantalla lo explica.** Crear un producto funciona igual: la IA es un acelerador, nunca una dependencia.
- **Nada se almacena dos veces**: no hay columnas `ai_*` ni tabla de prompts.
- **Nada de cliente, pedido, teléfono, email o proveedor sale del proyecto**: el contexto que viaja son los bytes de una foto más las categorías y colores, que son públicos.

Contrato completo y trampas conocidas: `docs/context/AI-DEVELOPMENT.md` §29.

### 4.1ter Subida de varias fotos a la vez (incremento 7)

**El problema real que resuelve.** Las fotos llegan por WhatsApp, de tres en tres. Antes había que repetir el mismo formulario una vez por foto (elegir archivo → escribir alt → enviar) y, sobre todo, **las fotos de móvil no se podían subir en absoluto**.

⚠️ **Fallo medido antes de tocar nada**, sobre el build servido: Next limita el cuerpo de una Server Action a **1 MB por defecto** y aquí no estaba configurado.

```
jpeg de 0,32 MB → HTTP 200, imagen guardada
jpeg de 1,20 MB → HTTP 500 · "Body exceeded 1 MB limit"
```

Una foto de móvil corriente pesa 2–5 MB: la subida estaba rota para el caso de uso real, y el administrador solo veía un error genérico. Se configura `experimental.serverActions.bodySizeLimit` **derivado** de `MAX_FILES_PER_BATCH × MAX_IMAGE_BYTES` + holgura para las fronteras de `multipart/form-data`, con un test que impide que los dos valores se separen.

**Cómo funciona.** Un solo control con `multiple` (sin arrastrar-y-soltar, que en un teléfono no existe), hasta **5 archivos por envío** —límite técnico de una petición, no comercial: se pueden encadenar tandas—, de 5 MB cada uno. Se procesan **en serie**, no en paralelo.

**Éxito parcial: se informa, no se deshace.** De tres fotos, si entran dos y falla una, las dos **se quedan** y la respuesta dice, archivo por archivo, cuál falló y por qué. Deshacer lo bueno sería tirar trabajo ya hecho, y ninguna invariante exige que un lote sea todo-o-nada.

**Texto alternativo automático** a partir del nombre del producto y su posición: «Camiseta Sendero Oversize», «… (2)», «… (3)». *Límite de accesibilidad conocido y aceptado: ese alt identifica la foto pero no la describe, que es bastante menos útil para un lector de pantalla. Es el precio de que subir tres fotos sean tres toques.*

⚠️ **Carrera por la imagen principal, reproducida y corregida.** Dos administradores subiendo a la vez a un producto **sin** fotos veían los dos «no hay ninguna», los dos pedían `is_primary = true` y el índice UNIQUE parcial de la 0020 rechazaba al segundo: **de dos imágenes se guardaba una** (medido). Ahora, si el INSERT choca con ese índice, se reintenta una vez como no-principal. Sin migración: el índice ya era la autoridad, solo faltaba hacerle caso.

**Storage y BD no comparten transacción.** Se conserva la compensación existente: objeto primero, fila después; si la fila falla, se borra el objeto. Verificado tras el E2E que no queda **ninguna** fila apuntando a un objeto inexistente ni ningún objeto sin fila.

### 4.1bis Detector de productos publicados sin foto (incremento P2)

**Qué es.** Un producto **publicado** (`status = 'active'` y `deleted_at is null`) del que la tienda no puede pintar ninguna fotografía. En términos de datos: no le queda ninguna fila de `product_images` con `url <> ''`.

La cadena vacía cuenta como "sin foto" porque es lo que hace el código público, no por criterio propio: `resolveImageUrl` es `if (!path) return null` y `RemoteImage` cae a `MockImage`. Verificado sobre el build servido: la ficha de un producto cuya única imagen tiene `url = ''` pinta el mismo placeholder que la de un producto sin imágenes.

**Qué NO es.**
- **NO es una regla de publicación.** Un producto sin foto se publica, se vende y su ficha responde 200 (verificado). `enforce_publishable_product` **no se ha tocado**.
- **NO es lo mismo que «no se pueden comprar».** Aquello es un problema de compra; esto, de escaparate. Van en avisos separados, con contadores separados, y no se suman en ningún sitio. El rojo del resumen sigue significando una sola cosa.

**Dónde se ve.**
- Resumen (`/admin`): aviso **neutro** —sin rojo y sin lenguaje de urgencia— con el número y un enlace.
- Catálogo: chip **«Sin foto»** → `/admin/catalogo?ver=sin-foto`, reutilizando la convención `?ver=` de 5B. Lista los productos y cada fila enlaza a su ficha, donde ya existe la subida de imágenes.

**Cómo se resuelve.** Entero en PostgreSQL, **sin migración, sin función SQL y sin tocar RLS**: `product_images!left(id)` con `product_images=is.null` expresa el `NOT EXISTS`, y `product_images.url=neq.` descarta antes las filas inservibles. El recuento usa `head: true`: no viaja ninguna fila. Recuento y lista salen del mismo constructor de consulta (`withoutImageQuery`), que es la lección de 5B aplicada sin RPC.

**Qué no protege.** Nada nuevo: un producto publicado ya es público. Verificado que `anon` ve los publicados (son la tienda) y **no** ve borradores ni archivados, y que la ruta del panel le redirige al login.

### 4.1quater Detector de fotos rotas (incremento 10)

**Qué es.** Una fila de `product_images` cuyo objeto **no existe** en el bucket `products`. El panel da el producto por fotografiado y el cliente ve un hueco.

**Por qué es distinto de §4.1bis.** «Sin foto» es que falta la fila; «foto rota» es que la fila está y el archivo no. El arreglo es distinto —ahí subir una foto, aquí borrar la fila rota y subir otra— y el detector de fotos rotas **excluye `url = ''`** para no invadir el territorio de P2.

**Por qué existía.** El seed insertaba una fila por producto y nunca subía el objeto. Medido antes de arreglarlo: 4 filas, **0 objetos**, `/_next/image` → **400** en las cuatro, el `<img>` roto ya en el HTML servido y `og:image`/JSON-LD sirviendo esa URL. La migración `0037` borra esas filas y corrige el seed.

**Dónde se ve.**
- Resumen (`/admin`): aviso **neutro**, como el de «sin foto» — el producto se compra igual, y el rojo de esa pantalla significa solo «no se puede comprar».
- Catálogo: chip **«Foto rota»** → `/admin/catalogo?ver=foto-rota`. Lista **filas**, no productos, porque es lo que hay que arreglar; el encabezado cuenta productos, igual que el aviso del resumen.

**Cómo se resuelve.** RPC `admin_products_with_broken_images`, `SECURITY DEFINER` porque el dato vive en `storage.objects`. Detalle en `03-DATABASE.md` §2.7.

### 4.2 Categorías
- CRUD, jerarquía máx. 2 niveles, imagen, orden drag&drop, activar/desactivar.
- Bloqueo de borrado con productos activos asociados (mensaje claro).

### 4.2bis Colores y tallas — `/admin/atributos` (Fase 9.5, incremento 6)
- Listar, crear, editar, **retirar** (`is_active = false`) y eliminar colores y tallas.
- **Son globales**, no por mercado: `colors` y `sizes` no tienen `market_id` (DEC-062). La pantalla no lleva selector de mercado a propósito.
- **Color**: nombre, slug (se deriva del nombre si se deja vacío), hexadecimal `#RRGGBB` y orden. El slug es único; el nombre **no**.
- **Talla**: etiqueta, grupo (`apparel` · `footwear` · `accessory` — los tres del CHECK, ni uno más) y orden. **No tiene slug**: su identidad es `(etiqueta, grupo)`.
- **Retirar ≠ borrar.** Un valor retirado deja de ofrecerse para variantes nuevas —lo impone `admin_create_variant_matrix` desde la migración 0034, no la interfaz (DEC-061)— y las variantes que ya lo usan lo conservan y se siguen pudiendo editar.
- **Eliminar** solo funciona si nadie lo referencia: la FK devuelve 23503 y el mensaje explica que hay que desactivarlo.
- **Renombrar no reescribe pedidos**: `order_items` guarda el nombre con el que se vendió.

### 4.3 Promociones
- Crear/editar: tipo (% / fijo / precio especial / código), valor, vigencia, alcance (todo / productos / categorías) con selectores.
- Vista previa del efecto sobre productos afectados antes de guardar.
- Activar/desactivar; histórico de promociones pasadas.
- ⚠️ Códigos: en v1 sin canje automático en compra — ver decisión pendiente en DOMAIN-MODEL/DATABASE.

### 4.4 Pedidos
- Lista filtrable por estado; **búsqueda por número de pedido, teléfono o nombre del cliente** (P3, ver §4.4bis); paginación 20/pág.
- Detalle: items (snapshot), cliente, totales, source_url (desde dónde se generó).
- **Cambio de estado** con confirmación y nota opcional → escribe `order_events`.
- **Cancelar devuelve el stock** del pedido, exactamente una vez (DEC-033).
- Transiciones válidas UI-enforced:
```
pending → contacted → confirmed → paid → preparing → shipped → delivered
cualquiera (excepto delivered) → cancelled
```
- **Estas transiciones las impone PostgreSQL**, no la UI: `admin_update_order_status`
  (migración 0019, DEC-032) las valida con la fila del pedido bloqueada. Ocultar
  un botón no protege nada, y no pretende hacerlo. `delivered` y `cancelled` son
  terminales.
- Regla crítica: pasar a `paid` exige confirmación explícita del admin (checkbox "Pago recibido") — jamás automático. **Lo exige la propia función SQL** mediante el argumento `p_payment_confirmed`, así que ni una llamada directa a la RPC puede saltárselo.

### 4.4bis Buscador de pedidos (incremento P3)

**Una sola caja, tres caminos a la vez.** Lo que se escribe se busca **simultáneamente** en `orders.order_number`, `customers.phone` y `customers.name`, y se devuelve la unión. **No hay heurística**: no se adivina si "parece un teléfono". Adivinar fallaría justo en el caso ambiguo — `000003` es a la vez la cola de un número de pedido y un trozo de teléfono plausible.

**El teléfono se puede pegar tal cual del chat.** `customers.phone` se guarda solo con dígitos (`create_order` hace `regexp_replace(…, '[^0-9]', '', 'g')`), así que del texto escrito se extraen los dígitos: `+34 600 111 222` encuentra a `34600111222`. Verificado sobre el build servido.

**Se hace en DOS consultas, y no por gusto.** PostgREST **no admite una columna de un recurso embebido dentro de un `or=(…)`**: `or=(order_number.ilike.*x*,customer.name.ilike.*x*)` devuelve `PGRST100 · failed to parse logic tree`, porque el `.` se lee como el separador del operador (medido). Así que:

1. `customers` → `or=(name.ilike.*texto*,phone.ilike.*dígitos*)`, acotado al mercado, tope 200.
2. `orders` → `or=(order_number.ilike.*NÚMERO*,customer_id.in.(…))`, ambas columnas **reales** de `orders`.

El `count=exact` sigue siendo exacto y la paginación no cambia.

**Lo que la interfaz admite en voz alta:**
- **Los acentos cuentan:** «Perez» **no** encuentra «Pérez» (verificado). Quitarlos exigiría la extensión `unaccent` y un índice; es otro incremento.
- Si la búsqueda casa con **más de 200 clientes**, el resultado puede estar incompleto y se avisa. Un recorte silencioso sería peor que un vacío.
- Buscar algo que se queda en nada tras sanear (`%`, `***`) da **cero resultados con su mensaje**, no el listado entero. Antes de corregirlo, `%` devolvía todos los pedidos: se leía como «tu búsqueda lo ha encontrado todo».

**Seguridad.** Del texto se eliminan `%`, `_`, `*`, `,`, `(`, `)`, `.`, comillas y barras: los comodines de LIKE/PostgREST y lo que separaría y agruparía en el `or=(…)`. Se conservan tildes, ñ, espacios, guiones y apóstrofos, que son parte de un nombre. Sin migración, sin cambios de RLS y sin índices nuevos.

### 4.5 Home
- CRUD de bloques hero/banner/strip_promo por mercado: título, subtítulo, CTA, imagen, orden, vigencia, activación.
- Vista previa embebida del home resultante.

### 4.6 Ajustes (por mercado activo)
- Nombre tienda, **frase de la tienda**, **logo**, **número WhatsApp**, email contacto, redes sociales.
- Políticas (envíos/devoluciones/privacidad) como editor estructurado: ⬜ pendiente.
- Moneda/locale: solo lectura aquí (se cambian en `markets`, operación deliberada).

**ESTADO DE VENTA (incremento 15).** La pantalla abre diciendo si la tienda **puede vender** y, si no, por qué. Los dos bloqueos reales son el número de WhatsApp sin configurar (DEC-065) y quedarse sin ningún método de entrega activo: los dos impiden completar un pedido. La respuesta la da **una sola función**, `resolveSaleBlockers` (`lib/store/sale-status.ts`), que es la misma que usan el aviso del panel de inicio y, desde el incremento 16, **`/checkout`** — el panel no puede decir «listo» mientras el cliente no puede comprar, ni al revés.

Desde el incremento 16 **cada bloqueo lleva a la sección que lo arregla** (`#whatsapp`, `#entrega`), con área táctil de 44 px: en un móvil, «escribe el número» sin enlace obliga a buscar el campo a mano. Hay un test que comprueba que esas anclas existen de verdad en la página.

**ES UNA LISTA, NO UN SEMÁFORO (incremento 17, DEC-075).** Se ven **siempre las dos comprobaciones**, con ✓ o ✕:

```
LISTA PARA VENDER                 VENTA BLOQUEADA
✓ WhatsApp configurado            ✕ El número de WhatsApp es el de ejemplo…
✓ Método de entrega activo           Escribe el número al que quieres…
                                  ✓ Método de entrega activo
La tienda puede aceptar pedidos.
                                  [ Configurar WhatsApp ]
```

Antes solo se enseñaban los fallos, y con un fallo el requisito que sí se cumplía **desaparecía de la pantalla**: el administrador no podía distinguir «el envío está bien» de «nadie ha mirado el envío». Cada fallo lleva su propio botón; cuando la tienda vende no hay ninguno, porque «todo bien» no es una tarea.

⚠️ **No se inventan comprobaciones para llenar la lista.** Son dos porque son dos las que impiden completar un pedido. «Configuración de envío válida» no entra: los importes negativos ya los rechaza PostgreSQL (0036), así que ese check no puede fallar y sería un ✓ decorativo.

**EL ORDEN DE LA PANTALLA ES SU FUNCIÓN (incremento 16).** Estado de venta → **WhatsApp** → Entrega → Identidad → solo lectura. Antes empezaba por una tabla de solo lectura («Moneda y locale», «Logo · subida pendiente») y el campo de WhatsApp quedaba el último, detrás del formulario de alta de un método. En un teléfono eso pone lo único que impide vender al final del scroll, y al guardarlo el estado que confirma el arreglo se queda dos pantallas arriba. El alta de un método pasa a estar **debajo de la lista y plegada**: se crean una vez y se editan muchas.

**QUÉ VE EL CLIENTE DE ESTO.** `store_name` y `tagline` son la **identidad pública** de la tienda: `<title>` y su plantilla, `<meta description>`, el logo del Header, el Footer, el Open Graph de la home y de cada ficha, y la imagen que se ve al compartir el enlace (incremento 16, DEC-071). `contact_email` y las redes se pintan en el footer (incremento 15). Al guardar se invalida toda la tienda (`revalidateStorefront`), así que el cambio se ve en la siguiente carga, no a los 5 minutos.

**EL LOGO (incremento 17, DEC-074).** Subir → guardar → usar, dentro de la misma sección de Identidad. Se valida por **magic bytes** (un SVG disfrazado de PNG se rechaza), se recodifica a **WebP de 512 px** y se sustituye escribiendo **un objeto nuevo**, borrando el anterior después: nunca queda `logo_url` apuntando a un objeto que no existe. Se puede **quitar**, y la cabecera vuelve al nombre escrito. Sin biblioteca de imágenes, sin selector, sin recorte.

**Frase vacía = sin frase.** Si el administrador la borra, la tienda **no publica descripción**; no se sustituye por un texto por defecto. Y los límites los impone PostgreSQL (migraciones 0042/0043), no solo el formulario: nombre no en blanco y ≤ 80, frase ≤ 160, email con forma de email, redes solo `https://`.

### 4.6bis Métodos de entrega (incremento 9)

CRUD completo dentro de la misma pantalla de Ajustes: son configuración del mercado, como el número de WhatsApp.

- **Lo que se edita aquí decide lo que cobra la tienda** (DEC-064): el precio y el umbral entran en el total del pedido vía `create_order` (DEC-063).
- **Cada fila enseña el precio y la condición de envío gratis sin abrir nada.** A propósito: es el dato que más dinero mueve y el que más fácil se olvida.
- **Umbral vacío = nunca sale gratis. Umbral `0` = gratis siempre.** Son dos cosas distintas y las dos son válidas.
- Se acepta la **coma decimal** (`4,90`).
- **Retirar ≠ borrar.** Desmarcar «Ofrecer en el checkout» es la operación normal y quita el método del checkout al instante, sin redeploy. Borrar también se permite, y la fila avisa antes de cuántos pedidos lo han usado: esos pedidos **conservan** el nombre del método, el importe de envío y el total.
- **Avisos en rojo** cuando no hay ningún método o cuando ninguno está activo: en los dos casos nadie puede completar un pedido.
- El mercado lo pone el servidor; el formulario no lo lleva. Los límites (nombre no vacío, nombre único por mercado, umbral no negativo) los impone PostgreSQL en la migración 0036, no solo el formulario.

### 4.7 Dashboard (revisado en el incremento 20, DEC-085)
- Resumen operativo: cola de pedidos abiertos, avisos reales del catálogo y contadores por estado.
- **Lo primero es la acción, no el informe**: «+ Añadir producto» es la acción primaria de `/admin` y el único rojo de la pantalla.
- **Un bloque sin contenido no se pinta.** Tres de las cuatro secciones existían solo para decir que no había nada que hacer, y empujaban el único aviso real fuera de la primera pantalla. La excepción es la cola de pedidos: ahí el vacío ES la información.
- **Sin métricas de vanidad ni gráficas**: ni conversión, ni ingresos, ni CAC, ni ROAS, ni embudos.
- **El menú se separa por frecuencia de uso**: *operar* (inicio, pedidos, catálogo, inventario) siempre visible; *configurar* (categorías, colores y tallas, home, ajustes) dentro de un `<details>`. **Ninguna ruta se ha eliminado**, y `/admin/ajustes` sigue siendo configuración: no se mezcla con la creación.

---

## 5. Convenciones UX del panel

- Listados: tabla densa con acciones inline; filtros persistentes en URL (`searchParams` async).
- Formularios: validación en cliente para feedback inmediato + revalidación server-side siempre.
- Destructivos (archivar, desactivar): confirmación inline de 1 clic (no modales pesados).
- Todo texto del panel también centralizado en `lib/i18n/`.

---

## 6. Fuera de alcance v1

Multi-admin con roles granulares · auditoría completa de ediciones · import/export CSV · notificaciones push/email · reportes avanzados. El esquema admite evolucionar hacia ellos sin migración destructiva.