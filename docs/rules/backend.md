# Reglas — Backend (Server Actions / lib)

> Obligatorias al escribir lógica de servidor. Contexto: `02-ARCHITECTURE.md`, `06-WHATSAPP.md`.

## Server Actions

1. Toda mutación es una Server Action (`'use server'`) en `app/**/actions.ts` o `lib/**/actions.ts`.
2. Cada action: (1) verifica sesión+rol si es admin, (2) valida/normaliza input, (3) opera, (4) revalida tags, (5) devuelve resultado tipado — nunca throw genérico hacia el cliente.
3. Validación manual con TypeScript (tipos + guards). Sin zod hasta justificarlo (regla dependencias).
4. Errores de negocio como union types (`CheckoutResult.error`), no strings sueltos.

## Acceso a datos

5. Lecturas solo vía funciones de `lib/data/*`; firmas explícitas con tipos de retorno. Las de `lib/data/admin/*` empiezan SIEMPRE por `requireAdmin()`: el guard del layout no impide que la página hermana se renderice en RSC (DEC-034).
6. Toda función de data recibe o resuelve el mercado activo internamente.
7. Queries específicas por caso de uso (select mínimo de columnas que la UI necesita); prohibido `select *` en rutas públicas.
8. Operaciones multi-paso críticas (crear pedido) deben ser transaccionales o compensables; documentar el patrón usado.

## Concurrencia y stock

9. Decrementos de stock SIEMPRE con guard atómico (`WHERE stock >= qty` + verificación de filas afectadas).
10. Snapshots en pedidos: nunca depender de datos vivos para histórico.

## Caché e invalidación

11. Tags válidos: `catalog`, `home`, `settings`, `orders`. Nuevos tags = registro en docs. **Todavía sin implementar**: el data layer no usa `fetch` con `next.tags`, así que hoy no hay etiquetas que invalidar.
12. Next 16: `revalidateTag(tag, 'max')` exige segundo argumento; `updateTag(tag)` da read-your-writes. **Lo que se usa hoy es `revalidatePath`, con la matriz de DEC-041** documentada en la cabecera de `lib/admin/revalidate.ts`:
    - Un producto → `revalidatePath('/producto/<slug>')` + `'/'` + `'/sitemap.xml'`. Toda action que cambie un producto necesita su `slug`; si el slug puede cambiar hay que invalidar también el anterior.
    - Algo global (categorías, ajustes) → `revalidatePath('/', 'layout')` + sitemap. Invalida el layout de la tienda y todas las páginas por debajo, que es lo que hace falta porque el menú de categorías lo pintan todas.
    - Pedido cancelado → los slugs REALES de sus líneas, uno a uno.
    - **PROHIBIDO `revalidatePath` con un patrón `[segmento]`** (DEC-037): no invalida lo prerenderizado. Hay un test que recorre `app/`, `lib/` y `components/` y falla si alguien lo reintroduce.
    - Toda mutación que cambie el conjunto de productos publicados invalida `'/sitemap.xml'`: es un Route Handler cacheado, y sin eso un producto retirado sigue anunciado a Google aunque su ficha ya dé 404.
13. Una action de admin re-valida SIEMPRE con `requireAdmin()`, aunque el layout ya lo haya hecho: una Server Function es un POST a su ruta y un cambio de `matcher` puede sacarla del proxy sin que nada falle a la vista. Y actualiza **columnas concretas**, nunca un objeto que venga del cliente (`market_id`, ids, `sku`, `color_id`, `size_id` no son editables).

## WhatsApp / checkout

14. La UI consume `getCheckoutChannel()`; prohibido importar `WhatsAppChannel` directamente desde componentes.
15. El builder de mensajes (`buildOrderMessage`) es función pura sin I/O.
16. Número de WhatsApp: siempre leído de settings del mercado activo.

## Rendimiento del data layer

19. **PostgREST devuelve como MUCHO 1000 filas** aunque no se pida límite. Medido en la Fase 9.5 con 5.000 pedidos: `select(...)` sin `range()` devolvía 1000 y el conteo hecho en JavaScript salía **silenciosamente mal**. Corolario: cualquier agregado (contar, sumar, máximo) se resuelve en PostgreSQL —función `SECURITY INVOKER` o `count: "exact"`—, nunca recorriendo filas descargadas.
20. Todo listado del panel pagina con `range()` + `count: "exact"`. Sin excepciones: un listado sin límite es un fallo esperando al primer cliente con volumen.
21. Filtro que PostgreSQL sepa expresar, se resuelve en PostgreSQL. Si PostgREST no puede —comparar dos columnas de la misma fila, por ejemplo—, la salida correcta es una **columna generada** (`product_images.is_low_stock`, migración 0024), no traerse un superconjunto y filtrar en memoria.
22. Índices: solo con una consulta real que los pida y, cuando sea razonable, con `EXPLAIN (ANALYZE, BUFFERS)` sobre volumen suficiente. Un índice que el planificador no elige es coste de escritura a cambio de nada — pasó con `orders(market_id, created_at desc)`, propuesto y descartado por medición.

## Escrituras concurrentes

23. **Una suma se envía como suma.** Reponer stock manda el DELTA y PostgreSQL hace `stock = stock + delta` dentro de la transacción. Calcular el resultado en TypeScript y escribir un valor absoluto reintroduce la pérdida de actualizaciones — medido en la Fase 9.5: stock 12, dos reposiciones de +10 y +7 a la vez, resultado **19**.
24. **Un valor absoluto necesita testigo.** Corregir stock o precio envía el `updated_at` que se leyó y el `UPDATE` lo exige (`.eq("updated_at", ...)`). Cero filas con testigo = CONFLICTO, no "no existe": hay que avisar, nunca pisar. El testigo lo mantiene el trigger `set_updated_at`, que es `BEFORE UPDATE` y por tanto **no se puede falsificar ni con service role**.
25. **Deshabilitar un botón no es una protección.** Todo lo que pueda ejecutarse dos veces —doble clic, F5 con reenvío, POST directo— debe quedar cubierto por la BD: bloqueo de fila, validación contra el estado real o suma atómica.
26. **Una escritura en lote revalida cada id contra el mercado del servidor, dentro de la transacción**, y falla entera si uno no pertenece. Las policies de admin exigen mercado ACTIVO, no mercado CONCRETO: sin esta revalidación, un id de otro mercado colado en el formulario pasaría.

## Errores y logs

17. Logs de servidor con contexto (action, ids, mercado) pero SIN datos sensibles (teléfonos completos, claves).
18. Fallos inesperados → error genérico al cliente + log detallado servidor.
## Notas internas del pedido (Fase 9.5, 5A)

27. **Nunca reutilices `order_events` para nada que no sea una transición real de estado.** Su policy de INSERT no valida `from_status`/`to_status`, así que cualquier camino de escritura nuevo permite fabricar historial falso. Las notas van en `order_notes` (DEC-050).
28. **La autoría se pone en la base, no en la Server Action**: `DEFAULT auth.uid()` + `with check (actor_id = auth.uid())`. Un formulario no firma nada.
29. **Un pedido se identifica por NÚMERO en las actions, no por uuid.** Resolverlo obliga a pasar por el filtro `market_id` del servidor; aceptar un id se saltaría el aislamiento de mercado.
30. **`btrim(col)` con un solo argumento solo quita espacios**, no `\t` ni `\n`. Para "no está en blanco" usa `col ~ '\S'` (DEC-051).
31. **`orders.shipping_address` y `orders.notes` no se usan y no se empiezan a usar** sin una decisión de negocio: el checkout no captura dirección (DEC-049).

## Publicación de productos (Fase 9.5, 5B)

32. **PUBLICABLE ≠ VENDIBLE.** Publicable = alguna variante activa (sin eso la ficha da 404). Vendible = alguna variante activa **con stock** (sin eso muestra "Agotado", que es intencionado). No los mezcles en un solo booleano (DEC-052).
33. **Toda consulta pública que liste productos debe exigir variante activa**, no solo `status='active'`. El sitemap y `generateStaticParams` no lo hacían y anunciaban 404 a Google (DEC-053).
34. **No escondas un producto agotado.** Ocultarlo es una decisión de negocio que nadie ha tomado; el escaparate ya lo trata a propósito.
35. **La barrera de publicación es un trigger, no la Server Action**, y solo vigila la ENTRADA en `active`: revalidar en cada update deja sin poder editar los productos ya rotos (DEC-054).
36. **Un CONSTRAINT TRIGGER `deferrable initially deferred` juzga el estado al COMMIT**, así que permite producto+variantes en una transacción y rechaza el estado roto entre peticiones. Úsalo cuando la regla abarque varias tablas.
37. **La limpieza de fixtures va en `finally` o en `after`**, nunca suelta al final del test: un fallo intermedio deja basura en la base.

## Auditoría administrativa (Fase 9.5, 5C)

38. **Audita DECISIONES, no cambios de valor.** Una venta cambia el stock y no es una decisión administrativa: la cubren el pedido, sus líneas y su `order_event` (DEC-055).
39. **El discriminante es `auth.uid()`**, no una marca en el código: el checkout es anónimo, así que la venta se excluye sola. Un cambio con service_role tampoco se audita, y por eso los tests deben usar el token de admin.
40. **Nunca crees una policy de INSERT en una tabla de auditoría.** El trigger es `SECURITY DEFINER` y el dueño de la tabla no está sujeto a RLS: no hace falta policy de escritura (DEC-056).
41. **`AFTER UPDATE` con `OLD`/`NEW`**, nunca un log escrito desde la aplicación: bajo concurrencia, la aplicación registraría el valor que creía escribir (DEC-058).
42. **`is distinct from`, jamás `<>`**, al comparar columnas que pueden ser NULL: con `<>` el borrado lógico no se registraría nunca.
43. **`Number(null)` es 0, no `NaN`.** Al formatear un valor de auditoría, comprueba el nulo aparte o pintarás "0 → 0" como si fuera un dato real.
44. **El origen del cambio se lee de `current_setting('request.path', true)`**, que PostgREST fija por petición (DEC-057).
