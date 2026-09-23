import type { Metadata } from "next";
import { AttributionCapture } from "@/components/store/AttributionCapture";
import { BottomNav } from "@/components/store/BottomNav";
import { Footer } from "@/components/store/Footer";
import { Header } from "@/components/store/Header";
import { CartProvider } from "@/lib/cart/context";
import { getCategories } from "@/lib/data/categories";
import { getStorefrontSettings } from "@/lib/data/settings";
import { getActiveMarket } from "@/lib/markets";

/**
 * EL NOMBRE DE LA TIENDA SALE DE `settings`, NO DEL CÓDIGO (incremento 16).
 *
 * Hasta aquí, «YI» estaba escrito a mano en `app/layout.tsx` (título por
 * defecto y plantilla `%s · YI`), en la metadata de la home, en el `siteName`
 * de cada ficha, en el logo del Header y en la imagen de Open Graph. El
 * administrador podía cambiar `store_name` en /admin/ajustes y **no pasaba
 * nada en ninguna pestaña del navegador ni en ningún enlace compartido**:
 * renombrar la tienda exigía tocar cinco archivos y desplegar.
 *
 * POR QUÉ AQUÍ Y NO EN EL LAYOUT RAÍZ: el layout raíz envuelve también
 * `/admin`, que es `force-dynamic` y no se indexa. Poner ahí una consulta a
 * Supabase se pagaría en cada render del panel para pintar un título que a
 * nadie le importa. El grupo `(store)` es exactamente el alcance donde la
 * marca significa algo, y el panel ya tiene su propia plantilla
 * (`app/admin/(panel)/layout.tsx`).
 *
 * COSTE MEDIDO: cero consultas nuevas. `getStorefrontSettings` es `cache()` de
 * React y el layout ya la llamaba para el footer, así que `generateMetadata` y
 * el render comparten el resultado dentro de la misma petición.
 */
export async function generateMetadata(): Promise<Metadata> {
  const market = await getActiveMarket();
  const settings = await getStorefrontSettings(market);

  // Sin fila de `settings` no se inventa una marca: se deja que herede lo que
  // haya definido cada página. Es un estado que no debería existir (la fila es
  // 1:1 con el mercado) y taparlo con un nombre falso lo escondería.
  if (!settings) return {};

  return {
    title: { default: settings.storeName, template: `%s · ${settings.storeName}` },
    ...(settings.tagline ? { description: settings.tagline } : {}),
  };
}

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const market = await getActiveMarket();
  // Dos consultas independientes, en paralelo. La identidad de la tienda
  // (nombre, frase, contacto y redes) la edita el administrador en
  // /admin/ajustes y la consumen el Header, el Footer y la metadata.
  const [categories, settings] = await Promise.all([
    getCategories(market),
    getStorefrontSettings(market),
  ]);

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
      {/*
        Atribución (incremento 14): un efecto de cliente que mira la query de
        entrada UNA vez por carga y guarda la primera campaña de la sesión. No
        pinta nada y no toca el HTML servido, así que la tienda sigue siendo
        estática con ISR: la misma página cacheada vale para todas las
        campañas.
      */}
      <AttributionCapture />
      <Header
        categories={categories}
        storeName={settings?.storeName ?? null}
        logoUrl={settings?.logoUrl ?? null}
      />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer settings={settings} />
      <BottomNav />
    </CartProvider>
  );
}
