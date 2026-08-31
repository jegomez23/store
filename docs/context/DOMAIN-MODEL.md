# DOMAIN-MODEL — Conceptos y reglas del negocio YI

> Explica el dominio, no las tablas. El mapeo físico a PostgreSQL está en `03-DATABASE.md`. Si este documento y la BD discrepan, aplica el protocolo de sincronización de `AI-DEVELOPMENT.md`.

---

## Mapa de relaciones (vista general)

```
Market ──1:N──> Product ──1:N──> ProductVariant <──N:1── Color
   │                │                 │       <──N:1── Size
   │                ├──1:N──> ProductImage
   │                ├──N:M──> Promotion (scope products)
   │                └──N:1──> Category (jerárquica)
   │
   ├──1:1──> Setting          (config comercial del mercado)
   ├──1:N──> ShippingMethod
   ├──1:N──> HomeContent
   ├──1:N──> Promotion        (scope categories/all)
   ├──1:N──> Order ──1:N──> OrderItem ──N:1──> ProductVariant
   │             └──1:N──> OrderEvent
   └──1:N──> Customer

Admin (profile con rol) ──gestiona──> todo lo anterior
CheckoutChannel ──procesa──> Order (canal: whatsapp | online)
```

---

## Entidades

### Market
**Qué es:** Un mercado geográfico donde YI vende (inicialmente `CO`, `ES`). Es la raíz de toda la dimensión comercial.
**Propiedad de:** moneda, locale, estado de activación.
**Relaciones:** padre lógico de productos, categorías, promociones, pedidos, envíos, contenido home y settings.
**Reglas:**
- El mercado activo de un despliegue se fija por `NEXT_PUBLIC_MARKET`; nunca se hardcodea.
- Toda consulta pública debe filtrar por el mercado activo.
- Un producto pertenece a UN mercado; venderlo en otro implica crear su ficha en ese mercado (stock y precios son independientes por mercado).

### Product
**Qué es:** Una ficha comercial de una prenda/calzado/accesorio dentro de un mercado.
**Propiedad de:** identidad comercial (nombre, slug, descripciones), clasificación (categoría), flags comerciales (destacado/nuevo/promoción vía scope), materiales, cuidados.
**Relaciones:** 1 market, 1 category, N variantes, N imágenes, N promociones (por scope).
**Reglas:**
- Slug único por mercado; usado en URLs públicas (`/producto/[slug]`).
- Estados: `draft` (no visible) / `active` / `archived`. Solo `active` es público.
- Soft delete (`deleted_at`): nunca borrado físico si tuvo pedidos asociados.
- El precio NO vive aquí: vive en la variante. Los flags "en promoción" se derivan de promociones activas, no de un booleano manual.

### ProductVariant
**Qué es:** La unidad vendible real: combinación única de producto + color + talla.
**Propiedad de:** SKU, precio, precio anterior (compare_at), stock, disponibilidad.
**Relaciones:** 1 product, 1 color, 1 size, N order_items (histórico).
**Reglas:**
- Única por combinación (product_id + color_id + size_id).
- **El stock se gestiona SOLO a nivel de variante**, nunca agregado al producto.
- Precio ≥ 0; compare_at_price opcional y solo con sentido si > precio actual (representa "antes").
- Stock 0 = variante no comprable pero visible (mostrar "Agotado" en esa talla/color).
- Al registrar un pedido, los datos de línea se **snapshot-ean** en OrderItem (nombre, color, talla, precio) para que cambios futuros no alteren pedidos históricos.

### Color
**Qué es:** Catálogo global de colores reutilizable entre productos.
**Propiedad de:** nombre, slug, código hex (para swatch UI), orden.
**Reglas:** Global (sin market): los colores son universales; la disponibilidad depende de las variantes creadas.

### Size
**Qué es:** Catálogo global de tallas agrupadas por tipo de producto.
**Propiedad de:** etiqueta ("M", "42"), grupo (`apparel` | `footwear` | `accessory`), orden.
**Reglas:** El admin solo ofrece tallas del grupo correspondiente a la categoría del producto (una sudadera no ofrece talla 42).

### Category
**Qué es:** Taxonomía jerárquica del catálogo (categoría → subcategoría). Ej.: Ropa → Camisetas.
**Propiedad de:** nombre, slug, imagen, orden, activación.
**Relaciones:** self-referencing (parent_id); 1 market; N productos.
**Reglas:**
- Máximo 2 niveles de profundidad en v1.
- Slug único por mercado.
- No se puede eliminar una categoría con productos activos (desactivar o reasignar primero).
- Soft delete igual que productos.

### ProductImage
**Qué es:** Imagen de la galería de un producto, alojada en Supabase Storage.
**Propiedad de:** URL, alt text, orden, flag principal.
**Reglas:**
- Exactamente una imagen principal por producto (la primera por defecto).
- Orden controlado por el admin (drag & drop en Fase 7).
- Alt text obligatorio (accesibilidad + SEO).

### Promotion
**Qué es:** Mecanismo de descuento aplicable al catálogo.
**Propiedad de:** tipo (`percentage` | `fixed_amount` | `special_price` | `code`), valor, vigencia, alcance, código (si aplica).
**Relaciones:** 1 market; scope: todos / productos seleccionados (N:M) / categorías seleccionadas (N:M).
**Reglas:**
- Vigencia temporal opcional (starts_at/ends_at).
- Un producto puede estar afectado por varias promociones: **se aplica la más favorable para el cliente** (regla documentada; confirmable por Juan).
- Promoción tipo `code`: requiere código introducido… ⚠️ En v1 sin checkout automatizado no hay campo para canjear códigos en la compra. Los códigos se comunican y validan manualmente por WhatsApp, o se usan como promociones automáticas visibles. Pendiente de decisión humana antes de Fase 7.
- El precio final mostrado siempre se calcula servidor-side desde variantes + promociones activas; el carrito guarda snapshot informativo.

### Order
**Qué es:** Un pedido registrado, sea cual sea el canal de cierre.
**Propiedad de:** número legible, estado, totales, canal, notas, dirección (cuando exista).
**Relaciones:** 1 market, 1 customer, N items, N eventos.
**Reglas:**
- Estados: `pending → contacted → confirmed → paid → preparing → shipped → delivered`, con `cancelled` transversal.
- **Un pedido creado desde WhatsApp nace `pending`. Jamás pasa a `paid` automáticamente**: solo cuando el admin lo confirma tras recibir el pago real.
- Se crea ANTES de abrir WhatsApp (así existe registro aunque el usuario no envíe el mensaje).
- Totales calculados servidor-side; moneda heredada del market.
- Número legible generado secuencialmente por mercado (ej.: `YI-CO-000123`) — formato exacto decidible en Fase 6.

### OrderItem
**Qué es:** Línea de pedido con snapshot inmutable de lo vendido.
**Propiedad de:** nombres/labels snapshot, sku, precio unitario, cantidad, total línea.
**Reglas:** Nunca se edita retroactivamente; correcciones = nuevo evento + ajuste de stock.

### OrderEvent
**Qué es:** Bitácora inmutable de cambios de estado del pedido.
**Propiedad de:** from_status, to_status, nota, actor (admin), timestamp.
**Reglas:** Append-only. Da trazabilidad completa ("¿quién marcó enviado y cuándo?").

### Customer
**Qué es:** Comprador identificado por su WhatsApp.
**Propiedad de:** nombre, teléfono, email opcional, notas internas.
**Reglas:**
- Único por (market, phone).
- Se crea/reutiliza automáticamente al registrar un pedido de WhatsApp.
- Sin cuentas ni login en v1 (es un registro operativo, no una identidad de acceso).

### Admin
**Qué es:** Usuario con permisos de gestión, vinculado a Supabase Auth.
**Propiedad de:** rol (`admin`), nombre.
**Reglas:**
- Vive en `profiles` (1:1 con auth.users).
- La autorización real ocurre en RLS comprobando `profiles.role`.
- En v1 un único rol; el esquema admite roles futuros (`editor`, `viewer`) sin migración destructiva.
- **Alta manual, sin trigger de auto-creación** (DEC-020): crear el usuario en Supabase Auth y su fila en `profiles` con `role='admin'` es un paso operativo manual (SQL/dashboard), nunca un flujo de signup público.

### Setting
**Qué es:** Configuración comercial por mercado (1:1 con Market).
**Propiedad de:** nombre tienda, logo, WhatsApp number, email contacto, redes sociales, políticas (envío/devoluciones/privacidad como JSON estructurado).
**Reglas:**
- **El número de WhatsApp vive AQUÍ. Prohibido hardcodearlo en componentes** (requisito explícito del producto).
- Editable íntegramente desde el admin sin tocar código.

### HomeContent
**Qué es:** Bloques de contenido editable de la página de inicio.
**Propiedad de:** sección (`hero` | `banner` | `strip_promo`), título, subtítulo, CTA (label+href), imagen, orden, vigencia.
**Reglas:**
- Por mercado; ordenado; activable/desactivable.
- Los productos destacados/nuevos de home NO viven aquí: se derivan de los flags de Product (+ promociones activas). HomeContent solo gestiona bloques editoriales.

### ShippingMethod
**Qué es:** Opción de envío disponible en un mercado.
**Propiedad de:** nombre, descripción, precio, umbral de envío gratis opcional, orden, activación.
**Reglas:** Mostrado en ficha de producto y comunicado en el mensaje de WhatsApp; en v1 el coste real se confirma en la conversación.

### CheckoutChannel
**Qué es:** Abstracción del mecanismo de cierre de venta (patrón Strategy).
**Propiedad de:** implementación concreta: `WhatsAppChannel` (v1), `OnlinePaymentChannel` (futuro).
**Contrato conceptual:**

```ts
interface CheckoutChannel {
  submitOrder(input: CheckoutInput): Promise<CheckoutResult>;
}
// CheckoutInput: items[] (variant_id, qty), market, customer opcional
// CheckoutResult: { orderId, redirectUrl?, message? }
```

**Reglas:**
- La UI jamás conoce detalles del canal: llama a `submitOrder`.
- `WhatsAppChannel`: registra Order (pending) + construye mensaje + devuelve URL `wa.me`.
- `OnlinePaymentChannel` (futuro): registra Order + inicia pasarela + devuelve URL de pago. Misma interfaz, cero cambios en UI/carrito/dominio.

---

## Invariantes globales del dominio

1. Todo dato comercial está acotado por mercado.
2. El dinero se representa con enteros o numeric(12,2) — nunca float (ver `03-DATABASE.md`).
3. Precios y stock son verdad de la BD; el cliente solo muestra snapshots.
4. Ningún borrado físico de entidades con historial comercial (soft delete).
5. Toda entidad tiene `created_at`/`updated_at` (y `deleted_at` donde aplique).