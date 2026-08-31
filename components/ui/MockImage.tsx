import type { HTMLAttributes } from "react";

interface MockImageProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  ratio?: "portrait" | "square" | "wide";
}

const RATIO_CLASSES: Record<NonNullable<MockImageProps["ratio"]>, string> = {
  portrait: "aspect-[3/4]",
  square: "aspect-square",
  wide: "aspect-[16/9]",
};

/**
 * Placeholder visual para huecos de imagen mientras no existe Supabase
 * Storage (Fase 2). Sustituir por `next/image` real en Fase 4 — no imita
 * fotografía de producto real, es intencionalmente abstracto.
 */
export function MockImage({
  label,
  ratio = "portrait",
  className = "",
  ...props
}: MockImageProps) {
  return (
    <div
      role="img"
      aria-label={label ?? "Imagen de producto (pendiente)"}
      className={`flex items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-cream-dark to-line ${RATIO_CLASSES[ratio]} ${className}`}
      {...props}
    >
      {label ? (
        <span className="px-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
          {label}
        </span>
      ) : null}
    </div>
  );
}
