import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import {
  ColorRow,
  NewColorForm,
  NewSizeForm,
  SizeRow,
} from "@/components/admin/AttributeForms";
import { SIZE_GROUPS, SIZE_GROUP_LABELS, isSizeGroup } from "@/lib/admin/attributes";
import { listColorsForAdmin, listSizesForAdmin } from "@/lib/data/admin/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Colores y tallas",
  robots: { index: false, follow: false },
};

/**
 * Colores y tallas (Fase 9.5, incremento 6).
 *
 * Antes de esta pantalla, añadir un color exigía un INSERT a mano en Supabase:
 * era el único paso del alta de un producto que obligaba a salir del panel.
 *
 * NO HAY SELECTOR DE MERCADO, y no es un olvido: `colors` y `sizes` no tienen
 * `market_id` (verificado contra el proyecto real). Son catálogos globales
 * compartidos por todos los mercados.
 *
 * Cada bloque carga en su propio `<Suspense>`. Sin `loading.tsx`, que rompería
 * los 404 del panel (AI-DEVELOPMENT §12).
 */
export default function AdminAttributesPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Colores y tallas
        </h1>
        <p className="text-xs text-gray-400">
          Los valores con los que se construyen las variantes. Son comunes a
          todos los mercados. Un valor retirado deja de ofrecerse para variantes
          nuevas, pero las que ya lo usan lo conservan.
        </p>
      </header>

      <Suspense fallback={<AdminSkeleton rows={4} />}>
        <ColorsSection />
      </Suspense>

      <Suspense fallback={<AdminSkeleton rows={4} />}>
        <SizesSection />
      </Suspense>
    </div>
  );
}

async function ColorsSection() {
  const colors = await listColorsForAdmin();

  return (
    <section aria-labelledby="colores" className="flex flex-col gap-4">
      {/* TODO(i18n) */}
      <h2 id="colores" className="text-base font-medium text-black">
        Colores ({colors.length})
      </h2>

      <NewColorForm />

      {colors.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Todavía no hay colores. Crea el primero.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {colors.map((color) => (
            <ColorRow key={color.id} color={color} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function SizesSection() {
  const sizes = await listSizesForAdmin();

  return (
    <section aria-labelledby="tallas" className="flex flex-col gap-4">
      {/* TODO(i18n) */}
      <h2 id="tallas" className="text-base font-medium text-black">
        Tallas ({sizes.length})
      </h2>

      <NewSizeForm />

      {sizes.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Todavía no hay tallas. Crea la primera.
        </p>
      ) : (
        /*
          Agrupadas por `size_group`, igual que la matriz de variantes: es la
          única función que ese campo tiene hoy en todo el sistema —agrupar—,
          así que la pantalla que lo edita debe enseñarlo haciendo justo eso.
          El orden lo pone PostgreSQL (`size_group`, `sort_order`, `label`);
          aquí solo se reparte en secciones lo que ya viene ordenado.
        */
        <div className="flex flex-col gap-5">
          {SIZE_GROUPS.map((group) => {
            const rows = sizes.filter((s) => s.sizeGroup === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-gray-700">
                  {SIZE_GROUP_LABELS[group]}
                </h3>
                <ul className="flex flex-col gap-2">
                  {rows.map((size) => (
                    <SizeRow key={size.id} size={size} />
                  ))}
                </ul>
              </div>
            );
          })}

          {/*
            Defensa por si algún día el CHECK admitiera un grupo más y esta
            pantalla se quedara atrás: una talla que no encaje en ninguno de los
            tres NO se esconde. Un valor invisible sería peor que uno feo.
          */}
          {sizes.some((s) => !isSizeGroup(s.sizeGroup)) ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-red">
                {/* TODO(i18n) */}
                Grupo desconocido
              </h3>
              <ul className="flex flex-col gap-2">
                {sizes
                  .filter((s) => !isSizeGroup(s.sizeGroup))
                  .map((size) => (
                    <SizeRow key={size.id} size={size} />
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
