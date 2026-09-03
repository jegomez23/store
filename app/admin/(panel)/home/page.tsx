import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { HomeBlockCard, NewHomeBlockForm } from "@/components/admin/HomeBlockForms";
import { listHomeBlocksForAdmin } from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export default function AdminHomePage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Contenido de la home
        </h1>
        <p className="text-xs text-gray-400">
          Los tres tipos de bloque que soporta la tienda: hero, banner y franja
          promocional. Las imágenes de estos bloques todavía no se gestionan
          desde el panel.
        </p>
      </header>

      {/* Skeleton por <Suspense>, no por loading.tsx (ver AdminSkeleton). */}
      <Suspense fallback={<AdminSkeleton rows={3} />}>
        <HomeBlockList />
      </Suspense>
    </div>
  );
}

async function HomeBlockList() {
  const market = await getActiveMarket();
  const blocks = await listHomeBlocksForAdmin(market);

  return (
    <div className="flex flex-col gap-4">
      <NewHomeBlockForm />

      {blocks.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Todavía no hay bloques en la home de este mercado.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {blocks.map((block) => (
            <HomeBlockCard key={block.id} block={block} />
          ))}
        </ul>
      )}
    </div>
  );
}
