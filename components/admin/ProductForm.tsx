"use client";

import { useActionState } from "react";
import {
  Checkbox,
  Feedback,
  Field,
  FormSection,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/admin/FormBits";
import { PRODUCT_TEXT_LIMITS } from "@/lib/admin/products";
import {
  createProductAction,
  updateProductAction,
  type CatalogActionState,
} from "@/app/admin/(panel)/catalogo/actions";
import type { AdminProductDetail } from "@/lib/data/admin/cms";
import type { AdminCategory } from "@/lib/data/admin/cms";

/**
 * Formulario de producto: datos generales + SEO.
 *
 * Solo campos que existen en `public.products`. Variantes e imágenes viven en
 * sus propias secciones de la página de edición, no aquí (docs/05-ADMIN.md §4.1
 * pide distinguirlos).
 *
 * Al crear no se pide estado: el producto nace `draft` y publicarlo es un acto
 * explícito y separado.
 */

const INITIAL: CatalogActionState = { error: null, success: null };

export function ProductForm({
  product,
  categories,
}: {
  /** `null` = alta. */
  product: AdminProductDetail | null;
  categories: AdminCategory[];
}) {
  const action = product ? updateProductAction : createProductAction;
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}

      {/* TODO(i18n) en todo el formulario */}
      <FormSection
        title="Datos del producto"
        description="Lo que se ve en la ficha y en el listado de la tienda."
      >
        <Field label="Nombre" name="name">
          <TextInput
            name="name"
            defaultValue={product?.name}
            required
            maxLength={PRODUCT_TEXT_LIMITS.name}
          />
        </Field>

        <Field
          label="Slug (URL)"
          name="slug"
          hint="Solo minúsculas, números y guiones. Si lo dejas vacío al crear, se genera desde el nombre."
        >
          <TextInput
            name="slug"
            defaultValue={product?.slug}
            placeholder="camiseta-sendero-oversize"
            hint
          />
        </Field>

        <Field label="Categoría" name="categoryId">
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={product?.categoryId ?? ""}
            className="h-12 w-full rounded-md border border-line bg-cream px-3 text-base text-black outline-none focus-visible:border-black md:h-11 md:text-sm"
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentId ? "— " : ""}
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Descripción corta" name="shortDescription">
          <TextArea
            name="shortDescription"
            rows={2}
            maxLength={PRODUCT_TEXT_LIMITS.shortDescription}
            defaultValue={product?.shortDescription ?? ""}
          />
        </Field>

        <Field label="Descripción" name="description">
          <TextArea
            name="description"
            rows={6}
            maxLength={PRODUCT_TEXT_LIMITS.description}
            defaultValue={product?.description ?? ""}
          />
        </Field>

        <Field label="Materiales" name="materials">
          <TextArea
            name="materials"
            rows={2}
            maxLength={PRODUCT_TEXT_LIMITS.materials}
            defaultValue={product?.materials ?? ""}
          />
        </Field>

        <Field label="Cuidados" name="careInstructions">
          <TextArea
            name="careInstructions"
            rows={2}
            maxLength={PRODUCT_TEXT_LIMITS.careInstructions}
            defaultValue={product?.careInstructions ?? ""}
          />
        </Field>

        <Field
          label="Información de envío específica"
          name="shippingInfoOverride"
          hint="Solo si este producto necesita algo distinto de lo general."
        >
          <TextArea
            name="shippingInfoOverride"
            rows={2}
            maxLength={PRODUCT_TEXT_LIMITS.shippingInfoOverride}
            defaultValue={product?.shippingInfoOverride ?? ""}
          />
        </Field>

        <div className="flex flex-wrap gap-4">
          <Checkbox name="isFeatured" label="Destacado en la home" defaultChecked={product?.isFeatured} />
          <Checkbox name="isNew" label="Marcar como novedad" defaultChecked={product?.isNew} />
        </div>
      </FormSection>

      <FormSection
        title="SEO"
        description="Si los dejas vacíos se usan el nombre y la descripción corta."
      >
        <Field
          label="Meta título"
          name="metaTitle"
          hint={`Máximo ${PRODUCT_TEXT_LIMITS.metaTitle} caracteres.`}
        >
          <TextInput
            name="metaTitle"
            defaultValue={product?.metaTitle ?? ""}
            maxLength={PRODUCT_TEXT_LIMITS.metaTitle}
            hint
          />
        </Field>

        <Field
          label="Meta descripción"
          name="metaDescription"
          hint={`Máximo ${PRODUCT_TEXT_LIMITS.metaDescription} caracteres.`}
        >
          <TextArea
            name="metaDescription"
            rows={3}
            maxLength={PRODUCT_TEXT_LIMITS.metaDescription}
            defaultValue={product?.metaDescription ?? ""}
          />
        </Field>
      </FormSection>

      <Feedback state={state} />

      <div>
        <SubmitButton label={product ? "Guardar producto" : "Crear producto"} />
      </div>
    </form>
  );
}
