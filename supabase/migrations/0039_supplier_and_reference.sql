-- Incremento 13: de dónde viene el artículo y con qué referencia lo pide el
-- administrador cuando le llega disponibilidad nueva.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La tienda vive de stock externo. Al administrador le llega:
--
--     Proveedor A · ABC-123 · negro M 4 · negro L 0 · blanco M 7
--
-- y hoy el catálogo NO sabe representar ni «Proveedor A» ni «ABC-123». El
-- `sku` es interno (`YI-ES-CSO-PIE-M`: mercado, producto, color, talla) y no
-- tiene ninguna relación con lo que el proveedor escribe, así que no hay dos
-- fuentes de verdad que unificar: falta el dato entero.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DÓNDE VIVE CADA COSA, Y POR QUÉ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `products.supplier`          → de quién viene el ARTÍCULO. Es una propiedad
--                                del producto: sus tallas y colores no vienen
--                                de proveedores distintos.
-- `product_variants.supplier_ref` → la referencia con la que el proveedor
--                                nombra ESA talla y ESE color, que es el nivel
--                                al que llega la disponibilidad.
--
-- Texto libre las dos. NO hay tabla de proveedores, ni CRUD, ni catálogo, ni
-- `market_id` propio: el mercado ya lo pone el producto y duplicarlo sería una
-- segunda copia que puede divergir.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SIN UNIQUE, Y ES UNA DECISIÓN, NO UN OLVIDO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dos productos DISTINTOS pueden ser dos publicaciones del mismo artículo
-- externo, así que pueden compartir proveedor y referencia. Un UNIQUE lo
-- impediría inventando una regla que el negocio no garantiza, y el
-- administrador se encontraría un 23505 al crear algo perfectamente legítimo.
--
-- Lo que sí se garantiza sigue garantizado por lo que ya había: el `sku` es
-- único globalmente y `(product_id, color_id, size_id)` también. La referencia
-- externa NO identifica una variante: la SEÑALA.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LOS LÍMITES QUE SÍ IMPONE POSTGRESQL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Solo dos, y ninguno normaliza el contenido:
--   · NULL o con contenido: una cadena de espacios es «no hay dato» disfrazado
--     de dato, y luego se pinta como un hueco en el panel. Se guarda NULL.
--   · 120 caracteres, el mismo tope que `products.name` ya usa en la
--     aplicación. No es una regla de negocio: es un tope de cordura para que
--     un pegado accidental no entre entero.
--
-- NO se toca la CAJA ni los guiones: `abc-123` se guarda como `abc-123`.
-- Normalizar una referencia ajena es inventarse su formato, y el día que el
-- proveedor distinga mayúsculas el dato deja de servir para buscar.

alter table public.products
  add column if not exists supplier text;

alter table public.products
  drop constraint if exists products_supplier_not_blank;
alter table public.products
  add constraint products_supplier_not_blank
  check (supplier is null or (btrim(supplier) <> '' and length(supplier) <= 120));

comment on column public.products.supplier is
  'Incremento 13. Proveedor o fuente externa del articulo, TEXTO LIBRE. No hay tabla de proveedores a proposito. Sin UNIQUE: dos productos pueden ser dos publicaciones del mismo articulo externo. Dato INTERNO: no se muestra al cliente.';

alter table public.product_variants
  add column if not exists supplier_ref text;

alter table public.product_variants
  drop constraint if exists product_variants_supplier_ref_not_blank;
alter table public.product_variants
  add constraint product_variants_supplier_ref_not_blank
  check (supplier_ref is null or (btrim(supplier_ref) <> '' and length(supplier_ref) <= 120));

comment on column public.product_variants.supplier_ref is
  'Incremento 13. Referencia con la que el proveedor nombra ESTA variante, TEXTO LIBRE y sin normalizar (se guarda tal cual se escribe). Sin UNIQUE: no identifica la variante, la senala; el sku es quien identifica. No viaja al pedido: order_items no la guarda porque no es lo que el cliente compro.';

-- ═══════════════════════════════════════════════════════════════════════════
-- NINGÚN ÍNDICE, Y AQUÍ ESTÁ EL MOTIVO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La búsqueda del panel es `ilike '%texto%'`, sin anclar por la izquierda: un
-- índice btree no puede servirla, ni siquiera con `text_pattern_ops`. Lo que
-- la serviría es GIN con `pg_trgm`, que es una extensión nueva y un índice
-- grande para un catálogo de cuatro productos. Cuando el catálogo justifique
-- medirlo, se mide; añadirlo ahora sería un índice «por si acaso».
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: NADA QUE HACER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las policies son de TABLA, no de columna: `supplier` y `supplier_ref`
-- heredan exactamente las de `products` y `product_variants` (admin + mercado
-- activo, 0020). Un anónimo que lee el escaparate ve las columnas que la
-- consulta pública pide, y `lib/data/products.ts` no las pide.
