"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartIcon, GridIcon, HomeIcon } from "@/components/ui/icons";
import { CartCountBadge, useCartLinkLabel } from "@/components/store/cart/CartCount";

const ITEM_CLASSES =
  "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium";

/**
 * Navegación fija móvil (docs/04-UX-UI.md §4). Desde Fase 5 "Carrito" enlaza
 * a /carrito con el contador de unidades. "Categorías" sigue siendo un ancla:
 * no existe listado de categoría todavía.
 */
export function BottomNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isCart = pathname === "/carrito";
  const cartLabel = useCartLinkLabel();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-cream pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link
        href="/"
        className={`${ITEM_CLASSES} ${isHome ? "text-red" : "text-black"}`}
        aria-current={isHome ? "page" : undefined}
      >
        <HomeIcon width={20} height={20} />
        Inicio
      </Link>
      <Link href="/#categorias" className={`${ITEM_CLASSES} text-black`}>
        <GridIcon width={20} height={20} />
        Categorías
      </Link>
      <Link
        href="/carrito"
        aria-label={cartLabel}
        aria-current={isCart ? "page" : undefined}
        className={`${ITEM_CLASSES} relative ${isCart ? "text-red" : "text-black"}`}
      >
        <span className="relative">
          <CartIcon width={20} height={20} />
          <CartCountBadge className="absolute -right-2.5 -top-1.5" />
        </span>
        Carrito
      </Link>
    </nav>
  );
}
