-- Incremento 16: `supplier` y `supplier_ref` dejan de ser legibles por `anon`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE SE MIDIÓ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El incremento 13 verificó que la ficha pública **no pinta** el proveedor ni
-- la referencia externa, y sigue siendo cierto (re-verificado en el E2E de
-- este incremento sobre el build servido). Pero «no se pinta» no es «no se
-- puede leer». Con la anon key —que viaja en el navegador de cualquiera—:
--
--     GET /rest/v1/products?select=supplier               → 200
--     GET /rest/v1/product_variants?select=supplier_ref   → 200
--
-- Hoy las dos columnas están a NULL en todo el catálogo, así que no hay fuga
-- de datos: hay una PUERTA. En cuanto el administrador escriba de quién se
-- surte y con qué referencia —que es exactamente para lo que se crearon en la
-- 0039—, esa información queda disponible para cualquiera que sepa pedirla.
--
-- Y no es un dato cosmético: es de dónde saca la tienda lo que vende. El
-- propio CLAUDE.md lo dice para el campo hermano que se decidió NO crear: «la
-- condición de réplica es interna y no debe poder llegar al cliente».
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ GRANTs POR COLUMNA Y NO UNA POLICY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RLS decide QUÉ FILAS se ven, no qué columnas: no sabe expresar esto. El
-- mecanismo correcto es el mismo que la 0041 estrenó para `settings`: revocar
-- el SELECT de tabla a `anon` y concedérselo columna a columna.
--
-- Efecto secundario deseado, igual que allí: **una columna nueva de `products`
-- o de `product_variants` nace PRIVADA**. Si algún día tiene que ser pública,
-- hay que decirlo aquí a propósito.
--
-- ⚠️ LAS COLUMNAS DE FILTRO TAMBIÉN SE CONCEDEN. PostgreSQL exige privilegio
-- de SELECT sobre toda columna que aparezca en un WHERE, no solo en la lista
-- de salida. El data layer público filtra por `market_id`, `status`,
-- `deleted_at`, `slug` y `is_active`, así que sin ellas el escaparate entero
-- daría 401.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ NO CAMBIA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- · Las policies de RLS de `products` y `product_variants`: intactas.
-- · `authenticated`: conserva la lectura completa. El panel necesita las dos
--   columnas y hoy el único autenticado posible es un administrador (DEC-011).
-- · `create_order`: es `security definer` (0035/0040), así que se ejecuta con
--   los privilegios del propietario y no depende de estos GRANTs.
-- · La escritura: ya estaba limitada al admin.

revoke select on public.products from anon;

grant select (
  id,
  market_id,
  category_id,
  name,
  slug,
  short_description,
  description,
  materials,
  care_instructions,
  shipping_info_override,
  status,
  is_featured,
  is_new,
  meta_title,
  meta_description,
  created_at,
  updated_at,
  deleted_at
) on public.products to anon;

revoke select on public.product_variants from anon;

grant select (
  id,
  product_id,
  color_id,
  size_id,
  sku,
  price,
  compare_at_price,
  stock,
  low_stock_threshold,
  is_active,
  created_at,
  updated_at,
  is_low_stock
) on public.product_variants to anon;

comment on column public.products.supplier is
  'De quien se surte la tienda este producto (0039). PRIVADA desde la 0044: anon no tiene GRANT de lectura. Texto libre, sin UNIQUE y sin normalizar.';

comment on column public.product_variants.supplier_ref is
  'Referencia externa de esta variante en el proveedor (0039). PRIVADA desde la 0044: anon no tiene GRANT de lectura. Se guarda tal cual la escribe el proveedor.';
