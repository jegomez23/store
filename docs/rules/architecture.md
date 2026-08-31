# Reglas — Arquitectura

> Obligatorias al modificar estructura o flujo entre capas. Contexto completo: `02-ARCHITECTURE.md`.

## Capas y dependencias

1. Dirección de dependencias única: `app/* → components/* → lib/* → supabase`. Jamás en sentido inverso ni saltando capas.
2. `app/` nunca importa clientes de Supabase directamente: usa `lib/data/*` (lectura) o Server Actions (escritura).
3. `components/ui/*` es puro: sin imports de negocio, de Supabase ni de lib/data. Solo props + tokens.
4. Lógica reutilizable vive en `lib/` como funciones puras cuando sea posible (testeable sin React).
5. Prohibida la duplicación: antes de crear algo, buscar si existe (`lib/data`, `components/ui`).

## Organización

6. Un módulo por dominio en `lib/data/`: `products.ts`, `categories.ts`, `settings.ts`, `orders.ts`… no un archivo gigante.
7. Tipos compartidos viven en `types/`; los tipos derivados del esquema se generan/actualizan desde la BD, nunca se re-declaran a mano en componentes.
8. Rutas nuevas siguen el mapa de `02-ARCHITECTURE.md` §2; route group `(store)` para público, `/admin` para panel.
9. Alias: siempre `@/...`, nunca rutas relativas largas (`../../../`).

## Renderizado y caché

10. Server Components por defecto. `'use client'` solo con interactividad real (estado, eventos, browser APIs).
11. Estrategia por ruta según tabla de `02-ARCHITECTURE.md` §3. Cambiarla requiere justificación + doc.
12. Invalidación: tags `catalog | home | settings | orders`. En Next 16: `revalidateTag(tag, 'max')` o `updateTag(tag)` dentro de Server Actions.
13. Sin Cache Components (`use cache`) en v1 (DEC-004).

## Datos

14. Toda query filtra por mercado activo — implícito vía helpers de `lib/data`, nunca manual disperso.
15. Dinero: siempre a través de `lib/money/`; prohibido formatear con `toFixed` suelto o concatenar símbolos.
16. Mutaciones SOLO en Server Actions (`'use server'`), nunca en Route Handlers para CRUD interno.

## Cambios estructurales

17. Crear/eliminar carpetas de primer nivel o cambiar el flujo entre capas = decisión arquitectónica → registrar en DECISIONS.md ANTES de implementar.