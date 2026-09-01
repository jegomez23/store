"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  EMPTY_CART,
  cartReducer,
  maxQuantityFor,
  selectCheckoutItems,
  selectTotals,
} from "@/lib/cart/reducer";
import { readPersistedLines, writePersistedCart } from "@/lib/cart/storage";
import type {
  AddItemInput,
  CartLine,
  CartTotals,
  CheckoutLineRef,
  MarketId,
} from "@/lib/cart/types";

/**
 * Provider del carrito (Fase 5).
 *
 * Es el ÚNICO punto donde se juntan el reducer puro y localStorage. La lógica
 * sigue viviendo en `reducer.ts` (testeable sin React); aquí solo hay React y
 * efectos de navegador.
 *
 * HIDRATACIÓN: el servidor renderiza siempre el carrito vacío. La restauración
 * ocurre en un efecto, después de hidratar — nunca durante el render — para no
 * provocar hydration mismatch. `isHydrated` permite a la UI distinguir
 * "cargando" de "vacío de verdad" y evitar un parpadeo del estado vacío.
 */

interface CartMarket {
  id: MarketId;
  currencyCode: string;
  locale: string;
}

interface CartContextValue {
  lines: CartLine[];
  totals: CartTotals;
  market: CartMarket;
  /** false hasta que se restaura localStorage en el cliente. */
  isHydrated: boolean;
  addItem: (item: AddItemInput) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  /** Máximo permitido para una línea (tope duro acotado por stock conocido). */
  maxQuantityForLine: (line: CartLine) => number;
  /** Representación mínima para el futuro CheckoutChannel (DEC-007). */
  getCheckoutItems: () => CheckoutLineRef[];
}

const CartContext = createContext<CartContextValue | null>(null);

interface CartProviderProps {
  market: CartMarket;
  children: ReactNode;
}

export function CartProvider({ market, children }: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, EMPTY_CART);
  const marketId = market.id;

  // El flag de hidratación se DERIVA del estado del reducer (`status`), no de
  // un `useState` aparte: así el efecto solo despacha y no llama a setState,
  // que React 19 desaconseja (regla react-hooks/set-state-in-effect).
  const isHydrated = state.status === "ready";

  useEffect(() => {
    dispatch({
      type: "HYDRATE",
      payload: readPersistedLines(marketId),
      marketId,
    });
  }, [marketId]);

  useEffect(() => {
    // No persistir antes de hidratar: sobrescribiría el carrito guardado con
    // el estado vacío inicial del servidor.
    if (state.status !== "ready") return;
    writePersistedCart(state, marketId);
  }, [state, marketId]);

  const addItem = useCallback(
    (item: AddItemInput) => dispatch({ type: "ADD_ITEM", item }),
    [],
  );
  const removeItem = useCallback(
    (variantId: string) => dispatch({ type: "REMOVE_ITEM", variantId }),
    [],
  );
  const updateQuantity = useCallback(
    (variantId: string, quantity: number) =>
      dispatch({ type: "UPDATE_QUANTITY", variantId, quantity }),
    [],
  );
  const clearCart = useCallback(() => dispatch({ type: "CLEAR_CART" }), []);
  const getCheckoutItems = useCallback(
    () => selectCheckoutItems(state),
    [state],
  );

  const totals = useMemo(() => selectTotals(state), [state]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      totals,
      market,
      isHydrated,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      maxQuantityForLine: maxQuantityFor,
      getCheckoutItems,
    }),
    [
      state.lines,
      totals,
      market,
      isHydrated,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      getCheckoutItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe usarse dentro de <CartProvider>.");
  }
  return context;
}
