import { BottomNav } from "@/components/store/BottomNav";
import { Footer } from "@/components/store/Footer";
import { Header } from "@/components/store/Header";
import { getCategories } from "@/lib/data/categories";
import { getActiveMarket } from "@/lib/markets";

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const market = await getActiveMarket();
  const categories = await getCategories(market);

  return (
    <>
      <Header categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
      <BottomNav />
    </>
  );
}
