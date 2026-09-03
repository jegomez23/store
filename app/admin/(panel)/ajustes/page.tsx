import type { Metadata } from "next";
import { StoreSettingsForm } from "@/components/admin/StoreSettingsForm";
import { WhatsAppNumberForm } from "@/components/admin/WhatsAppNumberForm";
import { getFullSettingsForAdmin } from "@/lib/data/admin/cms";
import { getActiveMarket } from "@/lib/markets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajustes",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const market = await getActiveMarket();
  const settings = await getFullSettingsForAdmin(market);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Ajustes
        </h1>
        <p className="text-sm text-gray-700">
          {market.name} ({market.id}) · {market.currencyCode} · {market.locale}
        </p>
      </header>

      {settings === null ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Este mercado todavía no tiene una fila en `settings`. Créala antes de
          poder configurarlo.
        </p>
      ) : (
        <>
          <dl className="divide-y divide-line rounded-md border border-line bg-white px-4 py-2">
            {/* TODO(i18n) */}
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-sm text-gray-700">Moneda y locale</dt>
              <dd className="text-right text-sm text-gray-400">
                {/* Solo lectura por diseño: docs/05-ADMIN.md §4.6. */}
                {market.currencyCode} · {market.locale} (se cambian en `markets`)
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-sm text-gray-700">Logo</dt>
              <dd className="text-right text-sm text-gray-400">
                {settings.logoUrl ?? "sin logo"} · subida pendiente
              </dd>
            </div>
          </dl>

          <StoreSettingsForm settings={settings} />

          <WhatsAppNumberForm current={settings.whatsappNumber} />
        </>
      )}
    </div>
  );
}
