"use client";

import { useActionState, useState } from "react";
import {
  Checkbox,
  Feedback,
  Field,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/admin/FormBits";
import { HOME_LIMITS, HOME_SECTIONS, HOME_SECTION_LABELS } from "@/lib/admin/content";
import {
  createHomeBlockAction,
  deleteHomeBlockAction,
  updateHomeBlockAction,
  type HomeActionState,
} from "@/app/admin/(panel)/home/actions";
import type { AdminHomeBlock } from "@/lib/data/admin/cms";

/**
 * Bloques de la home. NO es un page builder: las secciones son exactamente las
 * tres del CHECK de `home_content` y los campos, los de esa tabla.
 *
 * `image_url` no se edita aquí: subir imágenes de home usaría el bucket
 * `content` y eso quedó fuera del alcance de esta fase.
 */

const INITIAL: HomeActionState = { error: null, success: null };

function SectionSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select
      id="section"
      name="section"
      defaultValue={defaultValue ?? "hero"}
      required
      className="h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11 md:text-sm"
    >
      {HOME_SECTIONS.map((section) => (
        <option key={section} value={section}>
          {HOME_SECTION_LABELS[section]}
        </option>
      ))}
    </select>
  );
}

function BlockFields({ block }: { block?: AdminHomeBlock }) {
  return (
    <>
      {/* TODO(i18n) en todo el formulario */}
      <Field label="Tipo de bloque" name="section">
        <SectionSelect defaultValue={block?.section} />
      </Field>

      <Field label="Título" name="title">
        <TextInput name="title" defaultValue={block?.title ?? ""} maxLength={HOME_LIMITS.title} />
      </Field>

      <Field label="Subtítulo" name="subtitle">
        <TextArea
          name="subtitle"
          rows={2}
          maxLength={HOME_LIMITS.subtitle}
          defaultValue={block?.subtitle ?? ""}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Texto del botón" name="ctaLabel">
          <TextInput
            name="ctaLabel"
            defaultValue={block?.ctaLabel ?? ""}
            maxLength={HOME_LIMITS.ctaLabel}
          />
        </Field>
        <Field label="Enlace del botón" name="ctaHref" hint="Ruta interna, empieza por «/».">
          <TextInput
            name="ctaHref"
            defaultValue={block?.ctaHref ?? ""}
            placeholder="/producto/gorra-horizonte"
            hint
          />
        </Field>
      </div>

      <Field label="Orden" name="sortOrder">
        <TextInput name="sortOrder" inputMode="numeric" defaultValue={String(block?.sortOrder ?? 0)} />
      </Field>

      <Checkbox name="isActive" label="Visible en la home" defaultChecked={block?.isActive ?? true} />
    </>
  );
}

export function NewHomeBlockForm() {
  const [state, formAction] = useActionState(createHomeBlockAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center self-start rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark md:h-11"
      >
        {/* TODO(i18n) */}
        Nuevo bloque
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
      <h2 className="text-sm font-medium text-black">{/* TODO(i18n) */}Nuevo bloque</h2>
      <BlockFields />
      <Feedback state={state} />
      <div className="flex gap-2">
        <SubmitButton label="Crear bloque" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-12 rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-cream-dark hover:text-black md:h-11"
        >
          {/* TODO(i18n) */}
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function HomeBlockCard({ block }: { block: AdminHomeBlock }) {
  const [state, formAction] = useActionState(updateHomeBlockAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteHomeBlockAction, INITIAL);

  return (
    <li className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-cream-dark px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-black">
          {HOME_SECTION_LABELS[block.section]}
        </span>
        {!block.isActive ? (
          <span className="text-xs text-gray-400">{/* TODO(i18n) */}Oculto</span>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="blockId" value={block.id} />
        <BlockFields block={block} />
        <Feedback state={state} />
        <div>
          <SubmitButton label="Guardar bloque" />
        </div>
      </form>

      <form action={deleteAction} className="border-t border-line pt-3">
        <input type="hidden" name="blockId" value={block.id} />
        <button
          type="submit"
          className="h-11 rounded-md px-3 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black"
        >
          {/* TODO(i18n) */}
          Eliminar bloque
        </button>
        <Feedback state={deleteState} />
      </form>
    </li>
  );
}
