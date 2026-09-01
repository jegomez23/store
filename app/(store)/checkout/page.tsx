import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CheckoutForm } from "@/components/store/checkout/CheckoutForm";

/**
 * `/checkout` — shell Server Component + formulario client.
 *
 * El contenido depende del carrito, que vive en localStorage: el servidor no
 * puede conocerlo, así que la página se prerenderiza vacía y `CheckoutForm` la
 * rellena tras hidratar (misma estrategia que `/carrito`).
 */
export const metadata: Metadata = {
  title: "Finalizar pedido",
  description: "Confirma tu pedido y continúa por WhatsApp.",
  // Contenido privado del usuario: no aporta nada a la búsqueda.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <Container className="flex flex-col gap-6 py-8 md:py-14">
      {/* TODO(i18n): centralizar copy cuando exista lib/i18n (DEC-013). */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
          Finalizar pedido
        </h1>
        <p className="text-sm text-gray-700">
          Déjanos tus datos y cerramos el pedido contigo por WhatsApp.
        </p>
      </div>
      <CheckoutForm />
    </Container>
  );
}
