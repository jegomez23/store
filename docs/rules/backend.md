# Reglas — Backend (Server Actions / lib)

> Obligatorias al escribir lógica de servidor. Contexto: `02-ARCHITECTURE.md`, `06-WHATSAPP.md`.

## Server Actions

1. Toda mutación es una Server Action (`'use server'`) en `app/**/actions.ts` o `lib/**/actions.ts`.
2. Cada action: (1) verifica sesión+rol si es admin, (2) valida/normaliza input, (3) opera, (4) revalida tags, (5) devuelve resultado tipado — nunca throw genérico hacia el cliente.
3. Validación manual con TypeScript (tipos + guards). Sin zod hasta justificarlo (regla dependencias).
4. Errores de negocio como union types (`CheckoutResult.error`), no strings sueltos.

## Acceso a datos

5. Lecturas solo vía funciones de `lib/data/*`; firmas explícitas con tipos de retorno.
6. Toda función de data recibe o resuelve el mercado activo internamente.
7. Queries específicas por caso de uso (select mínimo de columnas que la UI necesita); prohibido `select *` en rutas públicas.
8. Operaciones multi-paso críticas (crear pedido) deben ser transaccionales o compensables; documentar el patrón usado.

## Concurrencia y stock

9. Decrementos de stock SIEMPRE con guard atómico (`WHERE stock >= qty` + verificación de filas afectadas).
10. Snapshots en pedidos: nunca depender de datos vivos para histórico.

## Caché e invalidación

11. Tags válidos: `catalog`, `home`, `settings`, `orders`. Nuevos tags = registro en docs.
12. Next 16: `revalidateTag(tag, 'max')` para stale-while-revalidate; `updateTag(tag)` cuando el usuario debe ver su cambio al instante; `refresh()` para refrescar router tras action.

## WhatsApp / checkout

13. La UI consume `getCheckoutChannel()`; prohibido importar `WhatsAppChannel` directamente desde componentes.
14. El builder de mensajes (`buildOrderMessage`) es función pura sin I/O.
15. Número de WhatsApp: siempre leído de settings del mercado activo.

## Errores y logs

16. Logs de servidor con contexto (action, ids, mercado) pero SIN datos sensibles (teléfonos completos, claves).
17. Fallos inesperados → error genérico al cliente + log detallado servidor.