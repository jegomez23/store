import { BottomNav } from "@/components/store/BottomNav";
import { Footer } from "@/components/store/Footer";
import { Header } from "@/components/store/Header";
import { CartProvider } from "@/lib/cart/context";
import { getCategories } from "@/lib/data/categories";
import { getActiveMarket } from "@/lib/markets";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const market = await getActiveMarket();
  const categories = await getCategories(market);

  return (
    // CartProvider es un Client Component, pero `children` se pasa como prop ya
    // renderizada en servidor: envolver aquí NO convierte las páginas en
    // cliente (docs/rules/architecture.md #10). El mercado se resuelve en
    // servidor y baja como dato, para que el carrito nunca consulte Supabase.
    <CartProvider
      market={{
        id: market.id,
        currencyCode: market.currencyCode,
        locale: market.locale,
      }}
    >
      <Header categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
      <BottomNav />
    </CartProvider>
  );
}
