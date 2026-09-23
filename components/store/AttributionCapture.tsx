"use client";

import { useEffect } from "react";
import {
  ATTRIBUTION_STORAGE_KEY,
  parseAttributionFromSearch,
} from "@/lib/attribution/attribution";

/**
 * Captura de atribución en la landing (Incremento 14).
 *
 * No pinta nada: monta un efecto, mira la query de entrada y, si trae campaña,
 * la guarda. Punto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ `window.location.search` Y NO `useSearchParams()`
 * ─────────────────────────────────────────────────────────────────────────
 * `useSearchParams()` marca el árbol como dependiente de la petición y
 * obligaría a envolverlo en `<Suspense>` y a renderizar dinámicamente la parte
 * que lo use. La tienda es SSG + ISR de 5 minutos por diseño (DEC-004,
 * DEC-021) y **los UTM no deben convertirla en dinámica**: son un dato del
 * navegador, no del documento. Leyendo `window.location.search` dentro de un
 * `useEffect` el HTML servido es exactamente el mismo con y sin parámetros —
 * la misma página cacheada sirve a todas las campañas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FIRST TOUCH: SE ESCRIBE UNA VEZ
 * ─────────────────────────────────────────────────────────────────────────
 * Si ya hay algo guardado en esta sesión, NO se toca. La primera campaña es la
 * que trajo a la persona, y es la que se lleva el pedido.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO PUEDE ROMPER NADA
 * ─────────────────────────────────────────────────────────────────────────
 * Todo va dentro de `try/catch`: en navegación privada, con el almacenamiento
 * bloqueado o en un navegador que lance al tocar `sessionStorage`, esto no
 * hace nada y la tienda sigue igual. La atribución es un extra, la compra no.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      // Ya hay una primera campaña en esta sesión: no se pisa.
      if (window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY) !== null) return;

      const attribution = parseAttributionFromSearch(
        window.location.search,
        window.location.pathname,
      );
      if (attribution === null) return;

      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Sin almacenamiento no hay atribución, y no pasa nada más.
    }
    // Sin dependencias: interesa la ENTRADA a la tienda. Las navegaciones
    // internas no llevan UTMs, y si alguien vuelve a entrar desde otro anuncio
    // eso es una carga de página nueva, que sí vuelve a ejecutar esto.
  }, []);

  return null;
}
