# Reglas — Testing

> La suite formal (runner instalado, CI ejecutándola) llega en Fase 9. **Regla vigente desde Fase 1:** cada funcionalidad que introduzca lógica crítica incorpora sus tests correspondientes en la misma fase en que se construye — no se difieren a Fase 9. Aplica especialmente a `lib/money`, `lib/cart`, el builder de mensajes de WhatsApp, promociones, cálculo de precios, stock y pedidos. Fase 9 consolida runner + integración + E2E, no "empieza a testear".

## Qué se testea (prioridad)

1. **Lógica pura de `lib/`** — obligatoria y testeable sin framework pesado:
   - `lib/money/` (formateo COP/EUR, redondeos).
   - `lib/cart/` reducer (añadir/quitar/cantidades/topes).
   - `lib/checkout/` builder de mensajes WhatsApp (`buildOrderMessage`) — salida exacta a plantilla.
   - Utilidades: slugify, validaciones de input, cálculo de promociones.
2. **Server Actions críticas** — integración contra BD dev: generar pedido (stock, snapshot, customer upsert), cambio de estado con evento.
3. **E2E mínimo** — compra feliz por WhatsApp + login admin + crear producto visible en tienda.

## Qué NO se testea

- Componentes visuales puros sin lógica (se validan visualmente).
- Configuración de framework.

## Convenciones

4. Archivos co-ubicados o en `__tests__/` junto al módulo (`buildOrderMessage.test.ts`).
5. Nombres que describan comportamiento: "aplica la promoción más favorable" no "test promo 3".
6. Sin mocks frágiles de Supabase en unitarios: la lógica pura no debe depender del cliente BD (razón para regla 1).
7. Fixtures de datos de prueba compartidos; sin datos comerciales reales inventados.

## Ejecución

8. Comando futuro: `npm test` (definir script al instalar runner en Fase 9).
9. Toda corrección de bug incluye primero un test que lo reproduce (cuando exista suite).
10. CI local mínima de cada tarea: `npm run lint && npx tsc --noEmit && npm test` (este último cuando exista).

## Estado actual

⬜ Sin runner instalado (Fase 0). Instalación prevista únicamente en Fase 9 con decisión registrada.