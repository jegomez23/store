"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CartIcon, CloseIcon, MenuIcon } from "@/components/ui/icons";
import { CartCountBadge, useCartLinkLabel } from "@/components/store/cart/CartCount";
import { Container } from "@/components/ui/Container";
import type { CatalogCategory } from "@/lib/data/categories";

interface HeaderProps {
  categories: CatalogCategory[];
  /**
   * Nombre de la tienda desde `settings` (incremento 16). Antes aquí ponía
   * «YI» a mano, así que renombrar la tienda en /admin/ajustes no cambiaba el
   * logo. `null` solo puede pasar si el mercado no tiene fila de `settings`:
   * entonces el enlace sigue existiendo como navegación —«Inicio»— en vez de
   * inventarse una marca.
   */
  storeName: string | null;
  /**
   * URL pública del logo (incremento 17), ya resuelta por el data layer.
   * `null` = la tienda no tiene logo y se pinta el nombre escrito, que es
   * exactamente lo que había antes. Subirlo NO es obligatorio.
   */
  logoUrl: string | null;
}

/**
 * Header responsive: hamburguesa + drawer en móvil, nav horizontal en
 * desktop. Desde Fase 5 el icono de carrito enlaza a /carrito y muestra el
 * número de unidades.
 */
export function Header({ categories, storeName, logoUrl }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const cartLabel = useCartLinkLabel();

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-cream">
      <Container className="flex h-16 items-center justify-between">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-black md:hidden"
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        {/*
          LOGO O NOMBRE, NUNCA LOS DOS (incremento 17).

          Con logo, el nombre viaja en el `alt`: repetirlo al lado haría que un
          lector de pantalla anunciara la marca dos veces, y en 390 px robaría
          el sitio del carrito.

          Caja de tamaño FIJO con `fill` + `object-contain`: el logo lo sube el
          administrador y no sabemos su proporción. Reservar el hueco evita que
          la cabecera dé un salto al cargar la imagen, que es CLS justo en lo
          primero que se ve. `sizes` acota lo que `next/image` genera; el objeto
          ya llega recortado a 512 px de lado por `lib/storage/logo.ts`.
        */}
        <Link href="/" className="flex items-center" aria-label={storeName ?? "Inicio"}>
          {logoUrl ? (
            <span className="relative block h-8 w-28 md:h-9 md:w-36">
              <Image
                src={logoUrl}
                alt={storeName ?? "Inicio"}
                fill
                sizes="144px"
                className="object-contain object-left"
                priority
              />
            </span>
          ) : (
            <span className="text-xl font-bold tracking-tight text-black md:text-2xl">
              {storeName ?? "Inicio"}
            </span>
          )}
        </Link>

        <nav
          aria-label="Categorías"
          className="hidden items-center gap-8 md:flex"
        >
          {categories.map((category) => (
            <Link
              key={category.slug}
              href="/#categorias"
              className="text-sm font-medium text-black transition-colors hover:text-gray-700"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <Link
          href="/carrito"
          aria-label={cartLabel}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-black transition-colors hover:bg-cream-dark"
        >
          <CartIcon />
          <CartCountBadge className="absolute right-1 top-1" />
        </Link>
      </Container>

      {isMenuOpen ? (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 z-10 bg-black/40"
          />
          <nav
            aria-label="Menú principal"
            className="fixed inset-y-0 left-0 z-20 flex w-72 max-w-[80vw] flex-col gap-1 bg-cream p-6 pt-20 shadow-lg"
          >
            <Link
              href="/"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-md px-3 py-3 text-base font-medium text-black hover:bg-cream-dark"
            >
              Inicio
            </Link>
            <Link
              href="/#categorias"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-md px-3 py-3 text-base font-medium text-black hover:bg-cream-dark"
            >
              Categorías
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
