"use client";

import { useMemo, useState } from "react";
import type { ProductVariantOption } from "@/lib/data/products";

interface VariantPickerProps {
  variants: ProductVariantOption[];
}

/**
 * Selección visual de color/talla sobre variantes reales (Fase 4). Estado
 * local únicamente — no está conectado a carrito ni crea pedidos.
 */
export function VariantPicker({ variants }: VariantPickerProps) {
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

  const [selectedColor, setSelectedColor] = useState(colors[0]?.name);
  const [selectedSize, setSelectedSize] = useState<string | undefined>();

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
          <span className="text-sm font-medium text-black">
            Color{selectedColor ? `: ${selectedColor}` : ""}
          </span>
          <div className="flex gap-2">
            {colors.map((color) => {
              const isActive = color.name === selectedColor;
              return (
                <button
                  key={color.name}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={color.name}
                  onClick={() => setSelectedColor(color.name)}
                  className={`h-9 w-9 rounded-full border-2 transition-colors ${
                    isActive ? "border-red" : "border-line"
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
          <span className="text-sm font-medium text-black">
            Talla{selectedSize ? `: ${selectedSize}` : ""}
          </span>
          <div className="flex flex-wrap gap-2">
            {sizes.map((sizeLabel) => {
              const isActive = sizeLabel === selectedSize;
              const available = isSizeAvailable(sizeLabel);
              return (
                <button
                  key={sizeLabel}
                  type="button"
                  aria-pressed={isActive}
                  disabled={!available}
                  onClick={() => setSelectedSize(sizeLabel)}
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
          {!selectedSize ? (
            <p className="text-xs text-gray-400">Elige tu talla</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
