# Reglas — Base de datos (PostgreSQL / Supabase)

> Obligatorias al tocar el esquema. Contexto: `03-DATABASE.md`, `08-SECURITY.md`.

## Migraciones

1. Cambios de esquema SOLO vía archivos SQL en `supabase/migrations/` con nombre secuencial descriptivo (`0002_add_x.sql`). Prohibido modificar tablas "en caliente" desde el dashboard sin migración equivalente.
2. Toda migración debe aplicar limpiamente sobre un proyecto fresco (reproducibilidad).
3. Migración destructiva (drop column/table, cambio de tipo) = decisión registrada + confirmación humana previa.

## Convenciones de esquema

4. snake_case · PK uuid default `gen_random_uuid()` · FKs explícitas con ON DELETE adecuado.
5. `created_at`/`updated_at` timestamptz en toda tabla (+ `deleted_at` donde aplique soft delete).
6. Dinero `numeric(12,2)`; nunca float/real.
7. Enums como text + CHECK constraint (más fácil de evolucionar que tipos enum nativos).
8. Índices: todo FK; índices parciales para consultas públicas frecuentes (patrón en 03-DATABASE §2.6).

## RLS (innegociable — DEC-009)

9. Toda tabla nueva nace con `ENABLE ROW LEVEL SECURITY` y sus policies EN LA MISMA migración.
10. Patrón estándar: SELECT público restringido a registros publicados/activos + policy admin vía `is_admin()`.
11. Tablas privadas (`orders`, `order_items`, `order_events`, `customers`): SIN select público, sin excepciones.
12. Probar siempre las policies con ambos roles (anon y admin) antes de dar la migración por terminada.
13. Si la tabla tiene `market_id` y lectura pública, la policy debe incluir `public.is_active_market(market_id)` (DEC-022): un mercado inactivo no expone su catálogo. **Y si además es de catálogo o contenido, su policy de ADMIN debe llevar la misma condición en `USING` y `WITH CHECK`** (DEC-035): sin eso, un CRUD administrativo puede escribir en un mercado que no está lanzado. Excepción: las tablas de pedidos y clientes, que son historial y deben seguir siendo gestionables.
14. Toda tabla nueva de `public` debe repetir `revoke truncate, trigger on <tabla> from anon, authenticated` en su propia migración (DEC-023): RLS no filtra esos dos privilegios.

## Datos

15. Seed inicial (`supabase/seed/`) para mercados, colores, tallas. Datos comerciales reales entran por admin, no por seed.
16. Sin datos inventados en commits: placeholders marcados `[PENDIENTE]`.
17. Cambios de esquema → actualizar `03-DATABASE.md` y `DOMAIN-MODEL.md` si afecta conceptos, en la misma tarea.
18. El seed debe ser **idempotente**: reejecutarlo entero no puede fallar ni duplicar filas (`on conflict do nothing` donde haya constraint; `insert ... select ... where not exists` donde no la haya). Validado en Fase 4.5 reejecutando los 6 archivos contra el proyecto real.
18.1. Las imágenes se guardan **una sola vez por foto**, ya recomprimidas a WebP por el servidor (DEC-036). Prohibido guardar derivados por tamaño en Storage: las variantes responsive las genera `next/image`. Y prohibido fiarse del MIME que declara el cliente o del `allowed_mime_types` del bucket: validar por magic bytes.
19. Las rutas de imagen guardadas en BD (`product_images.url`, `categories.image_url`, ...) son **relativas al bucket**, sin repetir su nombre: `getPublicUrl()` ya antepone el bucket. Guardar `products/x.jpg` en el bucket `products` produce una URL rota `.../products/products/x.jpg` (bug real corregido en Fase 4.5).

## Cliente Supabase

20. Service role SOLO dentro de `lib/supabase/admin.ts` con `import 'server-only'`. Prohibido en componentes, actions de cliente o cualquier bundle cliente.
21. El cliente browser/anon jamás ejecuta escrituras: las escrituras pasan por Server Actions (que usan cliente autenticado o service role según corresponda).