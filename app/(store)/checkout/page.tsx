import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { CheckoutForm } from "@/components/store/checkout/CheckoutForm";
import { getSettings } from "@/lib/data/settings";
import { listShippingMethods } from "@/lib/data/shipping";
import { getActiveMarket } from "@/lib/markets";
import { resolveSaleBlockers } from "@/lib/store/sale-status";

/**
 * `/checkout` — shell Server Component + formulario client.
 *
 * El contenido depende del carrito, que vive en localStorage: el servidor no
 * puede conocerlo, así que la página se prerenderiza vacía y `CheckoutForm` la
 * rellena tras hidratar (misma estrategia que `/carrito`).
 *
 * Los MÉTODOS DE ENTREGA sí los sabe el servidor (incremento 8) y se pasan ya
 * resueltos: nombre, precio y umbral salen de `shipping_methods` del mercado
 * activo. El navegador nunca los inventa ni los pide por su cuenta; solo
 * devuelve cuál eligió, y `create_order` vuelve a resolverlo todo contra la BD.
 */
/**
 * DINÁMICA A PROPÓSITO, y no es una precaución: MEDIDO.
 *
 * Antes del incremento 8 esta ruta salía como `○ (Static)` en el build. Al
 * pasar a leer `shipping_methods`, seguir siendo estática habría horneado los
 * precios de envío EN EL BUILD: cambiar 4,90 € en la base de datos no se vería
 * en el checkout hasta el siguiente despliegue, y el cliente vería un importe
 * distinto del que `create_order` le va a cobrar. Justo lo que este incremento
 * venía a arreglar.
 *
 * Desde el incremento 9 los métodos SÍ se editan desde una Server Action, y
 * aun así no se invalida esta ruta: al ser dinámica, cada petición ya lee la
 * configuración vigente. Es también la razón de que el estado de venta que se
 * consulta más abajo no pueda quedarse pegado.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  description: "Confirma tu pedido y continúa por WhatsApp.",
  // Contenido privado del usuario: no aporta nada a la búsqueda.
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const market = await getActiveMarket();

  /*
    ─────────────────────────────────────────────────────────────────────────
    SE PREGUNTA ANTES DE PINTAR EL FORMULARIO (incremento 16)
    ─────────────────────────────────────────────────────────────────────────
    Reproducido sobre el build servido antes de escribir esto: con el número de
    WhatsApp del seed —el estado REAL del repositorio desde DEC-065— esta página
    pintaba el checkout completo. El cliente escribía su nombre, su teléfono,
    elegía cómo quería recibirlo y pulsaba «Confirmar pedido»; solo entonces
    `WhatsAppChannel` devolvía `CHECKOUT_NOT_CONFIGURED` y aparecía un error.
    Todo el trabajo, para nada, al final del camino.

    La respuesta la da `resolveSaleBlockers`, la MISMA función que usa el panel:
    si el administrador ve «Venta bloqueada», el cliente ve que no se puede
    comprar. No hay dos criterios, así que no pueden discrepar.

    LO QUE NO SE HACE: enseñarle al cliente los `title`/`fix` de los bloqueos.
    Son instrucciones para el administrador y contarían cómo está configurada
    la tienda («no hay WhatsApp», «no hay métodos de entrega»). El cliente
    recibe un mensaje neutro y una salida.

    ─────────────────────────────────────────────────────────────────────────
    DOS CONSULTAS EN PARALELO, NO TRES (medido)
    ─────────────────────────────────────────────────────────────────────────
    Aquí NO se usa `getSaleBlockers`, que cuenta los métodos activos con una
    consulta propia: esta página necesita la LISTA de todas formas, así que
    contarlos aparte sería un viaje de más. Medido contra el proyecto real, un
    viaje de ida y vuelta a Supabase desde esta máquina cuesta ~85 ms, y con
    `getSaleBlockers` la página pasaba de un round-trip a dos secuenciales
    (p50 231 ms frente a los 130 ms de antes del incremento).

    El CRITERIO sigue siendo uno solo —`resolveSaleBlockers`, el mismo que el
    panel—; lo único que no se comparte es de dónde salen los datos, igual que
    en `/admin/ajustes`, que también los tiene ya en la mano.
  */
  const [settings, shippingMethods] = await Promise.all([
    getSettings(market),
    // Ya viene filtrada por `is_active`: es la lista que se le ofrece al
    // cliente, así que su longitud ES el número de métodos activos.
    listShippingMethods(market),
  ]);

  const blockers = resolveSaleBlockers({
    whatsappNumber: settings?.whatsappNumber,
    activeShippingMethods: shippingMethods.length,
  });

  if (blockers.length > 0) {
    return (
      <Container className="flex flex-col gap-6 py-8 md:py-14">
        {/* TODO(i18n) */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
            No podemos cerrar pedidos ahora mismo
          </h1>
          <p className="max-w-prose text-sm text-gray-700">
            Estamos ajustando la tienda y no podemos confirmar pedidos en este
            momento. Tu carrito se conserva: vuelve a intentarlo en un rato.
          </p>
        </div>
        <div>
          <Link href="/carrito">
            <Button variant="secondary">Volver al carrito</Button>
          </Link>
        </div>
      </Container>
    );
  }

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
      <CheckoutForm shippingMethods={shippingMethods} />
    </Container>
  );
}
