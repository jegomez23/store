import { cache } from "react";

/**
 * Instante de referencia de la petición (Fase 9.5, Incremento 3).
 *
 * POR QUÉ EXISTE, EN VEZ DE LLAMAR A `Date.now()` DONDE HAGA FALTA:
 *
 * 1. **Pureza del render.** Leer el reloj mientras se renderiza es impuro y la
 *    regla `react-hooks/purity` lo rechaza, con razón: el mismo árbol
 *    renderizado dos veces daría resultados distintos.
 *
 * 2. **Coherencia de la pantalla.** `cache()` memoiza por petición, así que
 *    todos los cálculos de antigüedad de un mismo render se miden contra EL
 *    MISMO instante. Sin esto, una lista larga podría decir "hace 2 h" en una
 *    fila y "hace 3 h" en la siguiente solo por haber cruzado un minuto a
 *    mitad del renderizado.
 *
 * No se cachea entre peticiones: `cache()` vive dentro de una sola. El panel es
 * `force-dynamic`, así que cada visita obtiene la hora real.
 *
 * NO es un módulo puro: importa de `react` y lee el reloj. No se testea con
 * `node --test`; lo que sí se testea es `lib/admin/age.ts`, que recibe el
 * instante como argumento.
 */
export const requestNow = cache((): number => Date.now());
