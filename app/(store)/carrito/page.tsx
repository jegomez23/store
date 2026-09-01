import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CartContents } from "@/components/store/cart/CartContents";

/**
 * `/carrito` — shell Server Component + cuerpo client (docs/02-ARCHITECTURE.md
 * §3: ruta dinámica porque su contenido es estado local del usuario).
 *
 * La página no lee el carrito: vive en localStorage y solo existe en cliente.
 * Por eso no hay `generateStaticParams` ni fetch a Supabase aquí.
 */
export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisa los productos que has añadido a tu carrito.",
  // El carrito es contenido privado del usuario y no aporta nada a la búsqueda.
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <Container className="flex flex-col gap-6 py-8 md:py-14">
      {/* TODO(i18n): centralizar copy cuando exista lib/i18n (DEC-013). */}
      <h1 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
        Tu carrito
      </h1>
      <CartContents />
    </Container>
  );
}
