"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { CartLineItem } from "@/components/store/cart/CartLineItem";
import { useCart } from "@/lib/cart/context";
import { formatPrice } from "@/lib/money/format";

/**
 * Cuerpo de `/carrito` (Fase 5). Client Component porque todo su estado vive
 * en localStorage vía `CartProvider`; el shell de la página (título, layout,
 * metadata) sigue siendo Server Component.
 */
export function CartContents() {
  const {
    lines,
    totals,
    market,
    isHydrated,
    updateQuantity,
    removeItem,
    clearCart,
    maxQuantityForLine,
  } = useCart();

  // Antes de hidratar no se sabe si el carrito está vacío o lleno: mostrar el
  // estado vacío aquí provocaría un parpadeo en cada carga con productos.
  if (!isHydrated) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-4 py-10"
      >
        <span className="sr-only">Cargando tu carrito…</span>
        {[0, 1].map((index) => (
          <div key={index} className="flex gap-4">
            <div className="h-28 w-20 animate-pulse rounded-md bg-cream-dark sm:w-24" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-cream-dark" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-cream-dark" />
              <div className="mt-auto h-11 w-32 animate-pulse rounded-full bg-cream-dark" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-12">
        {/* TODO(i18n): centralizar copy cuando exista lib/i18n (DEC-013). */}
        <p className="text-base text-black">Tu carrito está vacío.</p>
        <p className="text-sm text-gray-700">
          Explora el catálogo y vuelve cuando encuentres algo que te lleve lejos.
        </p>
        <Link href="/">
          <Button variant="secondary">Seguir explorando</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[1fr_20rem] md:items-start md:gap-10">
      <div className="flex flex-col">
        <ul className="divide-y divide-line border-y border-line">
          {lines.map((line) => (
            <CartLineItem
              key={line.variantId}
              line={line}
              maxQuantity={maxQuantityForLine(line)}
              currencyCode={market.currencyCode}
              locale={market.locale}
              onQuantityChange={updateQuantity}
              onRemove={removeItem}
            />
          ))}
        </ul>

        <div className="pt-4">
          <button
            type="button"
            onClick={clearCart}
            className="text-sm font-medium text-gray-700 underline transition-colors hover:text-black"
          >
            Vaciar carrito
          </button>
        </div>
      </div>

      <aside
        aria-label="Resumen del pedido"
        className="flex flex-col gap-4 rounded-md border border-line bg-white p-5 md:sticky md:top-24"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black">
          Resumen
        </h2>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-700">
              Subtotal ({totals.totalUnits}{" "}
              {totals.totalUnits === 1 ? "unidad" : "unidades"})
            </dt>
            <dd className="font-medium text-black">
              {formatPrice(totals.subtotal, market.currencyCode, market.locale)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-700">Envío</dt>
            <dd className="text-gray-700">Se calcula al finalizar</dd>
          </div>
        </dl>

        <Divider />

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-black">Total</span>
          <span className="text-lg font-semibold text-red">
            {formatPrice(totals.subtotal, market.currencyCode, market.locale)}
          </span>
        </div>

        {/* Fase 6: el CTA lleva a /checkout, donde se recogen los datos de
            contacto. El carrito sigue sin conocer WhatsApp (DEC-007). */}
        <Link href="/checkout" className="w-full">
          <Button variant="primary" className="w-full">
            Finalizar compra
          </Button>
        </Link>
        <p className="text-xs text-gray-700">
          Cerramos el pedido contigo por WhatsApp. No es un pago online.
        </p>
      </aside>
    </div>
  );
}
