"use client";

import { useActionState } from "react";
import { Checkbox, Feedback, Field, SubmitButton, TextInput } from "@/components/admin/FormBits";
import { SHIPPING_LIMITS } from "@/lib/admin/shipping";
import {
  createShippingMethodAction,
  deleteShippingMethodAction,
  updateShippingMethodAction,
  type ShippingActionState,
} from "@/app/admin/(panel)/ajustes/actions";
import type { AdminShippingMethod } from "@/lib/data/shipping";
import { formatPrice } from "@/lib/money/format";

/**
 * Métodos de entrega (incremento 9).
 *
 * LO QUE SE EDITA AQUÍ DECIDE LO QUE COBRA LA TIENDA: el precio y el umbral
 * entran en el total del pedido (DEC-063, DEC-064). Por eso cada fila enseña de un
 * vistazo el importe y la condición de gratis, en vez de esconderlos detrás de
 * un formulario que hay que abrir para saber qué está vigente.
 *
 * El desplegable es `<details>`, no estado de cliente: así el formulario va
 * SERVIDO en el HTML, funciona sin JavaScript y el E2E puede hacerle POST
 * (misma lección que colores y tallas).
 */

const INITIAL: ShippingActionState = { error: null, success: null };

/** Campos comunes de alta y edición: uno solo, para que no puedan divergir. */
function MethodFields({
  method,
  currencyCode,
}: {
  method?: AdminShippingMethod;
  currencyCode: string;
}) {
  const suffix = method ? `-${method.id}` : "-nuevo";
  return (
    <>
      <Field label="Nombre" name={`name${suffix}`} hint="Lo que ve el cliente al elegir.">
        <TextInput
          name="name"
          defaultValue={method?.name}
          required
          maxLength={SHIPPING_LIMITS.name}
          hint
        />
      </Field>

      <Field label="Descripción" name={`description${suffix}`} hint="Opcional.">
        <TextInput
          name="description"
          defaultValue={method?.description ?? ""}
          maxLength={SHIPPING_LIMITS.description}
          placeholder="Entrega en 2-4 días laborables."
          hint
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Precio (${currencyCode})`} name={`price${suffix}`}>
          <TextInput
            name="price"
            inputMode="decimal"
            defaultValue={method ? String(method.price) : "0"}
            required
          />
        </Field>

        <Field
          label="Envío gratis a partir de"
          name={`freeShippingThreshold${suffix}`}
          hint="Vacío = nunca sale gratis. 0 = gratis siempre."
        >
          <TextInput
            name="freeShippingThreshold"
            inputMode="decimal"
            defaultValue={
              method?.freeShippingThreshold === null || method === undefined
                ? ""
                : String(method.freeShippingThreshold)
            }
            placeholder="60"
            hint
          />
        </Field>
      </div>

      <Field label="Orden" name={`sortOrder${suffix}`}>
        <TextInput
          name="sortOrder"
          inputMode="numeric"
          defaultValue={String(method?.sortOrder ?? 0)}
        />
      </Field>

      <Checkbox
        name="isActive"
        label="Ofrecer en el checkout"
        defaultChecked={method?.isActive ?? true}
      />
    </>
  );
}

export function NewShippingMethodForm({ currencyCode }: { currencyCode: string }) {
  const [state, formAction] = useActionState(createShippingMethodAction, INITIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-md border border-line bg-white p-4"
    >
      {/* TODO(i18n) */}
      <h3 className="text-sm font-medium text-black">Nuevo método de entrega</h3>

      <MethodFields currencyCode={currencyCode} />

      <div className="flex items-center gap-3">
        <SubmitButton label="Crear método" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ShippingMethodRow({
  method,
  currencyCode,
  locale,
}: {
  method: AdminShippingMethod;
  currencyCode: string;
  locale: string;
}) {
  const [editState, editAction] = useActionState(updateShippingMethodAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteShippingMethodAction, INITIAL);

  const money = (amount: number) => formatPrice(amount, currencyCode, locale);

  return (
    <li className="rounded-md border border-line bg-white px-4 py-1">
      <details>
        {/*
          `min-h-11` = 44 px (incremento 16). MEDIDO en Chrome a 390 px antes
          de ponerlo: este `<summary>` era el ÚNICO objetivo táctil de la fila
          —abrir el editor de un método de entrega— y medía **20 px** de alto,
          el interlineado de su propio texto. Es el gesto que hay que acertar
          para cambiar lo que cobra la tienda desde un teléfono.

          El `py-3` del `<li>` baja a `py-1` para que la fila no crezca: el
          espacio que antes ponía el contenedor lo pone ahora el objetivo.
        */}
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={method.isActive ? "text-sm text-black" : "text-sm text-gray-700"}>
              {method.name}
            </span>
            <span className="text-sm font-medium text-black">
              {method.price === 0 ? "Gratis" : money(method.price)}
            </span>
            {/* La condición de gratis se lee SIN abrir nada: es lo que más
                fácil se olvida y lo que más dinero mueve. */}
            {method.freeShippingThreshold !== null ? (
              <span className="text-xs text-gray-700">
                {/* TODO(i18n) */}
                gratis desde {money(method.freeShippingThreshold)}
              </span>
            ) : null}
            {method.isActive ? null : (
              <span className="rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-700">
                {/* TODO(i18n) */}
                No se ofrece
              </span>
            )}
          </span>
          {/* TODO(i18n) */}
          <span className="shrink-0 text-xs font-medium text-gray-700">Editar</span>
        </summary>

        <div className="mt-3 flex flex-col gap-4 border-t border-line pt-3">
          <form action={editAction} className="flex flex-col gap-4">
            <input type="hidden" name="methodId" value={method.id} />
            <MethodFields method={method} currencyCode={currencyCode} />
            <div className="flex items-center gap-3">
              <SubmitButton label="Guardar" variant="secondary" />
              <Feedback state={editState} />
            </div>
          </form>

          <form action={deleteAction} className="flex flex-col gap-2 border-t border-line pt-3">
            <input type="hidden" name="methodId" value={method.id} />
            <p className="text-xs text-gray-400">
              {/* TODO(i18n) */}
              {method.orderCount > 0
                ? `Lo han usado ${method.orderCount} ${method.orderCount === 1 ? "pedido" : "pedidos"}. Al eliminarlo esos pedidos CONSERVAN su método, su envío y su total: solo dejan de estar enlazados. Si solo quieres dejar de ofrecerlo, desmarca «Ofrecer en el checkout».`
                : "Ningún pedido lo ha usado todavía. Si solo quieres dejar de ofrecerlo, desmarca «Ofrecer en el checkout»."}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full border border-red px-4 text-sm font-medium text-red transition-colors duration-200 ease-out hover:bg-red hover:text-white"
              >
                {/* TODO(i18n) */}
                Eliminar método
              </button>
              <Feedback state={deleteState} />
            </div>
          </form>
        </div>
      </details>
    </li>
  );
}
