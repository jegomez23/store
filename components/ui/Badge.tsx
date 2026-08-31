import type { HTMLAttributes } from "react";

type BadgeTone = "neutral" | "accent";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-cream-dark text-black",
  accent: "bg-red text-white",
};

/**
 * Pill de estado/etiqueta. `tone="accent"` (rojo) reservado a lo que
 * realmente lo justifique — docs/rules/ui.md §Uso del rojo.
 */
export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wide ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}
