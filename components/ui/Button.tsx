import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "whatsapp";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-red text-white hover:bg-red-dark",
  secondary: "bg-transparent text-black border border-black hover:bg-black hover:text-white",
  ghost: "bg-transparent text-black hover:bg-cream-dark",
  whatsapp: "bg-whatsapp text-white hover:brightness-95",
};

/**
 * Primitivo de acción. `variant="primary"` (rojo) es el único CTA principal
 * permitido por pantalla — docs/rules/ui.md §Uso del rojo.
 */
export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 md:h-11 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
