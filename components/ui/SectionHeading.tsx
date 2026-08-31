import type { HTMLAttributes } from "react";

interface SectionHeadingProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
}

/**
 * Encabezado de sección (home, listados). Jerarquía h2 — mantener h1 único
 * por página (docs/rules/frontend.md §Accesibilidad).
 */
export function SectionHeading({
  title,
  subtitle,
  className = "",
  ...props
}: SectionHeadingProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`} {...props}>
      <h2 className="text-[22px] font-semibold tracking-tight text-black md:text-2xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-sm text-gray-700 md:text-base">{subtitle}</p>
      ) : null}
    </div>
  );
}
