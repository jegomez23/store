import Link from "next/link";
import { LogoutButton } from "@/components/admin/LogoutButton";

/**
 * Chrome del panel: navegación lateral en desktop, barra superior en móvil.
 * Estética más utilitaria que la tienda (fondo blanco, densidad alta) pero con
 * los mismos tokens del design system — sin librería de UI nueva.
 */

interface AdminNavItem {
  href: string;
  label: string;
}

// TODO(i18n)
const NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/catalogo", label: "Catálogo" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/home", label: "Home" },
  { href: "/admin/ajustes", label: "Ajustes" },
];

export function AdminShell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white md:flex-row">
      <header className="border-b border-line bg-cream md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:flex-col md:items-start md:gap-6 md:px-5 md:py-6">
          <Link href="/admin" className="text-lg font-bold tracking-tight text-black">
            YI
            {/* TODO(i18n) */}
            <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wide text-gray-700">
              Panel
            </span>
          </Link>

          <nav aria-label="Secciones del panel" className="md:w-full">
            <ul className="flex items-center gap-1 md:flex-col md:items-stretch md:gap-0.5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex h-11 items-center rounded-md px-3 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:mt-auto md:w-full">
            {email ? (
              <p className="hidden truncate text-xs text-gray-700 md:mb-2 md:block">
                {email}
              </p>
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
