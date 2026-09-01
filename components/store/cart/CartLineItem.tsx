"use client";

import Link from "next/link";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { TrashIcon } from "@/components/ui/icons";
import { selectLineSubtotal } from "@/lib/cart/reducer";
import { formatPrice } from "@/lib/money/format";
import type { CartLine } from "@/lib/cart/types";

interface CartLineItemProps {
  line: CartLine;
  maxQuantity: number;
  currencyCode: string;
  locale: string;
  onQuantityChange: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
}

/** Descripción legible de la variante ("Negro · M"), o null si no aplica. */
function variantLabel(line: CartLine): string | null {
  const parts = [line.colorName, line.sizeLabel].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Una línea del carrito. El formateo monetario va siempre por `lib/money`. */
export function CartLineItem({
  line,
  maxQuantity,
  currencyCode,
  locale,
  onQuantityChange,
  onRemove,
}: CartLineItemProps) {
  const variant = variantLabel(line);
  // Nombre completo del ítem para labels accesibles: sin él, varias líneas del
  // mismo producto tendrían botones indistinguibles ("Eliminar", "Eliminar").
  const itemLabel = variant ? `${line.productName} (${variant})` : line.productName;

  return (
    <li className="flex gap-4 py-5">
      <Link
        href={`/producto/${line.productSlug}`}
        className="w-20 shrink-0 sm:w-24"
        tabIndex={-1}
        aria-hidden="true"
      >
        <RemoteImage src={line.imageUrl} alt={line.productName} ratio="portrait" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-black">
              <Link
                href={`/producto/${line.productSlug}`}
                className="hover:underline"
              >
                {line.productName}
              </Link>
            </h2>
            {variant ? (
              <p className="mt-0.5 text-xs text-gray-700">{variant}</p>
            ) : null}
            <p className="mt-1 text-xs text-gray-700">
              {formatPrice(line.unitPrice, currencyCode, locale)} / unidad
            </p>
          </div>

          <button
            type="button"
            onClick={() => onRemove(line.variantId)}
            aria-label={`Eliminar ${itemLabel} del carrito`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-cream-dark hover:text-black"
          >
            <TrashIcon width={18} height={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            value={line.quantity}
            max={maxQuantity}
            itemLabel={itemLabel}
            onChange={(quantity) => onQuantityChange(line.variantId, quantity)}
          />
          <p className="text-sm font-semibold text-black">
            <span className="sr-only">Subtotal de {itemLabel}: </span>
            {formatPrice(selectLineSubtotal(line), currencyCode, locale)}
          </p>
        </div>

        {line.stockSnapshot !== null && line.quantity >= line.stockSnapshot ? (
          <p className="text-xs text-gray-700">
            Máximo disponible según la última consulta: {line.stockSnapshot}.
          </p>
        ) : null}
      </div>
    </li>
  );
}
