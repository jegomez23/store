import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CartContents } from "@/components/store/cart/CartContents";
import { listShippingMethods } from "@/lib/data/shipping";
import { summarizeShipping } from "@/lib/checkout/shipping-summary";
import { getActiveMarket } from "@/lib/markets";

/**
 * `/carrito` — shell Server Component + cuerpo client (docs/02-ARCHITECTURE.md
 * §3: ruta dinámica porque su contenido es estado local del usuario).
 *
 * La página no lee el carrito: vive en localStorage y solo existe en cliente.
 *
 * INCREMENTO 19: sí lee los MÉTODOS DE ENVÍO, que son dato de servidor. Se
 * resuelven aquí y bajan como props para que el cuerpo cliente no consulte
 * Supabase (docs/rules/architecture.md #10) y no se añada JavaScript.
 */
/*
  ISR de 5 minutos, igual que la home y las fichas (DEC-004).

  ⚠️ SIN ESTO, EL PRECIO DE ENVÍO SE HORNEABA EN EL BUILD. Al empezar a leer
  `shipping_methods` en esta página, Next la seguía marcando `○ (Static)` sin
  revalidación: el importe quedaría congelado hasta el siguiente despliegue. Es
  exactamente el fallo que el incremento 8 midió en `/checkout`, y se corrige
  por partida doble: esta cadencia + la invalidación que ahora hacen las
  acciones de métodos de entrega (`revalidateStorefront`).
*/
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisa los productos que has añadido a tu carrito.",
  // El carrito es contenido privado del usuario y no aporta nada a la búsqueda.
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  const market = await getActiveMarket();
  const shipping = summarizeShipping(await listShippingMethods(market));

  return (
    <Container className="flex flex-col gap-6 py-8 md:py-14">
      {/* TODO(i18n): centralizar copy cuando exista lib/i18n (DEC-013). */}
      <h1 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
        Tu carrito
      </h1>
      <CartContents shipping={shipping} />
    </Container>
  );
}
