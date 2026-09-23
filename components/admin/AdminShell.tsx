import Link from "next/link";
import { LogoutButton } from "@/components/admin/LogoutButton";

/**
 * Chrome del panel: navegación lateral en desktop, barra superior en móvil.
 * Estética más utilitaria que la tienda (fondo blanco, densidad alta) pero con
 * los mismos tokens del design system — sin librería de UI nueva.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAR ARRIBA, CONFIGURAR DETRÁS (incremento 20)
 * ═══════════════════════════════════════════════════════════════════════════
 * Los ocho enlaces tenían el mismo peso. Medido a 390×844: ocupaban TRES filas
 * (68→164 px) y el contenido de cualquier pantalla del panel empezaba a 245 px,
 * casi un tercio de la altura útil, gastado en recordar todo lo que el sistema
 * sabe hacer.
 *
 * Ahora se separan por frecuencia de uso real, no por área del sistema:
 *
 *   OPERAR      lo que se toca cada día: inicio, pedidos, catálogo, inventario.
 *   CONFIGURAR  lo que se toca al montar la tienda y casi nunca después:
 *               categorías, colores y tallas, home, ajustes.
 *
 * **No se ha quitado ninguna ruta**: en móvil el segundo grupo va dentro de un
 * `<details>` —HTML puro, sin JavaScript ni estado— y en escritorio, donde la
 * columna tiene sitio de sobra, se ven los dos grupos a la vez.
 */

interface AdminNavItem {
  href: string;
  label: string;
}

// TODO(i18n)
const OPERATE: readonly AdminNavItem[] = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/catalogo", label: "Catálogo" },
  { href: "/admin/inventario", label: "Inventario" },
];

// TODO(i18n)
const CONFIGURE: readonly AdminNavItem[] = [
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/atributos", label: "Colores y tallas" },
  { href: "/admin/home", label: "Home" },
  { href: "/admin/ajustes", label: "Ajustes" },
];

const LINK_CLASS =
  "flex h-11 items-center rounded-md px-3 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black";

function NavLinks({ items }: { items: readonly AdminNavItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-1 md:flex-col md:flex-nowrap md:items-stretch md:gap-0.5">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className={LINK_CLASS}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

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
        {/*
          MÓVIL: la fila se PARTE (`flex-wrap`) y la navegación baja a su
          propia línea a lo ancho. Antes, los ocho enlaces iban en una sola
          fila sin `wrap`: medido en Chrome a 390 px, el documento se iba a 833
          px de ancho y TODAS las pantallas del panel se desplazaban de lado
          mientras el administrador escribía cantidades. En escritorio la barra
          sigue siendo la columna lateral de siempre.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:flex-col md:flex-nowrap md:items-start md:gap-6 md:px-5 md:py-6">
          {/* Medido a 390×844: este enlace tenía 28 px de alto. Es el «volver al
              inicio» del panel y se pulsa con el pulgar como cualquier otro
              (docs/rules/ui.md §Objetivos táctiles). */}
          <Link
            href="/admin"
            className="flex min-h-11 items-center text-lg font-bold tracking-tight text-black"
          >
            YI
            {/* TODO(i18n) */}
            <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wide text-gray-700">
              Panel
            </span>
          </Link>

          <nav
            aria-label="Secciones del panel"
            className="order-last flex w-full flex-col gap-1 md:order-none md:gap-4"
          >
            <NavLinks items={OPERATE} />

            {/*
              La configuración se pliega —en móvil y en escritorio—: son
              pantallas que se visitan al montar la tienda, no cada día.

              `<details>` y nada más: sin estado, sin efecto, sin JavaScript, y
              el navegador ya sabe anunciarlo como expandible. **No se hace
              trampa para abrirlo en escritorio**: forzar el contenido visible
              exige tocar `::details-content` y depender de cómo lo implemente
              cada motor, y un enlace inalcanzable por un detalle de CSS es
              peor que un clic de más.
            */}
            <details>
              <summary className="flex h-11 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-gray-400 transition-colors duration-200 ease-out hover:text-black">
                {/* TODO(i18n) */}
                Configuración
              </summary>
              <div className="mt-1">
                <NavLinks items={CONFIGURE} />
              </div>
            </details>
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
