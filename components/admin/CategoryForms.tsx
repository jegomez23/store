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
import { CATEGORY_LIMITS, canBeParent } from "@/lib/admin/content";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
  type CategoryActionState,
} from "@/app/admin/(panel)/categorias/actions";
import type { AdminCategory } from "@/lib/data/admin/cms";

/**
 * Alta y edición de categorías.
 *
 * El selector de padre solo ofrece categorías RAÍZ y nunca la que se edita: es
 * la traducción a UI del trigger `enforce_category_depth` (máx. 2 niveles). La
 * autoridad sigue siendo el trigger — si alguien manipula el formulario, el
 * INSERT falla en PostgreSQL y la action traduce el error.
 */

const INITIAL: CategoryActionState = { error: null, success: null };

function ParentSelect({
  categories,
  editingId,
  defaultValue,
  disabled,
}: {
  categories: AdminCategory[];
  editingId: string | null;
  defaultValue: string;
  disabled: boolean;
}) {
  const options = categories.filter((c) => canBeParent({ id: c.id, parentId: c.parentId }, editingId));

  return (
    <select
      id="parentId"
      name="parentId"
      defaultValue={defaultValue}
      disabled={disabled}
      className="h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black disabled:opacity-50 md:h-11 md:text-sm"
    >
      {/* TODO(i18n) */}
      <option value="">Ninguna (categoría principal)</option>
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}

export function NewCategoryForm({ categories }: { categories: AdminCategory[] }) {
  const [state, formAction] = useActionState(createCategoryAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center self-start rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark md:h-11"
      >
        {/* TODO(i18n) */}
        Nueva categoría
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
      {/* TODO(i18n) en todo el formulario */}
      <h2 className="text-sm font-medium text-black">Nueva categoría</h2>

      <Field label="Nombre" name="name">
        <TextInput name="name" required maxLength={CATEGORY_LIMITS.name} />
      </Field>

      <Field label="Slug (URL)" name="slug" hint="Si lo dejas vacío se genera desde el nombre.">
        <TextInput name="slug" placeholder="camisetas" hint />
      </Field>

      <Field label="Categoría padre" name="parentId" hint="La jerarquía admite como máximo 2 niveles.">
        <ParentSelect categories={categories} editingId={null} defaultValue="" disabled={false} />
      </Field>

      <Field label="Descripción" name="description">
        <TextArea name="description" rows={2} maxLength={CATEGORY_LIMITS.description} />
      </Field>

      <Field label="Orden" name="sortOrder">
        <TextInput name="sortOrder" inputMode="numeric" defaultValue="0" />
      </Field>

      <Checkbox name="isActive" label="Visible en la tienda" defaultChecked />

      <Feedback state={state} />

      <div className="flex gap-2">
        <SubmitButton label="Crear categoría" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-12 rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-cream-dark hover:text-black md:h-11"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CategoryRow({
  category,
  categories,
}: {
  category: AdminCategory;
  categories: AdminCategory[];
}) {
  const [state, formAction] = useActionState(updateCategoryAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteCategoryAction, INITIAL);
  const [editing, setEditing] = useState(false);

  const blocked = category.productCount > 0 || category.childCount > 0;

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-black">
            {category.parentId ? <span className="text-gray-400">— </span> : null}
            {category.name}
            {!category.isActive ? (
              <span className="ml-2 text-xs font-normal text-gray-400">
                {/* TODO(i18n) */}
                (oculta)
              </span>
            ) : null}
          </p>
          <p className="text-xs text-gray-700">
            {/* TODO(i18n) */}
            /{category.slug} · orden {category.sortOrder} · {category.productCount}{" "}
            {category.productCount === 1 ? "producto" : "productos"}
            {category.childCount > 0 ? ` · ${category.childCount} subcategorías` : ""}
          </p>
          <Feedback state={deleteState} />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-11 rounded-md border border-line px-3 text-sm font-medium text-black transition-colors duration-200 ease-out hover:border-black"
          >
            {/* TODO(i18n) */}
            Editar
          </button>
          <form action={deleteAction}>
            <input type="hidden" name="categoryId" value={category.id} />
            <button
              type="submit"
              disabled={blocked}
              title={
                blocked
                  ? "Tiene productos o subcategorías: muévelos antes de eliminarla."
                  : undefined
              }
              className="h-11 rounded-md px-3 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {/* TODO(i18n) */}
              Eliminar
            </button>
          </form>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-line bg-white p-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="categoryId" value={category.id} />

        <Field label="Nombre" name="name">
          <TextInput name="name" defaultValue={category.name} required maxLength={CATEGORY_LIMITS.name} />
        </Field>

        <Field label="Slug (URL)" name="slug">
          <TextInput name="slug" defaultValue={category.slug} required />
        </Field>

        <Field
          label="Categoría padre"
          name="parentId"
          hint={
            category.childCount > 0
              ? "Esta categoría tiene subcategorías, así que no puede depender de otra."
              : "La jerarquía admite como máximo 2 niveles."
          }
        >
          <ParentSelect
            categories={categories}
            editingId={category.id}
            defaultValue={category.parentId ?? ""}
            disabled={category.childCount > 0}
          />
        </Field>

        <Field label="Descripción" name="description">
          <TextArea
            name="description"
            rows={2}
            maxLength={CATEGORY_LIMITS.description}
            defaultValue={category.description ?? ""}
          />
        </Field>

        <Field label="Orden" name="sortOrder">
          <TextInput name="sortOrder" inputMode="numeric" defaultValue={String(category.sortOrder)} />
        </Field>

        <Checkbox name="isActive" label="Visible en la tienda" defaultChecked={category.isActive} />

        <Feedback state={state} />

        <div className="flex gap-2">
          <SubmitButton label="Guardar" />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-12 rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-cream-dark hover:text-black md:h-11"
          >
            {/* TODO(i18n) */}
            Cerrar
          </button>
        </div>
      </form>
    </li>
  );
}
