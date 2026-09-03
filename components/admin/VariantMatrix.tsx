"use client";

import { useActionState, useState } from "react";
import { Feedback, Field, SubmitButton, TextInput } from "@/components/admin/FormBits";
import { VariantRow } from "@/components/admin/VariantRow";
import { combinationKey } from "@/lib/admin/variants";
import {
  createVariantMatrixAction,
  type CatalogActionState,
} from "@/app/admin/(panel)/catalogo/actions";
import type { ColorOption, SizeOption, AdminProductDetail } from "@/lib/data/admin/cms";

/**
 * Matriz color × talla.
 *
 * Muestra qué combinaciones EXISTEN y permite generar de golpe las que faltan.
 * La creación la hace `admin_create_variant_matrix` (migración 0021) en una
 * sola transacción; aquí solo se eligen colores y tallas.
 *
 * DEC-019 se respeta tal cual: no seleccionar ningún color (o ninguna talla)
 * significa `color_id = NULL` (o `size_id = NULL`), que es el caso de los
 * accesorios sin variantes de color o de talla única.
 *
 * Este componente NO decide qué es válido: la BD tiene el `unique
 * (product_id, color_id, size_id)`, los CHECK de precio y stock, y la policy
 * de mercado activo de la 0020.
 */

const INITIAL: CatalogActionState = { error: null, success: null };

export function VariantMatrix({
  product,
  colors,
  sizes,
  currencyCode,
}: {
  product: AdminProductDetail;
  colors: ColorOption[];
  sizes: SizeOption[];
  currencyCode: string;
}) {
  const [state, formAction] = useActionState(createVariantMatrixAction, INITIAL);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);

  const existing = new Set(
    product.variants.map((v) => combinationKey({ colorId: v.colorId, sizeId: v.sizeId })),
  );

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  // Vista previa del cartesiano, calculada igual que en el servidor.
  const previewColors = selectedColors.length > 0 ? selectedColors : [null];
  const previewSizes = selectedSizes.length > 0 ? selectedSizes : [null];
  const toCreate = previewColors.flatMap((colorId) =>
    previewSizes
      .map((sizeId) => ({ colorId, sizeId }))
      .filter((combo) => !existing.has(combinationKey(combo))),
  );

  const sizeGroups = [...new Set(sizes.map((s) => s.sizeGroup))];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-md border border-line bg-white p-4">
        {/* TODO(i18n) */}
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium text-black">Variantes existentes</h2>
          <p className="text-xs text-gray-400">
            {product.variants.length === 0
              ? "Este producto no tiene variantes: todavía no se puede comprar."
              : `${product.variants.length} ${product.variants.length === 1 ? "variante" : "variantes"}. El precio y el stock de la tienda salen de aquí.`}
          </p>
        </div>

        {product.variants.map((variant) => (
          <VariantRow
            key={variant.id}
            variant={{
              id: variant.id,
              sku: variant.sku,
              colorName: variant.colorName,
              sizeLabel: variant.sizeLabel,
              price: variant.price,
              stock: variant.stock,
              lowStockThreshold: variant.lowStockThreshold,
              isActive: variant.isActive,
              updatedAt: variant.updatedAt,
            }}
            currencyCode={currencyCode}
          />
        ))}
      </section>

      <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
        <input type="hidden" name="productId" value={product.id} />
        {selectedColors.map((id) => (
          <input key={id} type="hidden" name="colorIds" value={id} />
        ))}
        {selectedSizes.map((id) => (
          <input key={id} type="hidden" name="sizeIds" value={id} />
        ))}

        <div className="flex flex-col gap-0.5">
          {/* TODO(i18n) */}
          <h2 className="text-sm font-medium text-black">Crear combinaciones</h2>
          <p className="text-xs text-gray-400">
            Marca colores y tallas: se crearán todas las combinaciones que falten.
            Sin colores o sin tallas se crea una variante «sin color» o «sin talla»
            (accesorios).
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-700">
            Colores
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {colors.map((color) => {
              const active = selectedColors.includes(color.id);
              return (
                <button
                  key={color.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(selectedColors, setSelectedColors, color.id)}
                  className={`flex h-11 items-center gap-2 rounded-full px-3 text-sm transition-colors duration-200 ease-out ${
                    active ? "bg-black text-white" : "border border-line bg-white text-black hover:border-black"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-line"
                    style={{ backgroundColor: color.hexCode }}
                  />
                  {color.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        {sizeGroups.map((group) => (
          <fieldset key={group} className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-700">
              Tallas · {group}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {sizes
                .filter((s) => s.sizeGroup === group)
                .map((size) => {
                  const active = selectedSizes.includes(size.id);
                  return (
                    <button
                      key={size.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(selectedSizes, setSelectedSizes, size.id)}
                      className={`flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm transition-colors duration-200 ease-out ${
                        active ? "bg-black text-white" : "border border-line bg-white text-black hover:border-black"
                      }`}
                    >
                      {size.label}
                    </button>
                  );
                })}
            </div>
          </fieldset>
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio inicial" name="price" hint={`En ${currencyCode}. Editable después una a una.`}>
            <TextInput name="price" inputMode="decimal" defaultValue="0.00" required hint />
          </Field>
          <Field label="Stock inicial" name="stock">
            <TextInput name="stock" inputMode="numeric" defaultValue="0" required />
          </Field>
        </div>

        <p className="text-sm text-gray-700">
          {/* TODO(i18n) */}
          Se crearán <strong>{toCreate.length}</strong>{" "}
          {toCreate.length === 1 ? "variante nueva" : "variantes nuevas"}.
        </p>

        <Feedback state={state} />

        <div>
          <SubmitButton label="Crear variantes" pendingLabel="Creando…" />
        </div>
      </form>
    </div>
  );
}
