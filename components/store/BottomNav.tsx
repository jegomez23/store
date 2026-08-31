"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartIcon, GridIcon, HomeIcon } from "@/components/ui/icons";

const ITEM_CLASSES =
  "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium";

/**
 * Navegación fija móvil (docs/04-UX-UI.md §4). "Categorías" y "Carrito" son
 * visuales todavía: no hay listado de categoría ni carrito real (Fase 4/5).
 */
export function BottomNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

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
      <button
        type="button"
        disabled
        aria-label="Carrito (próximamente)"
        className={`${ITEM_CLASSES} text-black disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <CartIcon width={20} height={20} />
        Carrito
      </button>
    </nav>
  );
}
