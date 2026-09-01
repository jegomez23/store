import type {
  AddItemInput,
  CartAction,
  CartLine,
  CartState,
  CartTotals,
  CheckoutLineRef,
  MarketId,
} from "./types";

/**
 * Reducer del carrito — LÓGICA PURA (Fase 5).
 *
 * Reglas innegociables de este módulo:
 * - No accede a `window`, `localStorage`, `document`, Supabase ni a la red.
 * - No conoce WhatsApp, checkout ni pasarelas de pago (DEC-007).
 * - No muta stock: el carrito no reserva inventario (Fase 6 valida de verdad).
 * - Es la ÚNICA autoridad sobre qué es un estado de carrito válido: `HYDRATE`
 *   recibe datos no confiables de localStorage y los sanea aquí, para que
 *   `storage.ts` no tenga que duplicar validación.
 *
 * Solo tiene imports `import type`, que desaparecen al compilar: por eso puede
 * ejecutarse directamente bajo `node --test` sin bundler ni alias.
 */

/** Tope duro por línea. Evita cantidades absurdas aunque el stock lo permita. */
export const MAX_QUANTITY_PER_LINE = 99;

export const EMPTY_CART: CartState = { lines: [], status: "pending" };

/** Entero finito ≥ 1 y ≤ tope. Rechaza NaN, Infinity, decimales y negativos. */
export function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_QUANTITY_PER_LINE
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableStock(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

/**
 * Límite efectivo de una línea: el tope duro, acotado además por el stock
 * conocido cuando lo hay. `stockSnapshot === 0` no bloquea a 0 — la cantidad
 * mínima siempre es 1; un agotado se resuelve en la UI (no se puede añadir) y
 * definitivamente en el servidor (Fase 6).
 */
export function maxQuantityFor(line: {
  stockSnapshot: number | null;
}): number {
  if (line.stockSnapshot === null || line.stockSnapshot < 1) {
    return MAX_QUANTITY_PER_LINE;
  }
  return Math.min(line.stockSnapshot, MAX_QUANTITY_PER_LINE);
}

function clampQuantity(quantity: number, line: { stockSnapshot: number | null }): number {
  return Math.min(quantity, maxQuantityFor(line));
}

/**
 * Valida una línea desconocida (de localStorage o de un caller descuidado).
 * Devuelve la línea normalizada o `null` si es inservible — nunca lanza.
 */
export function sanitizeLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (!isNonEmptyString(raw.variantId)) return null;
  if (!isNonEmptyString(raw.productId)) return null;
  if (!isNonEmptyString(raw.productSlug)) return null;
  if (!isNonEmptyString(raw.productName)) return null;
  if (!isNonEmptyString(raw.marketId)) return null;
  if (!isValidPrice(raw.unitPrice)) return null;
  if (!isNullableString(raw.colorName)) return null;
  if (!isNullableString(raw.sizeLabel)) return null;
  if (!isNullableStock(raw.stockSnapshot)) return null;
  if (raw.imageUrl !== null && typeof raw.imageUrl !== "string") return null;

  const stockSnapshot = raw.stockSnapshot;
  // La cantidad se corrige en vez de descartar la línea: perder el producto
  // entero por un número raro es peor UX que ajustarlo al rango válido.
  // Un entero ≥ 1 se RECORTA al máximo (tope duro y stock conocido); solo lo
  // que no es una cantidad usable —NaN, Infinity, decimales, negativos, no
  // números— cae al mínimo de 1.
  const rawQuantity = raw.quantity;
  const quantity =
    typeof rawQuantity === "number" &&
    Number.isInteger(rawQuantity) &&
    rawQuantity >= 1
      ? clampQuantity(rawQuantity, { stockSnapshot })
      : 1;

  return {
    variantId: raw.variantId,
    productId: raw.productId,
    productSlug: raw.productSlug,
    productName: raw.productName,
    imageUrl: raw.imageUrl,
    colorName: raw.colorName,
    sizeLabel: raw.sizeLabel,
    quantity,
    unitPrice: raw.unitPrice,
    marketId: raw.marketId,
    stockSnapshot,
  };
}

/**
 * Sanea una colección desconocida de líneas y descarta:
 * - lo que no sea una línea válida,
 * - las líneas de OTRO mercado (DEC-024),
 * - los duplicados de `variantId` (fusionando cantidades).
 */
export function sanitizeLines(value: unknown, marketId: MarketId): CartLine[] {
  if (!Array.isArray(value)) return [];

  const byVariant = new Map<string, CartLine>();

  for (const candidate of value) {
    const line = sanitizeLine(candidate);
    if (!line) continue;
    if (line.marketId !== marketId) continue;

    const existing = byVariant.get(line.variantId);
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + line.quantity, existing);
    } else {
      byVariant.set(line.variantId, line);
    }
  }

  return [...byVariant.values()];
}

function addItem(state: CartState, item: AddItemInput): CartState {
  const requested = item.quantity ?? 1;
  // Un `quantity` inválido en ADD_ITEM no añade basura al carrito: se ignora
  // la acción entera en lugar de inventar una cantidad.
  if (!isValidQuantity(requested)) return state;

  const line = sanitizeLine({ ...item, quantity: requested });
  if (!line) return state;

  const index = state.lines.findIndex((l) => l.variantId === line.variantId);
  if (index === -1) {
    return { ...state, lines: [...state.lines, line] };
  }

  const existing = state.lines[index];
  const merged: CartLine = {
    // La línea existente manda en identidad; el snapshot se refresca con el
    // dato más reciente (precio/imagen/stock pueden haber cambiado desde que
    // se añadió la primera vez).
    ...existing,
    imageUrl: line.imageUrl,
    productName: line.productName,
    unitPrice: line.unitPrice,
    stockSnapshot: line.stockSnapshot,
    quantity: existing.quantity,
  };
  merged.quantity = clampQuantity(existing.quantity + line.quantity, merged);

  const lines = [...state.lines];
  lines[index] = merged;
  return { ...state, lines };
}

function removeItem(state: CartState, variantId: string): CartState {
  if (!isNonEmptyString(variantId)) return state;
  const lines = state.lines.filter((line) => line.variantId !== variantId);
  return lines.length === state.lines.length ? state : { ...state, lines };
}

function updateQuantity(
  state: CartState,
  variantId: string,
  quantity: number,
): CartState {
  if (!isNonEmptyString(variantId)) return state;

  // Contrato explícito (§5): pedir 0 (o menos) elimina la línea. Nunca se
  // guarda una línea con quantity 0.
  if (typeof quantity === "number" && Number.isInteger(quantity) && quantity <= 0) {
    return removeItem(state, variantId);
  }
  if (!isValidQuantity(quantity)) return state;

  const index = state.lines.findIndex((line) => line.variantId === variantId);
  if (index === -1) return state;

  const existing = state.lines[index];
  const next = clampQuantity(quantity, existing);
  if (next === existing.quantity) return state;

  const lines = [...state.lines];
  lines[index] = { ...existing, quantity: next };
  return { ...state, lines };
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM":
      return addItem(state, action.item);
    case "REMOVE_ITEM":
      return removeItem(state, action.variantId);
    case "UPDATE_QUANTITY":
      return updateQuantity(state, action.variantId, action.quantity);
    case "CLEAR_CART":
      return state.lines.length === 0 ? state : { ...state, lines: [] };
    case "HYDRATE":
      // Única transición que marca el carrito como listo.
      return {
        lines: sanitizeLines(action.payload, action.marketId),
        status: "ready",
      };
    default:
      return state;
  }
}

/* ── Selectores derivados (puros) ─────────────────────────────────────── */

export function selectTotalUnits(state: CartState): number {
  return state.lines.reduce((total, line) => total + line.quantity, 0);
}

export function selectLineSubtotal(line: CartLine): number {
  return line.unitPrice * line.quantity;
}

export function selectSubtotal(state: CartState): number {
  return state.lines.reduce((total, line) => total + selectLineSubtotal(line), 0);
}

export function selectTotals(state: CartState): CartTotals {
  return {
    totalUnits: selectTotalUnits(state),
    lineCount: state.lines.length,
    subtotal: selectSubtotal(state),
  };
}

/**
 * Única salida del carrito hacia el futuro checkout (DEC-007). Devuelve solo
 * `variantId` + `quantity`: el servidor de Fase 6 resolverá precio, stock y
 * promociones desde Supabase. Deliberadamente NO expone el snapshot de precio.
 */
export function selectCheckoutItems(state: CartState): CheckoutLineRef[] {
  return state.lines.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
  }));
}
