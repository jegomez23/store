"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { VariantPicker } from "@/components/store/VariantPicker";
import { useCart } from "@/lib/cart/context";
import { maxQuantityFor } from "@/lib/cart/reducer";
import { formatPrice } from "@/lib/money/format";
import type { CatalogProductDetail } from "@/lib/data/products";

interface AddToCartFormProps {
  product: CatalogProductDetail;
}

/**
 * Selección de variante + cantidad + añadir al carrito (Fase 5).
 *
 * Es el único punto de la ficha que necesita interactividad, así que concentra
 * aquí el `'use client'` y la página sigue siendo Server Component.
 *
 * NO conoce WhatsApp ni pasarelas (DEC-007): solo habla con `useCart` y, para
 * la compra directa, navega a /checkout — que es quien resuelve el canal.
 */
export function AddToCartForm({ product }: AddToCartFormProps) {
  const { addItem, market } = useCart();
  const router = useRouter();
  const sizeErrorId = useId();

  // Qué exige este producto lo determinan sus datos reales, no una suposición:
  // un accesorio puede no tener color ni talla (DEC-019).
  const requiresColor = useMemo(
    () => product.variants.some((v) => v.colorName !== null),
    [product.variants],
  );
  const requiresSize = useMemo(
    () => product.variants.some((v) => v.sizeLabel !== null),
    [product.variants],
  );

  const colorOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const v of product.variants) if (v.colorName) seen.add(v.colorName);
    return [...seen];
  }, [product.variants]);

  // Preseleccionar el color solo cuando no hay elección real que hacer.
  const [selectedColor, setSelectedColor] = useState<string | null>(
    colorOptions.length === 1 ? colorOptions[0] : null,
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showValidation, setShowValidation] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const selectedVariant = useMemo(() => {
    return (
      product.variants.find(
        (v) =>
          (!requiresColor || v.colorName === selectedColor) &&
          (!requiresSize || v.sizeLabel === selectedSize),
      ) ?? null
    );
  }, [product.variants, requiresColor, requiresSize, selectedColor, selectedSize]);

  /*
    ─────────────────────────────────────────────────────────────────────────
    PRODUCTO ENTERO AGOTADO (incremento 19) — FALLO MEDIDO, NO PRECAUCIÓN
    ─────────────────────────────────────────────────────────────────────────
    Antes, "agotado" solo se sabía DESPUÉS de elegir una variante:
    `isOutOfStock` exigía `selectedVariant !== null`. Con todas las tallas a 0
    y ninguna seleccionada, la ficha quedaba así (medido en Chrome a 390 px,
    con el stock puesto a cero desde el panel para que la invalidación fuese
    real):

        tallas  → S(off) M(off) L(off)   ← ninguna se puede pulsar
        botones → «COMPRAR POR WHATSAPP» y «Añadir al carrito» HABILITADOS
        texto   → en ningún sitio pone "agotado"
        JSON-LD → OutOfStock (esto sí era correcto)

    Es decir: un callejón sin salida. El cliente pulsa comprar, se le pide que
    elija una talla, y no hay ninguna que pueda elegir. Es el peor final
    posible para un clic que se ha pagado en un anuncio.

    Ahora la disponibilidad del PRODUCTO se calcula antes de elegir nada.
  */
  const productHasStock = useMemo(
    () => product.variants.some((variant) => variant.stock > 0),
    [product.variants],
  );

  const isOutOfStock =
    !productHasStock || (selectedVariant !== null && selectedVariant.stock <= 0);
  const maxQuantity = selectedVariant
    ? maxQuantityFor({ stockSnapshot: selectedVariant.stock })
    : 1;
  const effectiveQuantity = Math.min(quantity, Math.max(maxQuantity, 1));

  // El precio mostrado sigue a la variante elegida; si aún no hay ninguna, se
  // muestra el "desde" que ya calculó la capa de datos.
  const displayPrice = selectedVariant?.price ?? product.price;
  const displayCompareAt =
    selectedVariant?.compareAtPrice ?? product.compareAtPrice;

  const missingSize = requiresSize && !selectedSize;
  const missingColor = requiresColor && !selectedColor;

  /** Añade la variante seleccionada. Devuelve false si falta elegir algo. */
  function addSelectedToCart(): boolean {
    if (!selectedVariant || isOutOfStock) {
      setShowValidation(true);
      setConfirmation(null);
      return false;
    }

    addItem({
      variantId: selectedVariant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      imageUrl: product.images[0]?.url ?? null,
      colorName: selectedVariant.colorName,
      sizeLabel: selectedVariant.sizeLabel,
      quantity: effectiveQuantity,
      unitPrice: selectedVariant.price,
      marketId: market.id,
      stockSnapshot: selectedVariant.stock,
    });

    setShowValidation(false);
    return true;
  }

  function handleAdd() {
    if (!addSelectedToCart()) return;

    // TODO(i18n): mover a lib/i18n/messages.ts cuando exista (DEC-013).
    setConfirmation(
      effectiveQuantity === 1
        ? "Añadido al carrito."
        : `${effectiveQuantity} unidades añadidas al carrito.`,
    );
  }

  /**
   * Compra directa desde la ficha (docs/04-UX-UI.md §F1). Añade la variante al
   * carrito y lleva a /checkout: así existe UN solo formulario de datos de
   * contacto en vez de duplicarlo aquí. Esta ficha no conoce WhatsApp — el
   * canal lo resuelve la Server Action del checkout (DEC-007).
   */
  function handleBuyNow() {
    if (!addSelectedToCart()) return;
    router.push("/checkout");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span
          className={`text-xl font-semibold ${
            displayCompareAt ? "text-red" : "text-black"
          }`}
        >
          {formatPrice(displayPrice, product.currencyCode, product.locale)}
        </span>
        {displayCompareAt ? (
          <span className="text-sm text-gray-400 line-through">
            {formatPrice(displayCompareAt, product.currencyCode, product.locale)}
          </span>
        ) : null}
      </div>

      {/*
        AGOTADO SE DICE, NO SE DEDUCE (incremento 19). Va aquí, pegado al
        precio, porque es lo que decide si merece la pena seguir leyendo. Sin
        esto, la única pista eran unas tallas tachadas que no se pueden pulsar.
      */}
      {!productHasStock ? (
        <p
          role="status"
          className="rounded-md border border-line bg-cream px-4 py-3 text-sm text-black"
        >
          {/* TODO(i18n) */}
          <strong>Agotado por ahora.</strong> No queda ninguna talla disponible
          de este producto.
        </p>
      ) : null}

      <VariantPicker
        variants={product.variants}
        selectedColor={selectedColor}
        selectedSize={selectedSize}
        onColorChange={(colorName) => {
          setSelectedColor(colorName);
          setConfirmation(null);
        }}
        onSizeChange={(sizeLabel) => {
          setSelectedSize(sizeLabel);
          setShowValidation(false);
          setConfirmation(null);
        }}
        sizeErrorId={sizeErrorId}
        sizeError={showValidation && missingSize ? "Elige una talla para continuar." : null}
      />

      <div className={`flex flex-col gap-2 ${productHasStock ? "" : "hidden"}`}>
        <span className="text-sm font-medium text-black">Cantidad</span>
        <QuantityStepper
          value={effectiveQuantity}
          max={maxQuantity}
          itemLabel={product.name}
          onChange={(next) => {
            setQuantity(next);
            setConfirmation(null);
          }}
        />
        {selectedVariant && selectedVariant.stock > 0 && selectedVariant.stock <= 3 ? (
          <p className="text-xs font-medium text-red">
            Últimas {selectedVariant.stock} unidades
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <Button
          variant="whatsapp"
          onClick={handleBuyNow}
          disabled={isOutOfStock}
          className="w-full"
        >
          {/* Copy documentado en docs/04-UX-UI.md §166. */}
          {isOutOfStock ? "Agotado" : "COMPRAR POR WHATSAPP"}
        </Button>

        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={isOutOfStock}
          className="w-full"
        >
          Añadir al carrito
        </Button>

        {showValidation && productHasStock && (missingSize || missingColor) ? (
          <p role="alert" className="text-sm font-medium text-red">
            {/* TODO(i18n) */}
            {missingColor && missingSize
              ? "Elige color y talla antes de añadir al carrito."
              : missingColor
                ? "Elige un color antes de añadir al carrito."
                : "Elige una talla antes de añadir al carrito."}
          </p>
        ) : null}

        {/* Región viva: confirma la acción a lectores de pantalla sin robar foco. */}
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-gray-700">
          {confirmation ? (
            <>
              {confirmation}{" "}
              <Link href="/carrito" className="font-medium text-black underline">
                Ver carrito
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
