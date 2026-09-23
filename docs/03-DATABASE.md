# 03 — DATABASE: Modelo de datos (PostgreSQL / Supabase)

> **Implementado y VALIDADO CONTRA POSTGRES REAL** como migraciones versionadas en `supabase/migrations/0001`–`0021`. Este documento describe el diseño; el código SQL es la fuente de verdad del esquema real (code is the source of truth). Seed de desarrollo en `supabase/seed/` (solo mercado ES operativo, ver DEC-014).
>
> **Estado de validación (2026-09-01, Fase 4.5):** las 17 migraciones se aplicaron limpiamente sobre un proyecto Supabase real vacío (`supabase link` + `supabase db push`, PostgreSQL 17.6) — primera ejecución real del esquema. Verificado contra el catálogo del sistema: 18 tablas, RLS activo en las 18, todas las PK/FK/UNIQUE/CHECK de este documento, los 3 índices parciales de §2.6, los 10 triggers `set_updated_at` + `enforce_category_depth`, y los 2 buckets de Storage. El seed es idempotente (los 6 archivos reejecutados sin errores ni duplicados). Sigue **sin probarse el stack LOCAL** (`npm run db:start`): este entorno no tiene Docker.
>
> **Correcciones aplicadas en Fase 4.5** (divergencias reales entre este documento y el esquema implementado en Fase 3):
> - `0016`: la lectura pública de `categories`/`products`/`product_images`/`product_variants` no comprobaba que el mercado estuviera activo, pese a que §3 lo exige. Corregido con `public.is_active_market(text)` (DEC-022).
> - `0017`: `anon`/`authenticated` tenían TRUNCATE y TRIGGER sobre todas las tablas (grants por defecto de Supabase); RLS no filtra esos privilegios. Revocados (DEC-023).
> Convenciones: snake_case · PK `uuid` con `gen_random_uuid()` · timestamps `timestamptz` · dinero `numeric(12,2)` (nunca float) · soft delete con `deleted_at` donde aplique.
> Desviación de nombre respecto a este documento: la columna `sizes.group` se implementó como `sizes.size_group` (evita citar la palabra reservada `group` en cada query). El resto de nombres coincide exactamente con las tablas descritas abajo.

---

## 1. Diagrama de tablas

```
markets ──┬──< categories (self-ref parent_id)
          ├──< products ──< product_images
          │      │
          │      └──< product_variants >── colors (global)
          │                              >── sizes  (global)
          ├──< promotions ──< promotion_products >── products
          │        └──────< promotion_categories >── categories
          ├──1:1 settings
          ├──< shipping_methods
          ├──< home_content
          ├──< customers ──< orders ──< order_items >── product_variants
          │                      └──< order_events
auth.users ──1:1 profiles (rol admin)
```

---

## 2. Tablas

### 2.1 `markets`
| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | `'CO'` \| `'ES'` |
| name | text NOT NULL | "Colombia", "España" |
| currency_code | char(3) NOT NULL | `COP`, `EUR` (ISO 4217) |
| locale | text NOT NULL | `es-CO`, `es-ES` |
| is_active | boolean NOT NULL DEFAULT true | |

Seed inicial: CO y ES.

### 2.2 `profiles` (admins)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` (FK) |
| role | text NOT NULL DEFAULT 'admin' CHECK in ('admin') | extensible a futuro |
| full_name | text | |
| created_at / updated_at | timestamptz | |

Trigger sugerido: crear profile automáticamente al signup (o solo por invitación manual en v1).

### 2.3 `categories`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets | |
| parent_id | uuid FK → categories NULL | NULL = categoría raíz |
| name | text NOT NULL | |
| slug | text NOT NULL | UNIQUE(market_id, slug) |
| description | text | |
| image_url | text | |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

CHECK: profundidad máx. 2 niveles (validar en app + constraint opcional vía trigger).

### 2.4 `colors` (global)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | "Negro" |
| slug | text NOT NULL UNIQUE | |
| hex_code | char(7) NOT NULL | swatch UI. **CHECK `colors_hex_code_format` (migración `0034`): `^#[0-9A-Fa-f]{6}$`.** Sin él, `char(7)` RELLENA con espacios en vez de rechazar: `"rojo"` se guardaba como `'rojo   '` (reproducido con la sesión de un admin antes de la 0034) |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | `false` = retirado: deja de ofrecerse para variantes NUEVAS, las existentes lo conservan |

⚠️ **`name` NO es único; `slug` sí.** Dos colores homónimos con distinto slug son legales (verificado contra el proyecto real). La única defensa contra dos «Azul» indistinguibles en la matriz es que la Server Action **deriva el slug del nombre** cuando el admin lo deja vacío: dos nombres iguales dan el mismo slug y PostgreSQL lo rechaza con 23505. No se añadió constraint sobre `name`.

### 2.5 `sizes` (global)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| label | text NOT NULL | "M", "42" |
| size_group | text NOT NULL CHECK in ('apparel','footwear','accessory') | nombrada `size_group` en el esquema real (`group` es palabra reservada SQL) |
| sort_order | int NOT NULL DEFAULT 0 | orden lógico XS→XL, 36→46 |
| is_active | boolean NOT NULL DEFAULT true | |

UNIQUE(label, size_group). **`sizes` NO tiene `slug`**: su identidad es `(label, size_group)`, y la misma etiqueta en otro grupo es legal (verificado: `"44"` en `apparel` y en `footwear` conviven).

**Ambas tablas son GLOBALES: no tienen `market_id`** (verificado contra el OpenAPI del proyecto real, no leído de la migración). Por eso sus policies de admin son `is_admin()` a secas, sin `is_active_market`, y por eso `app/admin/(panel)/atributos/actions.ts` no resuelve mercado: no hay ninguno que decidir. Hay un test de integración que **afirma** que `market_id` no existe, para que añadirlo obligue a revisar esa decisión.

**Se administran desde `/admin/atributos`** (Fase 9.5, incremento 6). Antes, añadir un color exigía un `INSERT` a mano: era el único paso del alta de un producto que obligaba a salir del panel.

**Retirar vs eliminar** — lo decide PostgreSQL, no la interfaz:

- `is_active = false` es siempre seguro. La variante que ya lo usa conserva su color y su talla (verificado); lo que desaparece es la opción para crear variantes nuevas, y **eso lo impone `admin_create_variant_matrix` desde la 0034**, no el filtro de `listColors()`. Antes de la 0034 un POST directo a la RPC creaba variantes con atributos retirados (reproducido: `{"created":1}`).
- `DELETE` de un valor **en uso** lo rechaza la FK con **23503** (`product_variants_color_id_fkey` / `_size_id_fkey`, sin `ON DELETE`), y la variante queda intacta (verificado). Se ofrece igualmente y el error se traduce a un mensaje que dice qué hacer.
- **Renombrar no toca el historial**: `order_items` guarda `color_name` y `size_label` como snapshot en el momento de la compra. Verificado con un pedido real: tras renombrar, la línea del pedido sigue diciendo lo que se vendió y la variante viva sí muestra el nombre nuevo.

### 2.6 `products`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| category_id | uuid FK → categories NOT NULL | |
| name | text NOT NULL | |
| slug | text NOT NULL | UNIQUE(market_id, slug) |
| short_description | text | tarjetas/listados |
| description | text | ficha completa |
| materials | text | |
| care_instructions | text | |
| shipping_info_override | text | si NULL usa info del mercado |
| supplier | text CHECK (NULL o no en blanco y ≤ 120) | **Incremento 13, migración `0039`.** De dónde viene el artículo. Texto libre, **sin tabla de proveedores** y **sin UNIQUE**. Dato INTERNO: `lib/data/products.ts` no lo pide **y desde la `0044` `anon` tampoco tiene GRANT para pedirlo** (401 · 42501). Antes solo se cumplía lo primero |
| status | text NOT NULL DEFAULT 'draft' CHECK in ('draft','active','archived') | |
| is_featured | boolean NOT NULL DEFAULT false | |
| is_new | boolean NOT NULL DEFAULT false | |
| meta_title | text | SEO; fallback = nombre |
| meta_description | text | SEO; fallback = short_description |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

Índices parciales públicos:
```sql
CREATE INDEX idx_products_public ON products (market_id, category_id)
WHERE status='active' AND deleted_at IS NULL;
CREATE INDEX idx_products_featured ON products (market_id)
WHERE is_featured AND status='active' AND deleted_at IS NULL;
CREATE INDEX idx_products_new ON products (market_id)
WHERE is_new AND status='active' AND deleted_at IS NULL;
```

### 2.7 `product_images`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products ON DELETE CASCADE | |
| url | text NOT NULL | ruta Storage bucket `products` |
| alt_text | text NOT NULL | obligatorio (a11y+SEO) |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_primary | boolean NOT NULL DEFAULT false | exactamente una por producto — **lo garantiza el índice UNIQUE parcial** de la migración `0020`, no la app |
| blur_data_url | text NULL | **Fase 9, migración `0022`.** Placeholder blur: data URI de un WebP de 16 px (~66 bytes) que genera `sharp` en la subida. CHECK: prefijo `data:image/webp;base64,` y longitud 32–4000. **Jamás se acepta del cliente** (DEC-040). `NULL` = imagen anterior a Fase 9, se pinta sin placeholder |
| created_at | timestamptz | |

**No hay borrado lógico ni `is_active`**: una imagen existe o no existe (verificado contra el proyecto real). `product_id` es `ON DELETE CASCADE`, así que borrar un producto en duro se lleva sus filas — comprobado.

⚠️ **`url` es NOT NULL pero ADMITE la cadena vacía.** Verificado contra el proyecto real: `{"url":""}` devuelve 201. No hay ninguna hoy. Importa porque el renderizador público (`resolveImageUrl` → `if (!path) return null` → `RemoteImage` → `MockImage`) trata una url vacía **exactamente igual que la ausencia de imagen**: recuadro gris. Por eso el detector de "publicados sin foto" descarta esas filas en vez de limitarse a contar (ver `05-ADMIN.md` §4.1bis).

⚠️ **UNA FILA NO ES UNA FOTO** (incremento 10, DEC-066). Nada obliga a que el objeto al que apunta `url` exista en el bucket. Fue el estado real de esta tienda hasta la migración `0037`: **4 filas, 0 objetos**, con `/_next/image` devolviendo 400 en las cuatro, el HTML servido llevando un `<img>` roto —el fallback a `MockImage` es `onError` de CLIENTE— y `og:image`/JSON-LD sirviendo esa URL de 400. La `0037` borra las filas cuyo objeto no existe (solo con `url` NO vacía: la vacía es territorio de P2) y añade el detector permanente `admin_products_with_broken_images(text)`.

**`admin_products_with_broken_images(p_market_id text)`** — `SECURITY DEFINER` **obligado**: el dato vive en `storage.objects`, que PostgREST no expone y tiene RLS propia. Por eso la puerta `public.is_admin()` va **dentro del WHERE**, y un no-admin recibe **cero filas, no un error**. Filtra además por `is_active_market` (DEC-035) y por `deleted_at is null`. Una sola consulta: cruzarlo desde TypeScript sería N+1 y exigiría `service_role`. **El seed ya no inserta filas de `product_images`**, y hay un test que falla si vuelven.

### 2.8 `product_variants`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products ON DELETE CASCADE | |
| color_id | uuid FK → colors | NULL permitido solo si producto sin color (accesorios) |
| size_id | uuid FK → sizes | NULL permitido solo accesorios talla única |
| sku | text NOT NULL UNIQUE | |
| price | numeric(12,2) NOT NULL CHECK (price >= 0) | |
| compare_at_price | numeric(12,2) CHECK (compare_at_price > price) | "antes" |
| stock | int NOT NULL DEFAULT 0 CHECK (stock >= 0) | |
| low_stock_threshold | int NOT NULL DEFAULT 3 | "Últimas unidades". **Editable desde el panel desde la Fase 9.5** |
| is_low_stock | boolean GENERADA | **Fase 9.5, migración `0024`.** `stock <= low_stock_threshold`, calculada por PostgreSQL. **No se puede escribir** (verificado: PostgreSQL lo rechaza incluso con service role). Existe porque PostgREST no sabe comparar dos columnas de la misma fila |
| supplier_ref | text CHECK (NULL o no en blanco y ≤ 120) | **Incremento 13, migración `0039`.** La referencia con la que el proveedor nombra ESTA variante, que es el nivel al que llega la disponibilidad. **Se guarda tal cual se escribe** (`abc-123` no se convierte en `ABC123`). **Sin UNIQUE:** no identifica la variante —eso lo hace el `sku`—, la señala. **No viaja al pedido:** `order_items` no la copia. **Privada desde la `0044`:** `anon` no tiene GRANT de lectura, así que no basta con que la ficha no la pinte |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | `updated_at` es además el **testigo del bloqueo optimista** de la corrección absoluta de stock (DEC-047). Lo sella el trigger `set_updated_at`, que es `BEFORE UPDATE`: no se puede falsificar |

UNIQUE(product_id, color_id, size_id).

**Edición de stock (Incremento 12, DEC-067):** el panel ESTABLECE el valor con
`admin_set_variant_stock` (migración `0038`), porque la fuente externa dicta
"hay 12" y no "han llegado 12". Dos modos explícitos: `set` —exige
`expected_updated_at`, y un testigo caducado lanza `STOCK_CHANGED`
**deshaciendo el lote entero**— y `exhaust`, que escribe 0, no admite testigo
porque converge, y es idempotente. No toca `is_active` ni el estado del
producto: agotado NO es despublicado.

**Tope superior: NO existe en la base de datos.** `stock` es `int` con
`check (stock >= 0)` y nada más. El 100000 que rechazan la 0038 y
`lib/admin/catalog.ts` es una defensa de aplicación compartida por los dos
caminos de escritura absoluta, no un constraint.

**Reposición por DELTA (Fase 9.5, DEC-047):** `admin_restock_variants`
(migración `0026`) sigue existiendo y probada —`stock = stock + delta` es
inmune a la pérdida de actualizaciones: verificado con diez reposiciones
simultáneas de +4 sobre 0 → 40—, pero **desde el incremento 12 ninguna pantalla
la llama** (DEC-068): es la operación de una recepción de mercancía, no la de
copiar un inventario dictado.

> **Resuelto (DEC-019):** `color_id`/`size_id` nullable, tal como implementado. La validación de "cuándo son obligatorias según el grupo del producto" queda para el admin (Fase 7), no como CHECK de esquema.

### 2.9 `promotions`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| name | text NOT NULL | interno |
| type | text NOT NULL CHECK in ('percentage','fixed_amount','special_price','code') | |
| value | numeric(12,2) NOT NULL | % o importe según tipo |
| code | text | UNIQUE(market_id, code) donde no NULL |
| scope | text NOT NULL CHECK in ('all','products','categories') | |
| starts_at / ends_at | timestamptz NULL | vigencia opcional |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

CHECK coherencia tipo/valor: percentage → 0 < value ≤ 100; fixed/special_price → value > 0.

### 2.10 `promotion_products` / `promotion_categories`
Tablas puerto N:M: `(promotion_id FK, product_id FK)` / `(promotion_id FK, category_id FK)`, PK compuesta. Solo relevantes cuando scope lo indique.

### 2.11 `customers`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| phone | text NOT NULL | formato E.164 normalizado |
| name | text | |
| email | text | opcional |
| notes | text | interno admin |
| created_at / updated_at | timestamptz | |

UNIQUE(market_id, phone).

### 2.12 `orders`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_number | text NOT NULL UNIQUE | ej. `YI-CO-000123` (formato final Fase 6) |
| market_id | text FK → markets NOT NULL | |
| customer_id | uuid FK → customers NOT NULL | |
| channel | text NOT NULL CHECK in ('whatsapp','online') | 'online' futuro |
| status | text NOT NULL DEFAULT 'pending' CHECK in ('pending','contacted','confirmed','paid','preparing','shipped','delivered','cancelled') | |
| currency_code | char(3) NOT NULL | snapshot del market |
| subtotal | numeric(12,2) NOT NULL | |
| discount_total | numeric(12,2) NOT NULL DEFAULT 0 | |
| shipping_total | numeric(12,2) NOT NULL DEFAULT 0 | **Desde el incremento 8 lo calcula `create_order`** desde el método elegido y su umbral. Antes era 0 siempre |
| shipping_method_id | uuid FK → shipping_methods **ON DELETE SET NULL** | **Incremento 8.** Método elegido. NULL en pedidos anteriores y si el método se borra |
| shipping_method_name | text NULL | **Incremento 8.** SNAPSHOT del nombre en el momento de la compra, igual que `order_items.product_name`: renombrar un método NO reescribe pedidos pasados (verificado) |
| total | numeric(12,2) NOT NULL | |
| shipping_address | jsonb | cuando exista checkout online |
| notes | text | notas del cliente/admin |
| source_url | text | URL desde la que se generó (producto/carrito) |
| attribution | jsonb NULL | **Incremento 14, migración `0040`.** De qué anuncio vino el pedido: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `landing_path`. **SIN PII por construcción**: `create_order` lee esa lista blanca y descarta el resto, así que ni un POST directo puede meter otra cosa. Se escribe UNA vez, en el INSERT; un reintento idempotente no la reescribe. `NULL` = tráfico directo. Detalle completo en `12-ATTRIBUTION.md` |
| created_at / updated_at | timestamptz | |

Índices: `(market_id, status)`, `(customer_id)`, `created_at DESC`.

> **Fase 6:** `orders` gana `client_request_id uuid` + `client_request_fingerprint text` con índice UNIQUE parcial, para idempotencia del checkout (DEC-028). Y se añade la tabla `order_counters (market_id, last_number)`, que genera el correlativo de `order_number` por mercado (DEC-027) — sin lectura pública, porque revelaría el volumen de ventas.

### 2.13 `order_items` (snapshot inmutable)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders ON DELETE CASCADE | |
| variant_id | uuid FK → product_variants NULL | NULL si variante eliminada después |
| product_name | text NOT NULL | snapshot |
| color_name | text | snapshot |
| size_label | text | snapshot |
| sku | text | snapshot |
| unit_price | numeric(12,2) NOT NULL | snapshot precio aplicado |
| quantity | int NOT NULL CHECK (quantity > 0) | |
| line_total | numeric(12,2) NOT NULL | unit_price × quantity |

> ⚠️ **Discrepancia conocida (Fase 6, sin corregir a propósito):** `order_items` **no guarda la imagen** del producto. Si la foto cambia o se borra, el pedido histórico ya no puede mostrarla. No se añade columna porque ni el mensaje de WhatsApp ni el admin previsto la necesitan; se documenta para que sea una decisión consciente y no un olvido.

### 2.14 `order_events` (append-only)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders ON DELETE CASCADE | |
| from_status | text | NULL en creación |
| to_status | text NOT NULL | |
| note | text | |
| actor_id | uuid FK → profiles NULL | NULL = sistema |
| created_at | timestamptz DEFAULT now() | |

Protección append-only: REVOKE UPDATE/DELETE a roles no-admin; policy admin solo INSERT/SELECT.

> ⚠️ **Su policy de INSERT es `with check (public.is_admin())` y NADA más**: no restringe `from_status` ni `to_status`. Un admin puede fabricar por POST directo una transición que nunca ocurrió. Hoy no importa porque el único camino que inserta aquí es `admin_update_order_status` (0019). **No abras un segundo camino de escritura a esta tabla** — es la razón por la que las notas internas viven aparte (DEC-050).

### 2.14bis `order_notes` (append-only, Fase 9.5 · migraciones 0027 y 0028)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders ON DELETE CASCADE | |
| body | text NOT NULL | `check (body ~ '\S' and length(btrim(body, E' \t\n\r\f\v')) <= 2000)` |
| actor_id | uuid FK → profiles **NOT NULL** | `DEFAULT auth.uid()`; nunca llega del formulario |
| created_at | timestamptz DEFAULT now() | |

Índice `idx_order_notes_order_created (order_id, created_at)`: sirve al filtro y al orden a la vez.

Notas internas del pedido: dónde acaba la dirección de entrega y lo acordado por WhatsApp (DEC-049). **Nunca visibles para `anon`, nunca en el checkout, nunca en el mensaje al cliente.** No cambian el estado del pedido ni el stock: la tabla no tiene ninguna relación con `product_variants` ni con `orders.status`.

Dos barreras propias sobre el patrón de `order_events`:
- **Autoría no falsificable**: `with check (public.is_admin() and actor_id = auth.uid())`. Enviar el `actor_id` de otro admin devuelve **403** (verificado).
- **Append-only real**: `revoke update, delete` además de las policies.

⚠️ El CHECK usa `~ '\S'` y **no** `btrim(body)` a secas: `btrim(text)` con un argumento solo quita espacios (U+0020), no `\t` ni `\n`, y la versión inicial aceptaba notas en blanco por POST directo (DEC-051).

> **`orders.shipping_address` y `orders.notes` NO se usan.** `create_order` no las escribe y el checkout solo captura teléfono y nombre. La dirección va en `order_notes` (DEC-049). No empieces a usarlas sin una decisión de negocio previa.

### 2.14ter `admin_change_log` (append-only, Fase 9.5 · migraciones 0032 + **0033**)
| Columna | Tipo | Notas |
|---|---|---|
| id | bigint identity PK | |
| product_id | uuid FK → products ON DELETE CASCADE | ancla de lectura; el mercado se DERIVA de aquí, no se guarda |
| variant_id | uuid FK → product_variants **ON DELETE SET NULL** | NULL para campos del producto |
| sku | text | único dato duplicado: es lo que sobrevive al borrado de la variante |
| field_name | text NOT NULL | CHECK: status, deleted_at, price, stock |
| old_value / new_value | text | escalares; `jsonb` obligaría a la UI a interpretar estructura |
| source | text NOT NULL | CHECK: reposicion, correccion, matriz, directo, rpc |
| actor_id | uuid FK → profiles NOT NULL | de `auth.uid()`, jamás de un formulario |
| created_at | timestamptz DEFAULT now() | |

Índice `idx_admin_change_log_product (product_id, created_at desc)`: sirve al filtro y al orden a la vez, que es el único patrón de acceso ("las últimas N de este producto"). Con 30.000 filas —10.000 del producto consultado— la consulta real de la ficha se mide en **p50 130 ms contra 110 ms con la tabla vacía**, dentro del RTT de red: no escala con el tamaño de la tabla. *`EXPLAIN` no es obtenible contra el proyecto hosted (`PGRST107` al pedir el plan por PostgREST, sin `psql` ni driver); las cifras de plan que este documento traía antes son de una sesión anterior y no se han reverificado.*

**Una sola policy, y es de SELECT.** No hay policy de INSERT/UPDATE/DELETE y además hay REVOKE: la única escritura es el trigger `log_admin_change` (SECURITY DEFINER, propiedad de `postgres`, que no está sujeto a RLS). Un admin no puede fabricar ni alterar un registro (DEC-056).

**El SELECT hereda el mercado del producto** (0033, DEC-060): `is_admin() and exists (… products p where p.id = product_id and is_active_market(p.market_id))`, la misma forma que `admin_all_product_variants`. Antes decía solo `is_admin()`, y era la única tabla del admin que ignoraba DEC-035: con el mercado apagado el producto devolvía `[]` y su historial seguía siendo legible.

⚠️ **NO es un libro mayor de existencias.** Ni las ventas ni las cancelaciones entran: `order_events` ya las cubre, así que el stock puede saltar de 24 a 20 sin una entrada. Es deliberado (DEC-055).

⚠️ **El trigger escribe solo si `is_admin()`**, no solo si hay sesión (0033, DEC-059). Con la puerta anterior, un autenticado sin fila en `profiles` hacía saltar la FK de `actor_id` **dentro de `create_order`** y el pedido no llegaba a crearse: la auditoría podía denegar una venta. Además de `admin_update_order_status`, se excluye por ruta `create_order`. Si añades una función que mueva `product_variants.stock` por causa de un pedido, **añádela a esa lista**.

### 2.15 `shipping_methods`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| name | text NOT NULL CHECK `btrim(name) <> ''` | "Envío nacional". **UNIQUE `(market_id, name)`** desde 0036: dos métodos con el mismo nombre son indistinguibles para quien elige en el checkout |
| description | text | |
| price | numeric(12,2) NOT NULL CHECK >= 0 | |
| free_shipping_threshold | numeric(12,2) NULL CHECK `is null or >= 0` | **SE APLICA desde el incremento 8** (DEC-063): el envío es gratis cuando el **subtotal de productos** alcanza este valor (`>=`). NULL = el método no tiene umbral y siempre cuesta su precio. Contra el subtotal y no contra el total, porque el total incluye el envío. **El CHECK de no-negativo es de la 0036** (DEC-064): sin él, `subtotal >= -50` es siempre cierto y el envío sale gratis para toda la tienda, en silencio |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | Retirar un método es desmarcarlo, no borrarlo |
| created_at / updated_at | timestamptz | |

⚠️ **Esta tabla decide lo que cobra la tienda.** `create_order` lee de aquí precio y umbral (DEC-063). Se administra desde `/admin/ajustes` (DEC-064); las escrituras van por el cliente de sesión con RLS, nunca por `service_role`, y `market_id` lo pone siempre el servidor.

**Borrar un método es seguro**: `orders.shipping_method_id` es `on delete set null` y el pedido conserva `shipping_method_name`, `shipping_total` y `total` como snapshot. **No conviertas esa FK en `ON DELETE CASCADE`.**

### 2.16 `settings` (1:1 con market)
| Columna | Tipo | Notas |
|---|---|---|
| market_id | text PK FK → markets | |
| store_name | text NOT NULL CHECK (no en blanco y ≤ 80) | **Identidad pública** desde el incremento 16: `<title>`, plantilla `%s · nombre`, logo del Header, Footer y `og:site_name` de la home y de cada ficha. CHECK de la `0042`, corregido por la `0043` |
| tagline | text CHECK (NULL o no en blanco y ≤ 160) | **Incremento 16, migración `0042`.** La frase de la tienda: `<meta description>`, Open Graph, imagen de portada y Footer. **NULL = la tienda no publica descripción y no se pinta ninguna**; nunca se sustituye por un texto por defecto escrito en el código |
| logo_url | text | **RUTA** dentro del bucket `content` (`logo/{market}-{uuid}.webp`), no una URL: la resuelve `getPublicUrl`, igual que `product_images.url`. Administrable desde `/admin/ajustes` desde el incremento 17 (DEC-074). `NULL` = la cabecera pinta el nombre escrito |
| whatsapp_number | text NOT NULL | **fuente única del número** (E.164, sin "+": `573001234567`) |
| contact_email | text CHECK (NULL o forma de email, ≤ 254) | CHECK de la `0042` |
| instagram_url / tiktok_url / facebook_url | text CHECK (NULL o `https://…`, ≤ 300) | CHECK de la `0042`. **Solo https**: el valor acaba en un `href` del footer de todas las páginas, y con `javascript:` permitido el panel podía escribir un enlace ejecutable |
| policies | jsonb NOT NULL DEFAULT '{}' | `{shipping, returns, privacy}` estructurados |
| updated_at | timestamptz | **NO concedida a `anon`** (migración 0041) |

**Lectura pública por COLUMNA (Incremento 15, migración `0041`).** RLS decide qué
FILAS se ven, no qué columnas, y medido: `GET /settings?select=*` con la anon key
devolvía la fila entera. Hoy ninguna de esas columnas es secreta, así que no
había fuga; lo que cambia la 0041 es que `anon` solo tiene `GRANT SELECT` sobre
las columnas públicas concretas, de modo que **una columna nueva nace privada**
(un Meta Pixel ID, un token de la Conversions API). `authenticated` conserva la
lectura completa porque hoy el único autenticado posible es un administrador; si
algún día hay cuentas de cliente, esto hay que revisarlo.

Consumo real: `getSettings` (checkout y estado de venta) pide `store_name,
whatsapp_number, contact_email`; `getStorefrontSettings` (footer, logo del Header
y metadata, incremento 16) pide nombre, frase, email y las tres redes. Ninguna
función pública pide la fila entera, y hay un test que lo comprueba.

**Los límites viven en PostgreSQL desde la `0042` (DEC-071).** Medido antes: con
la sesión de un admin y sin pasar por el panel, un `store_name` de tres espacios,
un `instagram_url` con `javascript:` y un `contact_email` que no es un email
devolvían **200 y se guardaban**. `validateSettingsInput` ya los rechazaba, pero
esa validación protege un solo camino de escritura.

⚠️ La `0042` usó `btrim(x) <> ''` para «no en blanco», y **`btrim` sin segundo
argumento recorta solo el carácter espacio**: un tabulador y un salto de línea la
pasaban. La `0043` lo sustituye por `x ~ '[^[:space:]]'`, que es el equivalente
exacto de `String.prototype.trim()`. Úsalo siempre que la validación de
TypeScript use `.trim()`.

### 2.17 `home_content`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| section | text NOT NULL CHECK in ('hero','banner','strip_promo') | |
| title | text | |
| subtitle | text | |
| cta_label | text | |
| cta_href | text | interno o externo validado |
| image_url | text | |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |
| starts_at / ends_at | timestamptz NULL | programación |
| created_at / updated_at | timestamptz | |

---

## 3. Row Level Security (resumen; detalle completo en 08-SECURITY)

Patrón común — helper de rol:

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
```

| Tabla | SELECT público | Escritura |
|---|---|---|
| markets | activos | admin |
| categories / products / images / variants | activos y no borrados **y market activo** (implementado en `0016` vía `is_active_market()`, DEC-022) | admin |
| promotions + pivotes | activos y vigentes | admin |
| shipping_methods / settings / home_content | activos | admin |
| colors / sizes | activos | admin |
| customers | ❌ nada | admin |
| orders / items / events | ❌ nada | admin (events: insert+select) |
| profiles | propia fila | admin (rol solo editable por service role/SQL) |

Toda tabla: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` en su migración. Sin excepciones (DEC-009).

Además, toda tabla nueva de `public` debe revocar TRUNCATE y TRIGGER de `anon`/`authenticated` en su propia migración: RLS **no** filtra esos privilegios (DEC-023).

---

## 4. Supabase Storage

| Bucket | Acceso | Contenido |
|---|---|---|
| `products` | lectura pública; escritura solo admin | imágenes de producto (webp/jpg ≤ 5MB) |
| `content` | lectura pública; escritura solo admin | logos, banners, categorías, hero |

Policies de storage equivalentes a RLS (`is_admin()` para write; `true` para read en buckets públicos). Rutas sugeridas **relativas al bucket**: `{product_slug}/{uuid}.webp` dentro de `products`, `{market}/{tipo}/{uuid}` dentro de `content`.

> ⚠️ La ruta guardada en `product_images.url` NO debe repetir el nombre del bucket. `supabase.storage.from('products').getPublicUrl(path)` ya antepone `products/`; guardar `products/x.jpg` genera la URL rota `.../public/products/products/x.jpg`. Bug real del seed de Fase 3, detectado y corregido en Fase 4.5.

**Validado en Fase 4.5 contra el proyecto real:** ambos buckets existen y son públicos en lectura; `anon` no puede subir ni borrar (403/400); `service_role` sube y el objeto queda accesible por URL pública sin autenticación.

**Endurecidos en Fase 8 (migración `0020`):** ambos buckets tienen ya `file_size_limit = 5 MiB` y `allowed_mime_types = {image/jpeg, image/png, image/webp}`. El límite documentado pasa a ser también una restricción de infraestructura, no solo de aplicación. **SVG queda fuera a propósito**: puede contener scripts y los buckets son de lectura pública.

⚠️ **`allowed_mime_types` NO basta:** confía en la cabecera `Content-Type` que envía quien sube. La aplicación valida por **magic bytes** (`lib/admin/images.ts`) y, además, re-codifica la imagen con `sharp` antes de subirla, de modo que el objeto del bucket lo genera el servidor y no el cliente (DEC-036). Verificado: un SVG y un PHP declarados como `image/png` son rechazados.

**Placeholder blur (Fase 9, migración `0022`, DEC-040):** columna NULLABLE y sin default, así que el `ALTER TABLE` **no reescribe la tabla ni toca ninguna fila**. No se reprocesa ninguna imagen ya subida. El CHECK impone en PostgreSQL lo que `lib/admin/images.ts` valida en TypeScript: aunque una Server Action se olvidara de comprobarlo, la BD rechaza cualquier data URI que no sea un WebP en base64 de tamaño de placeholder. ⬜ **Backfill de las 4 imágenes del seed: PENDIENTE** — exige descargar y reprocesar cada objeto del bucket, que es una operación externa, no una migración SQL.

**Una sola imagen principal por producto (Fase 8):** `03-DATABASE` §2.7 decía que lo garantizaba la aplicación. Con CRUD real dos peticiones concurrentes dejaban dos principales, así que la migración `0020` añade el índice `product_images_one_primary_per_product` (UNIQUE parcial sobre `product_id` where `is_primary`). Verificado: la BD rechaza la segunda.

---

## 5. Integridad y convenciones

- FKs explícitas con `ON DELETE` adecuado (CASCADE en dependientes huérfanos; RESTRICT en referencias comerciales).
- `updated_at` automático vía trigger genérico.
- Dinero SIEMPRE `numeric`; formateo en app (`lib/money/`), nunca en SQL.
- Stock: decrementos transaccionales con `stock >= cantidad` guard (evitar negativos bajo concurrencia). **Implementado en Fase 6** dentro de `public.create_order()`, verificado con tests de concurrencia reales (10 compras simultáneas contra 3 unidades → exactamente 3 tienen éxito, stock final 0, nunca negativo):
```sql
UPDATE product_variants SET stock = stock - $qty
WHERE id = $id AND stock >= $qty;  -- verificar rowcount
```
- **Devolución de stock (Fase 7, DEC-033):** la operación inversa vive en
  `public.admin_update_order_status()` y solo se dispara al pasar a `cancelled`.
  Ocurre **exactamente una vez** porque solo se llega desde un estado no
  cancelado y la fila del pedido va bloqueada con `select … for update` desde
  antes de validar la transición. Verificado con 10 cancelaciones simultáneas:
  una sola triunfa, el stock vuelve una vez, un solo `order_event`. Las líneas
  con `variant_id is null` (variante borrada) no devuelven stock y se anotan en
  la nota del evento — no se inventa a qué variante devolverlas.

---

## 5.1 Máquina de estados de pedido (Fase 7, migración 0019)

Los estados son los del `CHECK` de `orders.status` (§2.12). Las transiciones
permitidas las impone `public.admin_update_order_status()`, **no la aplicación**:

```
pending → contacted → confirmed → paid → preparing → shipped → delivered
cualquiera (excepto delivered y cancelled) → cancelled
```

- `delivered` y `cancelled` son **terminales**. No se puede retroceder ni repetir
  el estado actual: el historial es append-only y un pedido no "des-ocurre".
- `paid` exige el argumento `p_payment_confirmed = true`. **Nunca es automático**
  (docs/05-ADMIN.md §4.4, KNOWN-CONSTRAINTS).
- La función es **`SECURITY INVOKER`** —a diferencia de `create_order`, que es
  `DEFINER` porque su llamante es anónimo—: el admin ya tiene policies, así que
  RLS se sigue aplicando fila a fila dentro de la función (DEC-032).
- Cada transición escribe su `order_event` con `from_status`, `to_status`, nota
  opcional y `actor_id = auth.uid()`, en la misma transacción.
- Errores señalados con `RAISE EXCEPTION`: `FORBIDDEN`, `ORDER_NOT_FOUND`,
  `INVALID_STATUS`, `INVALID_INPUT`, `TRANSITION_NOT_ALLOWED`,
  `PAYMENT_NOT_CONFIRMED`.

`lib/admin/orders.ts` mantiene un espejo de esta tabla **solo para pintar
botones**; un test compara ambas y falla si divergen.

---

## 6. Pendientes de decisión

1. ~~¿Variantes sin color/talla para accesorios?~~ **Resuelto (DEC-019):** sí, nullable, implementado tal cual en `product_variants`.
2. ~~Formato definitivo de `order_number`~~ **Resuelto (DEC-027):** `YI-ES-000001`, correlativo por mercado vía `order_counters`.
3. Confirmar regla "promoción más favorable gana" — pendiente (se aplicará en la lógica de cálculo de precio, no en el esquema).
4. Estrategia códigos descuento v1 (manual WhatsApp vs automático visible) — **sigue pendiente**: promociones quedaron fuera del alcance acordado de Fase 7.