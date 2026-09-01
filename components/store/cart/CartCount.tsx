"use client";

import { useCart } from "@/lib/cart/context";

/**
 * Contador del carrito (Fase 5).
 *
 * SIGNIFICADO: cuenta UNIDADES totales, no líneas — 2 camisetas + 1 sudadera
 * muestra "3". Es lo que el usuario espera del número junto al icono.
 *
 * Devuelve `null` cuando no hay nada: así el icono queda limpio y no aparece
 * un "0" durante el render del servidor (el carrito siempre nace vacío en SSR
 * y se restaura tras hidratar).
 */
export function useCartUnitCount(): number {
  return useCart().totals.totalUnits;
}

interface CartCountBadgeProps {
  /** Posicionamiento del badge respecto al icono contenedor. */
  className?: string;
}

export function CartCountBadge({ className = "" }: CartCountBadgeProps) {
  const count = useCartUnitCount();
  if (count === 0) return null;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none flex min-w-5 items-center justify-center rounded-full bg-red px-1.5 text-[10px] font-semibold leading-4 text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Texto accesible del enlace al carrito, con el número de unidades. */
export function useCartLinkLabel(): string {
  const count = useCartUnitCount();
  // TODO(i18n): mover a lib/i18n/messages.ts cuando exista (DEC-013).
  if (count === 0) return "Carrito, vacío";
  return count === 1 ? "Carrito, 1 unidad" : `Carrito, ${count} unidades`;
}
