"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, Feedback, TextArea, TextInput } from "@/components/admin/FormBits";
import {
  createProductWithPhotoAction,
  type CatalogActionState,
} from "@/app/admin/(panel)/catalogo/actions";
import { analyzeProductPhotoAction } from "@/app/admin/(panel)/catalogo/nuevo/ai-actions";
import { ASSIST_IDLE, type AssistState } from "@/lib/ai/assist-state";

/**
 * Crear producto: la foto primero (incremento 20).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SE VE PRIMERO, Y POR QUÉ
 * ═══════════════════════════════════════════════════════════════════════════
 * Medido antes de esto, a 390×844: esta pantalla tenía **13 campos visibles**,
 * 2,5 pantallas de formulario y **ningún control de archivo**. La foto —lo
 * único que el administrador tiene en la mano cuando le llega un artículo, y lo
 * único que el cliente va a mirar— era un paso posterior, en otra pantalla.
 *
 * Ahora el orden es: foto → lo imprescindible → (plegado) lo demás.
 *
 * Lo imprescindible son CUATRO campos: nombre, categoría, descripción corta y
 * descripción. Precio, stock y tallas **no están aquí a propósito**: viven en
 * las variantes, que es donde el modelo los guarda, y pedirlos ahora obligaría
 * a decidirlos antes de tener siquiera el producto.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA IA PROPONE. EL ADMINISTRADOR DECIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 * «Analizar foto» rellena campos de ESTE formulario. No hay un modo IA ni un
 * flujo paralelo: al guardar se mandan los campos reales, y para la Server
 * Action un valor sugerido y uno escrito a mano son indistinguibles. Ese es
 * justamente el punto.
 *
 * Cada campo que toca la IA se marca «sugerido» y se puede editar encima;
 * editarlo quita la marca, porque deja de ser una propuesta y pasa a ser una
 * decisión. Lo que la IA no sabe se queda vacío y se dice: «no determinado».
 *
 * Sin proveedor configurado, o si el asistente falla, el botón lo explica y el
 * formulario sigue funcionando igual. **La IA nunca hace falta para crear un
 * producto.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SOLO <form>, DOS ACCIONES
 * ═══════════════════════════════════════════════════════════════════════════
 * Analizar y guardar comparten formulario para que el mismo `<input type=file>`
 * sirva a las dos sin duplicarlo. «Analizar» lleva su propio `formAction` y
 * **`formNoValidate`**: sin eso, el `required` del nombre bloquearía un
 * análisis que existe precisamente para rellenarlo. `useFormStatus` no dice qué
 * botón se pulsó, así que se recuerda en `lastAction`.
 */

const INITIAL: CatalogActionState = { error: null, success: null };

/** Lo único que esta pantalla necesita saber de una categoría. */
export interface CategoryChoice {
  id: string;
  name: string;
  slug: string;
}

type FieldName = "name" | "categoryId" | "shortDescription" | "description";

const FIELDS: FieldName[] = ["name", "categoryId", "shortDescription", "description"];

/** Qué clave del origen de la sugerencia corresponde a cada campo del formulario. */
const ORIGIN_KEY = {
  name: "name",
  categoryId: "categorySlug",
  shortDescription: "shortDescription",
  description: "description",
} as const;

function AnalyzeButton({
  action,
  available,
  hasPhoto,
  busy,
  onPress,
}: {
  action: (formData: FormData) => void;
  available: boolean;
  hasPhoto: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={action}
      formNoValidate
      onClick={onPress}
      disabled={!available || !hasPhoto || pending}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-black px-5 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-line disabled:text-gray-400"
    >
      {/* TODO(i18n) */}
      {busy && pending ? "Analizando…" : "Analizar foto"}
    </button>
  );
}

function SaveButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      onClick={onPress}
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark disabled:cursor-not-allowed disabled:opacity-50 md:h-11"
    >
      {/* TODO(i18n) */}
      {busy && pending ? "Guardando…" : "Guardar producto"}
    </button>
  );
}

/** Marca discreta. Sin porcentajes ni scores: «sugerido», o nada. */
function SuggestedMark({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span className="rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] font-medium text-gray-700">
      {/* TODO(i18n) */}
      sugerido
    </span>
  );
}

export function NewProductFlow({
  categories,
  assistantAvailable,
}: {
  categories: CategoryChoice[];
  /** `false` = no hay proveedor de IA configurado. Se dice y se sigue. */
  assistantAvailable: boolean;
}) {
  const [saveState, saveAction] = useActionState(createProductWithPhotoAction, INITIAL);
  const [assist, assistAction] = useActionState(analyzeProductPhotoAction, ASSIST_IDLE);

  const [lastAction, setLastAction] = useState<"analyze" | "save" | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  const [values, setValues] = useState<Record<FieldName, string>>({
    name: "",
    categoryId: "",
    shortDescription: "",
    description: "",
  });
  /** Campos que el administrador ha tocado a mano: no se pisan ni se marcan. */
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});

  const suggestion = assist.status === "ready" ? assist.result : null;

  /*
    Cuando llega una sugerencia NUEVA se vuelca en los campos que el
    administrador no haya tocado. Se ajusta durante el render comparando con la
    última aplicada —el patrón de React para derivar estado— en vez de en un
    efecto, que pintaría un fotograma con los campos todavía vacíos.
  */
  const [applied, setApplied] = useState<AssistState["result"]>(null);
  if (suggestion && suggestion !== applied) {
    const categoryId =
      categories.find((category) => category.slug === suggestion.suggestion.categorySlug)?.id ?? "";
    setValues((current) => ({
      name: touched.name ? current.name : (suggestion.suggestion.name ?? current.name),
      categoryId: touched.categoryId ? current.categoryId : categoryId || current.categoryId,
      shortDescription: touched.shortDescription
        ? current.shortDescription
        : (suggestion.suggestion.shortDescription ?? current.shortDescription),
      description: touched.description
        ? current.description
        : (suggestion.suggestion.description ?? current.description),
    }));
    setApplied(suggestion);
  }

  const isSuggested = (field: FieldName) =>
    suggestion !== null &&
    touched[field] !== true &&
    Boolean(suggestion.origin[ORIGIN_KEY[field]]) &&
    values[field].length > 0;

  const update = (field: FieldName) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setTouched((current) => ({ ...current, [field]: true }));
  };

  function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhotoName(file?.name ?? null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrl.current);
  }

  /** Campos que la IA miró y no supo determinar. Se dice; no se rellena. */
  const undetermined =
    suggestion === null
      ? []
      : FIELDS.filter((field) => !suggestion.origin[ORIGIN_KEY[field]]);

  return (
    <form action={saveAction} className="flex flex-col gap-6">
      {/* ─────────────────────────── 1. LA FOTO ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-line bg-cream px-4 py-6 text-center">
          {preview ? (
            /* Vista previa local: el archivo todavía no ha salido del
               navegador, y `next/image` no sirve para un blob: URL. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa de la foto elegida"
              className="max-h-52 w-auto rounded-md object-contain"
            />
          ) : (
            <>
              <span aria-hidden="true" className="text-3xl">
                📷
              </span>
              {/* TODO(i18n) */}
              <span className="text-sm font-medium text-black">Sube la foto</span>
              <span className="text-xs text-gray-400">JPEG, PNG o WebP</span>
            </>
          )}
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickPhoto}
            className="sr-only"
          />
        </label>

        {photoName ? <p className="truncate text-xs text-gray-700">{photoName}</p> : null}

        <div className="flex flex-col gap-2">
          <AnalyzeButton
            action={assistAction}
            available={assistantAvailable}
            hasPhoto={photoName !== null}
            busy={lastAction === "analyze"}
            onPress={() => setLastAction("analyze")}
          />
          <p className="text-xs text-gray-400">
            {/* TODO(i18n) */}
            {assistantAvailable
              ? "Propone nombre, descripción y categoría mirando la foto. Tú decides qué se guarda."
              : "Asistente no configurado: rellena la ficha a mano."}
          </p>
        </div>

        {assist.message ? (
          <p role="status" className="text-sm text-gray-700">
            {assist.message}
          </p>
        ) : null}
      </div>

      {/* ─────────────────── 2. LO IMPRESCINDIBLE: CUATRO CAMPOS ─────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor="name" className="text-sm font-medium text-black">
              {/* TODO(i18n) */}
              Nombre
            </label>
            <SuggestedMark shown={isSuggested("name")} />
          </div>
          <TextInput
            name="name"
            value={values.name}
            onChange={update("name")}
            required
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor="categoryId" className="text-sm font-medium text-black">
              {/* TODO(i18n) */}
              Categoría
            </label>
            <SuggestedMark shown={isSuggested("categoryId")} />
          </div>
          <select
            id="categoryId"
            name="categoryId"
            value={values.categoryId}
            onChange={(event) => update("categoryId")(event.target.value)}
            required
            className="h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11 md:text-sm"
          >
            {/* TODO(i18n) */}
            <option value="">Selecciona una categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor="shortDescription" className="text-sm font-medium text-black">
              {/* TODO(i18n) */}
              Descripción corta
            </label>
            <SuggestedMark shown={isSuggested("shortDescription")} />
          </div>
          <TextInput
            name="shortDescription"
            value={values.shortDescription}
            onChange={update("shortDescription")}
            maxLength={160}
            hint
          />
          <p id="shortDescription-hint" className="text-xs text-gray-400">
            {/* TODO(i18n) */}
            Una línea. Es lo que se lee en el listado.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor="description" className="text-sm font-medium text-black">
              {/* TODO(i18n) */}
              Descripción
            </label>
            <SuggestedMark shown={isSuggested("description")} />
          </div>
          <TextArea
            name="description"
            value={values.description}
            onChange={update("description")}
            rows={4}
            maxLength={600}
          />
        </div>

        {suggestion && undetermined.length > 0 ? (
          <p className="text-xs text-gray-400">
            {/* Decir «no determinado» es parte del contrato: la IA no rellena a
                ciegas lo que no puede ver. */}
            {/* TODO(i18n) */}
            No determinado por la foto: {undetermined.length} campo
            {undetermined.length === 1 ? "" : "s"}. Complétalo tú.
          </p>
        ) : null}

        {suggestion?.suggestion.colorName ? (
          <p className="rounded-md border border-line bg-cream px-3 py-2 text-xs text-gray-700">
            {/* El color NO es un campo del producto: vive en las variantes. Se
                deja apuntado sin fingir que aquí se guarda. */}
            {/* TODO(i18n) */}
            Color aparente: <strong>{suggestion.suggestion.colorName}</strong>. Lo eliges al
            crear las variantes.
          </p>
        ) : null}
      </div>

      {/* ─────────────────── 3. LO DEMÁS, PLEGADO ─────────────────── */}
      <details className="rounded-md border border-line bg-white px-4 py-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-black">
          {/* TODO(i18n) */}
          Información avanzada
        </summary>
        <div className="mb-3 mt-1 flex flex-col gap-4 border-t border-line pt-3">
          <p className="text-xs text-gray-400">
            {/* TODO(i18n) */}
            Nada de esto hace falta para crear el producto. El slug y el SEO se
            derivan del nombre si los dejas vacíos.
          </p>
          <Field label="Slug (URL)" name="slug" hint="Se genera del nombre si lo dejas vacío.">
            <TextInput name="slug" maxLength={120} hint />
          </Field>
          <Field label="Proveedor" name="supplier" hint="Interno: el cliente no lo ve.">
            <TextInput name="supplier" maxLength={120} hint />
          </Field>
          <Field label="Materiales" name="materials" hint="Solo si lo sabes con certeza.">
            <TextInput name="materials" maxLength={500} hint />
          </Field>
          <Field label="Cuidados" name="careInstructions">
            <TextInput name="careInstructions" maxLength={500} />
          </Field>
          <Field label="Título SEO" name="metaTitle">
            <TextInput name="metaTitle" maxLength={70} />
          </Field>
          <Field label="Descripción SEO" name="metaDescription">
            <TextInput name="metaDescription" maxLength={160} />
          </Field>
        </div>
      </details>

      <div className="flex flex-col gap-2">
        <Feedback state={saveState} />
        <SaveButton busy={lastAction === "save"} onPress={() => setLastAction("save")} />
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Se crea como <strong>borrador</strong>. Después le pones precio y stock con
          las variantes, y lo publicas.
        </p>
      </div>
    </form>
  );
}
