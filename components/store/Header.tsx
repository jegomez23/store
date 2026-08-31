"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CartIcon, CloseIcon, MenuIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/Container";
import type { CatalogCategory } from "@/lib/data/categories";

interface HeaderProps {
  categories: CatalogCategory[];
}

/**
 * Header responsive: hamburguesa + drawer en móvil, nav horizontal en
 * desktop. El carrito es visual (sin carrito real todavía — Fase 5).
 */
export function Header({ categories }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-black md:text-2xl"
        >
          YI
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

        <button
          type="button"
          disabled
          aria-label="Carrito (próximamente)"
          className="flex h-11 w-11 items-center justify-center rounded-full text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CartIcon />
        </button>
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
