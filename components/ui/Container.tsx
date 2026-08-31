import type { HTMLAttributes } from "react";

/**
 * Envoltorio de ancho máximo (1200px desktop) para contenido público.
 * docs/rules/ui.md §Layout y responsive.
 */
export function Container({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mx-auto w-full max-w-[1200px] px-4 md:px-8 ${className}`}
      {...props}
    />
  );
}
