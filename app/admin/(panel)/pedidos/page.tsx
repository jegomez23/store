import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { ContactCustomerLink } from "@/components/admin/ContactCustomerLink";
import { OrderAge } from "@/components/admin/OrderAge";
import { QuickAdvanceButton } from "@/components/admin/QuickAdvanceButton";
import { OrdersFilters } from "@/components/admin/OrdersFilters";
import {
  ordersHref,
  parseOrderListParams,
  quickNextStatus,
  totalPages,
  type OrderListParams,
} from "@/lib/admin/orders";
import { listOrders } from "@/lib/data/admin/orders";
import { requestNow } from "@/lib/admin/clock";
import { getActiveMarket } from "@/lib/markets";
import { formatPrice } from "@/lib/money/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage(
  props: PageProps<"/admin/pedidos">,
) {
  const params = parseOrderListParams(await props.searchParams);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Pedidos
        </h1>
      </header>

      <OrdersFilters params={params} />

      {/* Skeleton por <Suspense> y no por loading.tsx: ver AdminSkeleton. La
          clave del fallback incluye los filtros para que cambiar de página o de
          estado vuelva a mostrarlo. */}
      <Suspense
        key={`${params.status}-${params.query}-${params.page}`}
        fallback={<AdminSkeleton rows={6} />}
      >
        <OrdersResults params={params} />
      </Suspense>
    </div>
  );
}

async function OrdersResults({ params }: { params: OrderListParams }) {
  const market = await getActiveMarket();
  const { orders, count } = await listOrders(market, params);
  const now = requestNow();

  const pages = totalPages(count);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-700">
        {count === 0
          ? "Sin pedidos"
          : `${count} ${count === 1 ? "pedido" : "pedidos"} · mercado ${market.id}`}
      </p>

      {orders.length === 0 ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          {params.status || params.query
            ? "Ningún pedido coincide con este filtro."
            : "Todavía no hay pedidos. Aparecerán aquí en cuanto alguien complete el checkout."}
        </p>
      ) : (
        <>
          {/* Móvil: tarjetas. Una tabla de 8 columnas es ilegible en 375px. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex items-stretch gap-2 rounded-md border border-line bg-white transition-colors duration-200 ease-out focus-within:border-black"
              >
                {/* El enlace de WhatsApp va FUERA del <Link> de la tarjeta: un
                    <a> dentro de otro <a> es HTML invalido y el navegador lo
                    reescribe, dejando el boton inoperativo. */}
                <Link
                  href={`/admin/pedidos/${order.orderNumber}`}
                  className="flex min-w-0 flex-1 flex-col gap-2 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-black">
                      {order.orderNumber}
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-gray-700">
                      {order.customerName ?? "—"}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-red">
                      {formatPrice(order.total, order.currencyCode, market.locale)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-gray-400">
                    <span>
                      {/* TODO(i18n) */}
                      Entró <OrderAge iso={order.createdAt} nowMs={now} locale={market.locale} />
                      {" · en estado "}
                      <OrderAge iso={order.stateSince} nowMs={now} locale={market.locale} />
                    </span>
                    <span>
                      {order.unitCount} ud · {order.lineCount} lín · {order.channel}
                    </span>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center border-l border-line px-3">
                  <ContactCustomerLink
                    variant="compact"
                    phone={order.customerPhone}
                    status={order.status}
                    order={{
                      orderNumber: order.orderNumber,
                      customerName: order.customerName,
                      currencyCode: order.currencyCode,
                      locale: market.locale,
                      total: order.total,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabla densa. `overflow-x-auto` para que nunca desborde. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                {/* TODO(i18n) */}
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-gray-700">
                  <th scope="col" className="py-2 pr-4 font-medium">Pedido</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Entró</th>
                  {/* Antigüedad del estado actual, no del pedido. Es un hecho
                      objetivo: el panel no llama tarde a nada, porque no existe
                      ningún umbral de negocio que lo defina. */}
                  <th scope="col" className="py-2 pr-4 font-medium">En estado</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Cliente</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Teléfono</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Uds</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Total</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Canal</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Estado</th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Contactar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-line transition-colors duration-200 ease-out hover:bg-cream"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/pedidos/${order.orderNumber}`}
                        className="font-mono font-medium text-black underline-offset-2 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-700">
                      <OrderAge iso={order.createdAt} nowMs={now} locale={market.locale} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-700">
                      <OrderAge iso={order.stateSince} nowMs={now} locale={market.locale} />
                    </td>
                    <td className="max-w-[16rem] truncate py-3 pr-4 text-gray-700">
                      {order.customerName ?? "—"}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-700">
                      {order.customerPhone}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">
                      {order.unitCount}
                      <span className="text-gray-400"> / {order.lineCount}</span>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium whitespace-nowrap text-red">
                      {formatPrice(order.total, order.currencyCode, market.locale)}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{order.channel}</td>
                    <td className="py-3 pr-4">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-2">
                      <ContactCustomerLink
                        variant="compact"
                        phone={order.customerPhone}
                        status={order.status}
                        order={{
                          orderNumber: order.orderNumber,
                          customerName: order.customerName,
                          currencyCode: order.currencyCode,
                          locale: market.locale,
                          total: order.total,
                        }}
                      />
                      {quickNextStatus(order.status) ? (
                        <QuickAdvanceButton
                          orderId={order.id}
                          orderNumber={order.orderNumber}
                          next={quickNextStatus(order.status)!}
                        />
                      ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <nav
              aria-label="Paginación de pedidos"
              className="flex items-center justify-between gap-3"
            >
              {params.page > 1 ? (
                <Link
                  href={ordersHref({ ...params, page: params.page - 1 })}
                  className="flex h-11 items-center rounded-md border border-line px-4 text-sm font-medium text-black hover:border-black"
                >
                  {/* TODO(i18n) */}
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-gray-700">
                {params.page} / {pages}
              </span>
              {params.page < pages ? (
                <Link
                  href={ordersHref({ ...params, page: params.page + 1 })}
                  className="flex h-11 items-center rounded-md border border-line px-4 text-sm font-medium text-black hover:border-black"
                >
                  {/* TODO(i18n) */}
                  Siguiente
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
