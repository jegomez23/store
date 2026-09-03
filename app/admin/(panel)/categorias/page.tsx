import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { CategoryRow, NewCategoryForm } from "@/components/admin/CategoryForms";
import { listCategoriesForAdmin } from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categorías",
  robots: { index: false, follow: false },
};

export default function AdminCategoriesPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Categorías
        </h1>
        <p className="text-xs text-gray-400">
          Jerarquía de dos niveles como máximo. Una categoría con productos o
          subcategorías no se puede eliminar.
        </p>
      </header>

      {/* Skeleton por <Suspense>, no por loading.tsx (ver AdminSkeleton). */}
      <Suspense fallback={<AdminSkeleton rows={4} />}>
        <CategoryList />
      </Suspense>
    </div>
  );
}

async function CategoryList() {
  const market = await getActiveMarket();
  const categories = await listCategoriesForAdmin(market);

  // Raíces primero y cada hija bajo su madre: refleja la jerarquía real.
  const roots = categories.filter((c) => c.parentId === null);
  const ordered = roots.flatMap((root) => [
    root,
    ...categories.filter((c) => c.parentId === root.id),
  ]);
  const orphans = categories.filter((c) => !ordered.includes(c));

  return (
    <div className="flex flex-col gap-4">
      <NewCategoryForm categories={categories} />

      {categories.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Todavía no hay categorías en este mercado.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...ordered, ...orphans].map((category) => (
            <CategoryRow key={category.id} category={category} categories={categories} />
          ))}
        </ul>
      )}
    </div>
  );
}
