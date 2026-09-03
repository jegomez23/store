-- Fase 9.5 — Incremento 2: "bajo de stock" pasa a ser un hecho de la fila.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE ESTA MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La condición operativa es `stock <= low_stock_threshold`: compara DOS
-- COLUMNAS de la misma fila. PostgREST no sabe expresar eso — el lado derecho
-- de un filtro tiene que ser un literal. Las salidas posibles eran tres:
--
--   (a) Traerse un superconjunto y filtrar en JavaScript. Es exactamente el
--       patrón que este incremento viene a eliminar, y encima aproximado: para
--       acotar el superconjunto haría falta conocer el umbral máximo.
--
--   (b) Una función SQL que devuelva la tabla ya filtrada. Correcto, pero
--       cierra la puerta a componer filtros y paginación desde el data layer,
--       que es justo lo que necesita la pantalla de inventario.
--
--   (c) Una columna GENERADA. PostgreSQL calcula el hecho y lo mantiene
--       siempre coherente; PostgREST filtra por ella con el toolkit normal
--       (`.eq()`, `.range()`, `.order()`).
--
-- Se elige (c). Además de resolver el problema técnico, coloca la regla de
-- negocio donde el proyecto ya decidió que viven las reglas: en la base, no
-- duplicada en TypeScript.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURIDAD Y RIESGO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- * Columna DERIVADA: no se puede escribir ni desde el panel ni desde una
--   petición manipulada. PostgreSQL rechaza cualquier INSERT o UPDATE que
--   intente asignarle un valor. No hay forma de mentir sobre si algo está bajo
--   de stock.
-- * Sin policies nuevas: es una columna más de `product_variants`, cubierta por
--   las policies existentes (lectura pública de variantes de producto visible,
--   escritura de admin en mercado activo).
-- * `stored` REESCRIBE LA TABLA al aplicarse. Con las 9 variantes actuales es
--   instantáneo; se deja anotado porque en una tabla grande no lo sería.
-- * No cambia ningún dato existente: el valor se deriva de lo que ya hay.

alter table public.product_variants
  add column if not exists is_low_stock boolean
  generated always as (stock <= low_stock_threshold) stored;

comment on column public.product_variants.is_low_stock is
  'DERIVADA (stock <= low_stock_threshold). La calcula PostgreSQL: no se puede escribir. Existe porque PostgREST no compara dos columnas entre si.';

-- Índice parcial: solo indexa las filas que están bajo umbral, que son pocas y
-- son justo las que se consultan. Un índice completo sobre un booleano casi
-- siempre falso no lo elegiría el planificador.
create index if not exists idx_product_variants_low_stock
  on public.product_variants (product_id)
  where is_low_stock and is_active;
