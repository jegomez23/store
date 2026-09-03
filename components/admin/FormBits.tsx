"use client";

import { useFormStatus } from "react-dom";

/**
 * Piezas de formulario compartidas por el CMS (Fase 8).
 *
 * Existen para no repetir las mismas clases y el mismo patrón de error inline
 * en seis formularios (docs/rules/ui.md #7). No contienen lógica de negocio:
 * datos entran por props.
 */

const INPUT_CLASS =
  "h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11 md:text-sm";

export function Field({
  label,
  name,
  hint,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-black">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  name,
  defaultValue,
  required,
  maxLength,
  type = "text",
  placeholder,
  hint,
  inputMode,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  type?: string;
  placeholder?: string;
  hint?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "url";
}) {
  return (
    <input
      id={name}
      name={name}
      type={type}
      inputMode={inputMode}
      defaultValue={defaultValue}
      required={required}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-describedby={hint ? `${name}-hint` : undefined}
      className={INPUT_CLASS}
    />
  );
}

export function TextArea({
  name,
  defaultValue,
  rows = 4,
  maxLength,
}: {
  name: string;
  defaultValue?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      maxLength={maxLength}
      defaultValue={defaultValue}
      className="w-full rounded-md border border-line bg-cream px-3 py-2 text-base text-black outline-none focus-visible:border-black md:text-sm"
    />
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2.5 text-sm text-black">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-5 w-5 accent-[var(--color-red)]"
      />
      {label}
    </label>
  );
}

/** Error y éxito inline, junto al formulario (docs/rules/ui.md #15). */
export function Feedback({
  state,
}: {
  state: { error: string | null; success: string | null };
}) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-gray-700">
        {state.success}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  label,
  pendingLabel = "Guardando…",
  variant = "primary",
}: {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  const classes =
    variant === "primary"
      ? "bg-red text-white hover:bg-red-dark"
      : "border border-black text-black hover:bg-black hover:text-white";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 md:h-11 ${classes}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Sección con título dentro de un formulario largo (General / SEO / …). */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium text-black">{title}</h2>
        {description ? <p className="text-xs text-gray-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
