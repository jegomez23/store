"use client";

import { useId } from "react";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  /** Descripción del ítem, para construir labels accesibles con contexto. */
  itemLabel: string;
  onChange: (quantity: number) => void;
  className?: string;
}

/**
 * Stepper de cantidad genérico (docs/04-UX-UI.md §3). Componente puro de UI:
 * no conoce el carrito — recibe valor y límites por props y emite `onChange`.
 *
 * Es `'use client'` por la interacción, pero no importa nada de negocio, así
 * que cumple la regla de `components/ui/*` puro (docs/rules/architecture.md #3).
 */
export function QuantityStepper({
  value,
  min = 1,
  max,
  itemLabel,
  onChange,
  className = "",
}: QuantityStepperProps) {
  const inputId = useId();
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Label real asociado al input: los lectores de pantalla anuncian de
          qué producto es esta cantidad, no solo "cantidad". */}
      <label htmlFor={inputId} className="sr-only">
        Cantidad de {itemLabel}
      </label>

      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={!canDecrease}
        aria-label={`Quitar una unidad de ${itemLabel}`}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:border-line"
      >
        <MinusIcon width={16} height={16} />
      </button>

      {/* `readOnly` + `inputMode`: el valor se cambia con los botones, pero se
          expone como input para que la cantidad sea legible por lectores de
          pantalla y quede asociada a su label. */}
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        readOnly
        value={value}
        aria-live="polite"
        className="h-11 w-12 rounded-md border border-line bg-white text-center text-sm font-medium text-black"
      />

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={!canIncrease}
        aria-label={`Añadir una unidad de ${itemLabel}`}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:border-line"
      >
        <PlusIcon width={16} height={16} />
      </button>
    </div>
  );
}
