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

## Datos

13. Seed inicial (`supabase/seed/`) para mercados, colores, tallas. Datos comerciales reales entran por admin, no por seed.
14. Sin datos inventados en commits: placeholders marcados `[PENDIENTE]`.
15. Cambios de esquema → actualizar `03-DATABASE.md` y `DOMAIN-MODEL.md` si afecta conceptos, en la misma tarea.

## Cliente Supabase

16. Service role SOLO dentro de `lib/supabase/admin.ts` con `import 'server-only'`. Prohibido en componentes, actions de cliente o cualquier bundle cliente.
17. El cliente browser/anon jamás ejecuta escrituras: las escrituras pasan por Server Actions (que usan cliente autenticado o service role según corresponda).