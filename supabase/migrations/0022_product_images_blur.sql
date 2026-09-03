-- Fase 9 — placeholder blur de las imágenes de producto.
--
-- CONTEXTO: `docs/09-SEO-PERFORMANCE.md` §57 da por hecho que el admin guarda
-- un `blurDataURL` en la subida. La columna no existía: Fase 8 lo dejó anotado
-- como deuda y esta migración la crea. Es la ÚNICA migración de la fase.
--
-- SEGURIDAD DEL DATO: el valor solo puede generarlo el servidor con `sharp`
-- durante la subida (`lib/storage/product-images.ts`). Nunca se acepta un blur
-- enviado por el navegador: sería una vía para inyectar un data URI arbitrario
-- que el navegador de otro usuario acabaría decodificando. El CHECK de abajo lo
-- impone en la BD, no solo en TypeScript — si algún día una action se olvidara
-- de validar, PostgreSQL rechaza igualmente cualquier cosa que no sea un WebP
-- en base64 de tamaño de placeholder.
--
-- SEGURIDAD DE LA MIGRACIÓN: `add column` de una columna NULLABLE y sin default
-- no reescribe la tabla ni toca ninguna fila existente. No se reprocesa ninguna
-- imagen ya subida: las filas actuales quedan con `blur_data_url IS NULL` y
-- `next/image` simplemente no pinta placeholder, exactamente como hasta ahora.
-- El backfill de las imágenes ya existentes queda PENDIENTE y declarado en
-- `docs/context/CURRENT-STATE.md`: requiere descargar cada objeto del bucket y
-- reprocesarlo, que es una operación externa, no una migración SQL.
--
-- RLS: no hace falta ninguna policy nueva. Las policies de `product_images`
-- (migraciones 0007 y 0020) son de tabla, así que cubren la columna nueva:
-- lectura pública del catálogo publicado, escritura solo para admin de un
-- mercado activo.

alter table public.product_images
  add column if not exists blur_data_url text;

-- Data URI de un WebP en base64 y con tamaño de placeholder (no de imagen).
-- 4000 caracteres son ~3 KB: de sobra para 16px de ancho y muy lejos de poder
-- colar una imagen real en la columna.
alter table public.product_images
  drop constraint if exists product_images_blur_data_url_check;

alter table public.product_images
  add constraint product_images_blur_data_url_check
  check (
    blur_data_url is null
    or (
      blur_data_url like 'data:image/webp;base64,%'
      and length(blur_data_url) between 32 and 4000
    )
  );

comment on column public.product_images.blur_data_url is
  'Placeholder blur (data URI WebP base64) generado en servidor con sharp durante la subida. NUNCA se acepta del cliente. NULL = sin placeholder (imágenes anteriores a la Fase 9).';
