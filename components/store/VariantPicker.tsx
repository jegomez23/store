"use client";

import { useMemo } from "react";
import type { ProductVariantOption } from "@/lib/data/products";

interface VariantPickerProps {
  variants: ProductVariantOption[];
  selectedColor: string | null;
  selectedSize: string | null;
  onColorChange: (colorName: string) => void;
  onSizeChange: (sizeLabel: string) => void;
  /** Id para asociar un mensaje de error con el grupo de tallas (a11y). */
  sizeErrorId?: string;
  /** Mensaje inline cuando falta elegir talla. */
  sizeError?: string | null;
}

/**
 * Selección visual de color/talla sobre variantes reales.
 *
 * Fase 5: pasa a ser un componente CONTROLADO. La resolución
 * (color + talla) → variante concreta vive en `AddToCartForm`, que es quien
 * necesita el `variantId` real: la identidad de una línea de carrito es la
 * variante, nunca el nombre/color/talla.
 */
export function VariantPicker({
  variants,
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
  sizeErrorId,
  sizeError,
}: VariantPickerProps) {
  const colors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of variants) {
      if (v.colorName && !seen.has(v.colorName)) {
        seen.set(v.colorName, v.colorHex ?? "#9c9890");
      }
    }
    return [...seen.entries()].map(([name, hex]) => ({ name, hex }));
  }, [variants]);

  const sizes = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of variants) {
      if (v.sizeLabel && !seen.has(v.sizeLabel)) {
        seen.add(v.sizeLabel);
        list.push(v.sizeLabel);
      }
    }
    return list;
  }, [variants]);

  function isSizeAvailable(sizeLabel: string): boolean {
    return variants.some(
      (v) =>
        v.sizeLabel === sizeLabel &&
        v.stock > 0 &&
        (!selectedColor || v.colorName === selectedColor),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {colors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span id="variant-color-label" className="text-sm font-medium text-black">
            Color{selectedColor ? `: ${selectedColor}` : ""}
          </span>
          <div
            role="group"
            aria-labelledby="variant-color-label"
            className="flex gap-2"
          >
            {colors.map((color) => {
              const isActive = color.name === selectedColor;
              return (
                <button
                  key={color.name}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={color.name}
                  onClick={() => onColorChange(color.name)}
                  className={`h-11 w-11 rounded-full border-2 transition-colors ${
                    isActive ? "border-red" : "border-line hover:border-black"
                  }`}
                  style={{ backgroundColor: color.hex }}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {sizes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span id="variant-size-label" className="text-sm font-medium text-black">
            Talla{selectedSize ? `: ${selectedSize}` : ""}
          </span>
          <div
            role="group"
            aria-labelledby="variant-size-label"
            aria-describedby={sizeError ? sizeErrorId : undefined}
            className="flex flex-wrap gap-2"
          >
            {sizes.map((sizeLabel) => {
              const isActive = sizeLabel === selectedSize;
              const available = isSizeAvailable(sizeLabel);
              return (
                <button
                  key={sizeLabel}
                  type="button"
                  aria-pressed={isActive}
                  disabled={!available}
                  aria-label={
                    available ? `Talla ${sizeLabel}` : `Talla ${sizeLabel}, agotada`
                  }
                  onClick={() => onSizeChange(sizeLabel)}
                  className={`h-11 min-w-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-gray-400 disabled:line-through ${
                    isActive
                      ? "border-red bg-black text-white"
                      : "border-line text-black hover:border-black disabled:hover:border-line"
                  }`}
                >
                  {sizeLabel}
                </button>
              );
            })}
          </div>
          {sizeError ? (
            <p id={sizeErrorId} role="alert" className="text-xs font-medium text-red">
              {sizeError}
            </p>
          ) : !selectedSize ? (
            <p className="text-xs text-gray-400">Elige tu talla</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
