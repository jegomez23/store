"use client";

import { useActionState } from "react";
import { Checkbox, Feedback, Field, SubmitButton, TextInput } from "@/components/admin/FormBits";
import {
  ATTRIBUTE_LIMITS,
  SIZE_GROUPS,
  SIZE_GROUP_LABELS,
  isSizeGroup,
} from "@/lib/admin/attributes";
import {
  createColorAction,
  createSizeAction,
  deleteColorAction,
  deleteSizeAction,
  updateColorAction,
  updateSizeAction,
  type AttributeActionState,
} from "@/app/admin/(panel)/atributos/actions";
import type { AdminColor, AdminSize } from "@/lib/data/admin/cms";

/**
 * Mantenimiento de colores y tallas (Fase 9.5, incremento 6).
 *
 * La edición se despliega por fila y no en una pantalla aparte: son cuatro
 * campos y navegar a otra página para cambiar un orden sería más trabajo que
 * el cambio en sí.
 *
 * Cada operación es su propio `<form>`, así que el error de una fila no
 * bloquea las demás y el mensaje sale junto a lo que se tocó — el mismo patrón
 * que `ProductImages` y `CategoryForms`.
 *
 * EL DESPLEGABLE ES `<details>`, NO `useState`. Con estado de cliente, los
 * formularios de edición y borrado **no existen en el HTML** hasta que alguien
 * hace clic, así que no se pueden ejercitar sin navegador — que es justo la
 * deuda que la Fase 9 dejó apuntada con los formularios de categorías. Con
 * `<details>` el marcado está siempre servido: funciona sin JavaScript y el
 * E2E puede hacer POST contra él.
 *
 * Aquí NO hay lógica de autorización ni acceso a Supabase: los datos entran
 * por props y las mutaciones salen por Server Actions.
 */

const INITIAL: AttributeActionState = { error: null, success: null };

/** Muestra del color. `aria-hidden`: el nombre ya está escrito al lado. */
function Swatch({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-5 w-5 shrink-0 rounded-full border border-line"
      style={{ backgroundColor: hex }}
    />
  );
}

function InactiveBadge() {
  return (
    <span className="rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-700">
      {/* TODO(i18n) */}
      Retirado
    </span>
  );
}

/* ───────────────────────────────────────────────────────────────── Colores */

export function NewColorForm() {
  const [state, formAction] = useActionState(createColorAction, INITIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-4"
    >
      {/* TODO(i18n) */}
      <h3 className="text-sm font-medium text-black">Nuevo color</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" name="name">
          <TextInput name="name" required maxLength={ATTRIBUTE_LIMITS.colorName} />
        </Field>
        <Field label="Slug" name="slug" hint="Si lo dejas vacío se genera desde el nombre.">
          <TextInput name="slug" placeholder="verde-bosque" hint />
        </Field>
        <Field label="Color" name="hexCode" hint="Hexadecimal de 6 dígitos.">
          <TextInput name="hexCode" placeholder="#3A4A3E" required maxLength={7} hint />
        </Field>
        <Field label="Orden" name="sortOrder">
          <TextInput name="sortOrder" inputMode="numeric" defaultValue="0" />
        </Field>
      </div>

      <Checkbox name="isActive" label="Disponible para variantes nuevas" defaultChecked />

      <div className="flex items-center gap-3">
        <SubmitButton label="Crear color" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ColorRow({ color }: { color: AdminColor }) {
  const [editState, editAction] = useActionState(updateColorAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteColorAction, INITIAL);

  return (
    <li className="rounded-md border border-line bg-white px-4 py-3">
      <details className="flex flex-col gap-3">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Swatch hex={color.hexCode} />
            <span className={color.isActive ? "text-sm text-black" : "text-sm text-gray-700"}>
              {color.name}
            </span>
            <span className="font-mono text-xs text-gray-400">{color.slug}</span>
            <span className="font-mono text-xs text-gray-400">{color.hexCode}</span>
            {color.isActive ? null : <InactiveBadge />}
          </span>
          {/* TODO(i18n) */}
          <span className="shrink-0 text-xs font-medium text-gray-700">Editar</span>
        </summary>

        <div className="mt-3 flex flex-col gap-4 border-t border-line pt-3">
          <form action={editAction} className="flex flex-col gap-4">
            <input type="hidden" name="colorId" value={color.id} />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre" name={`name-${color.id}`}>
                <TextInput
                  name="name"
                  defaultValue={color.name}
                  required
                  maxLength={ATTRIBUTE_LIMITS.colorName}
                />
              </Field>
              <Field label="Slug" name={`slug-${color.id}`}>
                <TextInput name="slug" defaultValue={color.slug} required />
              </Field>
              <Field label="Color" name={`hexCode-${color.id}`}>
                <TextInput name="hexCode" defaultValue={color.hexCode} required maxLength={7} />
              </Field>
              <Field label="Orden" name={`sortOrder-${color.id}`}>
                <TextInput
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(color.sortOrder)}
                />
              </Field>
            </div>

            <Checkbox
              name="isActive"
              label="Disponible para variantes nuevas"
              defaultChecked={color.isActive}
            />

            <div className="flex items-center gap-3">
              <SubmitButton label="Guardar" variant="secondary" />
              <Feedback state={editState} />
            </div>
          </form>

          <form action={deleteAction} className="flex flex-col gap-2 border-t border-line pt-3">
            <input type="hidden" name="colorId" value={color.id} />
            <p className="text-xs text-gray-400">
              {/* TODO(i18n) */}
              Eliminar solo funciona si ninguna variante lo usa. Si está en uso,
              desactívalo: las variantes existentes lo conservan y deja de
              ofrecerse para crear nuevas.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full border border-red px-4 text-sm font-medium text-red transition-colors duration-200 ease-out hover:bg-red hover:text-white"
              >
                {/* TODO(i18n) */}
                Eliminar color
              </button>
              <Feedback state={deleteState} />
            </div>
          </form>
        </div>
      </details>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────── Tallas */

function SizeGroupSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select
      id={name}
      name="sizeGroup"
      defaultValue={isSizeGroup(defaultValue) ? defaultValue : "apparel"}
      required
      className="h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11 md:text-sm"
    >
      {SIZE_GROUPS.map((group) => (
        <option key={group} value={group}>
          {SIZE_GROUP_LABELS[group]}
        </option>
      ))}
    </select>
  );
}

export function NewSizeForm() {
  const [state, formAction] = useActionState(createSizeAction, INITIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-4"
    >
      {/* TODO(i18n) */}
      <h3 className="text-sm font-medium text-black">Nueva talla</h3>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Etiqueta" name="label" hint="Lo que ve el cliente: M, 42, Única.">
          <TextInput name="label" required maxLength={ATTRIBUTE_LIMITS.sizeLabel} hint />
        </Field>
        <Field label="Grupo" name="sizeGroup" hint="Solo agrupa las tallas en el panel.">
          <SizeGroupSelect name="sizeGroup" />
        </Field>
        <Field label="Orden" name="sortOrder">
          <TextInput name="sortOrder" inputMode="numeric" defaultValue="0" />
        </Field>
      </div>

      <Checkbox name="isActive" label="Disponible para variantes nuevas" defaultChecked />

      <div className="flex items-center gap-3">
        <SubmitButton label="Crear talla" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function SizeRow({ size }: { size: AdminSize }) {
  const [editState, editAction] = useActionState(updateSizeAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteSizeAction, INITIAL);

  return (
    <li className="rounded-md border border-line bg-white px-4 py-3">
      <details className="flex flex-col gap-3">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className={size.isActive ? "text-sm text-black" : "text-sm text-gray-700"}>
              {size.label}
            </span>
            {size.isActive ? null : <InactiveBadge />}
          </span>
          {/* TODO(i18n) */}
          <span className="shrink-0 text-xs font-medium text-gray-700">Editar</span>
        </summary>

        <div className="mt-3 flex flex-col gap-4 border-t border-line pt-3">
          <form action={editAction} className="flex flex-col gap-4">
            <input type="hidden" name="sizeId" value={size.id} />

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Etiqueta" name={`label-${size.id}`}>
                <TextInput
                  name="label"
                  defaultValue={size.label}
                  required
                  maxLength={ATTRIBUTE_LIMITS.sizeLabel}
                />
              </Field>
              <Field label="Grupo" name={`sizeGroup-${size.id}`}>
                <SizeGroupSelect name={`sizeGroup-${size.id}`} defaultValue={size.sizeGroup} />
              </Field>
              <Field label="Orden" name={`sortOrder-${size.id}`}>
                <TextInput
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(size.sortOrder)}
                />
              </Field>
            </div>

            <Checkbox
              name="isActive"
              label="Disponible para variantes nuevas"
              defaultChecked={size.isActive}
            />

            <div className="flex items-center gap-3">
              <SubmitButton label="Guardar" variant="secondary" />
              <Feedback state={editState} />
            </div>
          </form>

          <form action={deleteAction} className="flex flex-col gap-2 border-t border-line pt-3">
            <input type="hidden" name="sizeId" value={size.id} />
            <p className="text-xs text-gray-400">
              {/* TODO(i18n) */}
              Eliminar solo funciona si ninguna variante la usa. Si está en uso,
              desactívala: las variantes existentes la conservan y deja de
              ofrecerse para crear nuevas.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full border border-red px-4 text-sm font-medium text-red transition-colors duration-200 ease-out hover:bg-red hover:text-white"
              >
                {/* TODO(i18n) */}
                Eliminar talla
              </button>
              <Feedback state={deleteState} />
            </div>
          </form>
        </div>
      </details>
    </li>
  );
}
