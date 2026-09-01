/**
 * Modelo del carrito (Fase 5).
 *
 * ARQUITECTURA (DEC-007): este módulo NO conoce WhatsApp, pasarelas de pago ni
 * Supabase. El carrito administra líneas de compra; el futuro `CheckoutChannel`
 * recibirá una representación mínima del carrito (`selectCheckoutItems`), nunca
 * al revés. Flujo: Product → Variant → Cart → CheckoutChannel.
 *
 * AUTORIDAD DE DATOS: todo lo que vive aquí es un SNAPSHOT para UX, persistido
 * en localStorage y por tanto **manipulable por el cliente**. Ni el precio ni el
 * stock ni el mercado guardados aquí son autoridad. La Fase 6 debe reconstruir
 * el pedido en servidor contra Supabase (precio real, stock real, promociones
 * vigentes) antes de aceptar nada. Ver `docs/08-SECURITY.md`.
 *
 * Este archivo contiene SOLO tipos: no exporta valores en runtime, así que sus
 * imports se borran al compilar y `reducer.ts` puede probarse sin resolverlo.
 */

/** Identificador del mercado activo (`markets.id`): 'ES' | 'CO'. */
export type MarketId = string;

/**
 * Una línea del carrito. La identidad es `variantId` y solo `variantId`
 * (nunca nombre, color o talla): la variante es la unidad vendible real
 * (`product_variants`, docs/03-DATABASE.md §2.8).
 */
export interface CartLine {
  /** `product_variants.id` — identidad de la línea. */
  variantId: string;
  /** `products.id` — para reagrupar o enlazar sin depender del slug. */
  productId: string;
  /** `products.slug` — para construir el enlace a la ficha. */
  productSlug: string;
  /** Snapshot del nombre mostrado. */
  productName: string;
  /** URL pública ya resuelta de la imagen principal, o null. */
  imageUrl: string | null;
  /** Snapshot del color; null si la variante no tiene color (DEC-019). */
  colorName: string | null;
  /** Snapshot de la talla; null si la variante no tiene talla (DEC-019). */
  sizeLabel: string | null;
  /** Entero ≥ 1. */
  quantity: number;
  /** Snapshot de precio, SOLO para UX. No es autoridad de precio. */
  unitPrice: number;
  /** Mercado al que pertenece la línea. Ver DEC-024 (no se mezclan mercados). */
  marketId: MarketId;
  /**
   * Snapshot del stock conocido al añadir. SOLO para feedback de UI (topar el
   * stepper). No es una reserva de inventario ni autoridad de stock: puede
   * estar obsoleto o manipulado. La validación real es de Fase 6.
   */
  stockSnapshot: number | null;
}

/**
 * `status` distingue "todavía no se ha leído localStorage" de "leído y está
 * vacío". Vive en el estado del reducer (y no en un `useState` aparte) para
 * que la hidratación sea una transición más del reducer: sin `setState` dentro
 * de un efecto, que React 19 desaconseja.
 */
export type CartStatus = "pending" | "ready";

export interface CartState {
  lines: CartLine[];
  status: CartStatus;
}

/**
 * Datos necesarios para añadir una línea. `quantity` es opcional (default 1)
 * y se valida en el reducer.
 */
export interface AddItemInput extends Omit<CartLine, "quantity"> {
  quantity?: number;
}

export type CartAction =
  | { type: "ADD_ITEM"; item: AddItemInput }
  | { type: "REMOVE_ITEM"; variantId: string }
  | { type: "UPDATE_QUANTITY"; variantId: string; quantity: number }
  | { type: "CLEAR_CART" }
  /**
   * Restaura el estado persistido. El payload llega como `unknown` a propósito:
   * viene de localStorage, que el usuario puede editar. El reducer lo sanea.
   */
  | { type: "HYDRATE"; payload: unknown; marketId: MarketId };

/** Totales derivados. Se calculan, nunca se persisten. */
export interface CartTotals {
  /** Suma de `quantity` de todas las líneas (unidades, no líneas). */
  totalUnits: number;
  /** Número de líneas distintas. */
  lineCount: number;
  /** Suma de `unitPrice * quantity`. Snapshot, no autoridad. */
  subtotal: number;
}

/**
 * Forma exacta que consumirá `CheckoutChannel` en Fase 6
 * (`CheckoutInput.items`, docs/06-WHATSAPP.md §3). Deliberadamente NO incluye
 * precio: el servidor lo resolverá desde Supabase.
 */
export interface CheckoutLineRef {
  variantId: string;
  quantity: number;
}

/** Envoltorio versionado que se guarda en localStorage. */
export interface PersistedCart {
  version: number;
  marketId: MarketId;
  lines: CartLine[];
}
