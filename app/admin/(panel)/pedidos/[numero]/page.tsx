import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { OrderStatusForm } from "@/components/admin/OrderStatusForm";
import { ContactCustomerLink } from "@/components/admin/ContactCustomerLink";
import { OrderAge } from "@/components/admin/OrderAge";
import { OrderNoteForm } from "@/components/admin/OrderNoteForm";
import {
  ORDER_STATUS_LABELS,
  nextStatusesFor,
  normalizeOrderQuery,
} from "@/lib/admin/orders";
import { buildTimeline, repeatCustomerLabel } from "@/lib/admin/timeline";
import { getOrderByNumber } from "@/lib/data/admin/orders";
import { requestNow } from "@/lib/admin/clock";
import { getActiveMarket } from "@/lib/markets";
import { formatPrice } from "@/lib/money/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedido",
  robots: { index: false, follow: false },
};

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-gray-700">{label}</dt>
      <dd className="text-right text-sm text-black">{children}</dd>
    </div>
  );
}

export default async function AdminOrderDetailPage(
  props: PageProps<"/admin/pedidos/[numero]">,
) {
  const { numero } = await props.params;
  const market = await getActiveMarket();

  // Se normaliza igual que la búsqueda: un parámetro de ruta es input no
  // confiable. Si no queda nada utilizable, 404 sin tocar la BD.
  const orderNumber = normalizeOrderQuery(decodeURIComponent(numero));
  if (!orderNumber) notFound();

  const order = await getOrderByNumber(market, orderNumber);
  if (!order) notFound();

  const now = requestNow();
  const timeline = buildTimeline(order.events, order.internalNotes);
  const repeatLabel = repeatCustomerLabel(order.customerOrderCount);

  const money = (amount: number) =>
    formatPrice(amount, order.currencyCode, market.locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/pedidos"
          className="text-sm text-gray-700 underline-offset-2 hover:text-black hover:underline"
        >
          {/* TODO(i18n) */}
          ← Pedidos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold tracking-tight text-black md:text-2xl">
            {order.orderNumber}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        {/*
          Antiguedad y fecha exacta juntas: la relativa para decidir de un
          vistazo, la exacta para hablar con el cliente. El estado actual lleva
          su propia antiguedad, que es la que dice si algo lleva parado — sin
          calificarlo de tarde, que seria un umbral que nadie ha definido.
        */}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-700">
          <span>{formatDateTime(order.createdAt, market.locale)}</span>
          <span className="text-gray-400">·</span>
          <OrderAge iso={order.createdAt} nowMs={now} locale={market.locale} />
          <span className="text-gray-400">·</span>
          <span>{order.channel}</span>
        </p>
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          En {ORDER_STATUS_LABELS[order.status].toLowerCase()} desde{" "}
          <OrderAge iso={order.updatedAt} nowMs={now} locale={market.locale} />
        </p>
      </div>

      {/*
        Contactar va ANTES de cambiar el estado, y no es casual: el orden de la
        pantalla refleja el orden real del trabajo. Primero se habla con el
        cliente por WhatsApp y solo después se registra lo que pasó.
      */}
      <section
        aria-labelledby="contactar"
        className="flex flex-col gap-3 rounded-md border border-line bg-white p-4"
      >
        {/* TODO(i18n) */}
        <h2 id="contactar" className="text-sm font-medium text-black">
          Contactar
        </h2>
        <ContactCustomerLink
          phone={order.customerPhone}
          status={order.status}
          order={{
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            currencyCode: order.currencyCode,
            locale: market.locale,
            total: order.total,
            lines: order.lines,
          }}
        />
      </section>

      <section
        aria-labelledby="cambiar-estado"
        className="flex flex-col gap-3 rounded-md border border-line bg-cream p-4"
      >
        {/* TODO(i18n) */}
        <h2 id="cambiar-estado" className="text-sm font-medium text-black">
          Cambiar estado
        </h2>
        <OrderStatusForm
          orderId={order.id}
          orderNumber={order.orderNumber}
          currentStatus={order.status}
          nextStatuses={nextStatusesFor(order.status)}
        />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="cliente" className="flex flex-col gap-2">
          {/* TODO(i18n) */}
          <h2 id="cliente" className="text-sm font-medium text-black">
            Cliente
          </h2>
          <dl className="divide-y divide-line rounded-md border border-line bg-white px-4 py-2">
            <Row label="Nombre">
              {order.customerName ?? "—"}
              {/*
                Señal de cliente recurrente. Es un HECHO, no una categoría
                comercial: `customers` es única por (mercado, teléfono), así que
                quien vuelve es la misma fila y el recuento es exacto. No hay
                "cliente VIP" ni umbral de fidelidad, porque nadie los ha
                definido; solo el número, que es lo que cambia el tono del
                mensaje que el admin está a punto de escribir.
              */}
              {repeatLabel ? (
                <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs text-gray-700">
                  {repeatLabel}
                </span>
              ) : null}
            </Row>
            <Row label="Teléfono">
              <a
                href={`tel:${order.customerPhone}`}
                className="underline-offset-2 hover:underline"
              >
                {order.customerPhone}
              </a>
            </Row>
            <Row label="Email">{order.customerEmail ?? "—"}</Row>
            <Row label="Origen">
              {order.sourceUrl ? (
                <span className="break-all text-xs text-gray-700">
                  {order.sourceUrl}
                </span>
              ) : (
                "—"
              )}
            </Row>
          </dl>
        </section>

        <section aria-labelledby="totales" className="flex flex-col gap-2">
          {/* TODO(i18n) */}
          <h2 id="totales" className="text-sm font-medium text-black">
            Totales
          </h2>
          <dl className="divide-y divide-line rounded-md border border-line bg-white px-4 py-2">
            <Row label="Subtotal">{money(order.subtotal)}</Row>
            <Row label="Descuento">
              {order.discountTotal > 0 ? `−${money(order.discountTotal)}` : "—"}
            </Row>
            <Row label="Envío">
              {order.shippingTotal > 0 ? money(order.shippingTotal) : "—"}
            </Row>
            <Row label="Total">
              <strong className="text-red">{money(order.total)}</strong>
            </Row>
            <Row label="Moneda">{order.currencyCode}</Row>
          </dl>
        </section>
      </div>

      <section aria-labelledby="lineas" className="flex flex-col gap-2">
        {/* TODO(i18n) */}
        <h2 id="lineas" className="text-sm font-medium text-black">
          Líneas ({order.lines.length})
        </h2>
        <p className="text-xs text-gray-400">
          {/* TODO(i18n) */}
          Datos guardados en el momento de la compra. No se recalculan contra el
          catálogo actual: si el producto cambió de precio o de nombre, aquí
          sigue lo que se vendió.
        </p>
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* TODO(i18n) */}
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-gray-700">
                <th scope="col" className="px-4 py-2 font-medium">Producto</th>
                <th scope="col" className="px-4 py-2 font-medium">Color</th>
                <th scope="col" className="px-4 py-2 font-medium">Talla</th>
                <th scope="col" className="px-4 py-2 font-medium">SKU</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Precio</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Uds</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-black">
                    {line.productName}
                    {line.variantId === null ? (
                      <span
                        className="ml-2 text-xs text-gray-400"
                        title="La variante ya no existe en el catálogo"
                      >
                        {/* TODO(i18n) */}
                        (variante eliminada)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{line.colorName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{line.sizeLabel ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {line.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">
                    {money(line.unitPrice)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {line.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap text-black">
                    {money(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/*
        EXPEDIENTE (Fase 9.5, 5A). Un solo hilo: los eventos de estado y las
        notas internas se guardan en tablas separadas a propósito —ver la
        migración 0027— pero el administrador no piensa en tablas, piensa en
        "qué ha pasado con este pedido". La mezcla es de presentación y la hace
        `buildTimeline`, que es donde se puede probar el desempate.

        La caja de escribir va ARRIBA del hilo, no al final: cuando hay quince
        entradas, obligar a bajar hasta el fondo para apuntar la dirección que
        el cliente acaba de mandar es exactamente el tipo de fricción que este
        incremento venía a quitar.
      */}
      <section aria-labelledby="expediente" className="flex flex-col gap-3">
        {/* TODO(i18n) */}
        <h2 id="expediente" className="text-sm font-medium text-black">
          Expediente
        </h2>

        <div className="rounded-md border border-line bg-cream p-4">
          <OrderNoteForm orderNumber={order.orderNumber} />
        </div>

        <ol className="flex flex-col gap-2">
          {timeline.map((entry) =>
            entry.kind === "note" ? (
              <li
                key={`note-${entry.id}`}
                className="flex flex-col gap-1 rounded-md border border-line border-l-2 border-l-black bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-700">
                    {/* TODO(i18n) */}
                    Nota interna
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(entry.createdAt, market.locale)}
                  </span>
                </div>
                {/* `whitespace-pre-wrap`: una dirección pegada del chat viene con
                    saltos de línea y debe conservarlos. */}
                <p className="whitespace-pre-wrap text-sm text-black">
                  {entry.body}
                </p>
                <p className="text-xs text-gray-400">
                  {/* TODO(i18n) */}
                  {entry.authorName ?? "Administrador"}
                </p>
              </li>
            ) : (
              <li
                key={`event-${entry.id}`}
                className="flex flex-col gap-1 rounded-md border border-line bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-black">
                    {entry.fromStatus
                      ? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ${ORDER_STATUS_LABELS[entry.toStatus]}`
                      : /* TODO(i18n) */ `Pedido creado (${ORDER_STATUS_LABELS[entry.toStatus]})`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(entry.createdAt, market.locale)}
                  </span>
                </div>
                {entry.note ? (
                  <p className="text-sm text-gray-700">{entry.note}</p>
                ) : null}
                <p className="text-xs text-gray-400">
                  {/* TODO(i18n) */}
                  {entry.actorId
                    ? "Cambio manual del administrador"
                    : "Automático (checkout)"}
                </p>
              </li>
            ),
          )}
        </ol>
      </section>
    </div>
  );
}
