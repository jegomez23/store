import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { OrderConfirmation } from "@/components/store/checkout/OrderConfirmation";

/**
 * `/pedido/[numero]` — confirmación tras crear el pedido.
 *
 * Deliberadamente NO lee la base de datos: ver el comentario de
 * `OrderConfirmation`. Aquí solo se valida la forma del número para no
 * renderizar cualquier cadena que llegue por la URL.
 */
export const metadata: Metadata = {
  title: "Pedido registrado",
  robots: { index: false, follow: false },
};

/** Formato definido en DEC-027: `YI-<MERCADO>-<6 dígitos>`. */
const ORDER_NUMBER_RE = /^YI-[A-Z]{2}-\d{6}$/;

export default async function OrderPage(
  props: PageProps<"/pedido/[numero]">,
) {
  const { numero } = await props.params;
  const orderNumber = decodeURIComponent(numero).toUpperCase();

  if (!ORDER_NUMBER_RE.test(orderNumber)) notFound();

  return (
    <Container className="py-8 md:py-14">
      <OrderConfirmation orderNumber={orderNumber} />
    </Container>
  );
}
