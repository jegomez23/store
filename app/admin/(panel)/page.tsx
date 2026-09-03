import { Suspense } from "react";
import Link from "next/link";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { ContactCustomerLink } from "@/components/admin/ContactCustomerLink";
import { OrderAge } from "@/components/admin/OrderAge";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { QuickAdvanceButton } from "@/components/admin/QuickAdvanceButton";
import {
  ORDER_STATUS_LABELS,
  OPEN_STATUSES,
  ordersHref,
  quickNextStatus,
} from "@/lib/admin/orders";
import { getOperationsSummary, listOperationalQueue } from "@/lib/data/admin/orders";
import { listLowStockVariants } from "@/lib/data/admin/catalog";
import { requestNow } from "@/lib/admin/clock";
import { getActiveMarket } from "@/lib/markets";
import { formatPrice } from "@/lib/money/format";

export const dynamic = "force-dynamic";

/**
 * CENTRO OPERATIVO (Fase 9.5, Incremento 3).
 *
 * Responde a una sola pregunta: **¿qué tengo que atender ahora?**
 *
 * Por eso lo primero de la página es una COLA DE TRABAJO con los pedidos
 * abiertos —el que lleva más tiempo sin moverse arriba— y con sus dos acciones
 * al lado: escribir al cliente y avanzar el estado. No hay que abrir el pedido
 * para actuar sobre él.
 *
 * QUÉ NO HAY, Y ES DELIBERADO:
 *
 * - **Ninguna gráfica.** Ninguna decisión operativa de esta tienda se toma
 *   mirando una curva.
 * - **Ningún "atrasado" ni "urgente".** Marcar un pedido como tarde exige un
 *   umbral que el negocio no ha definido. Se muestra la antigüedad real y se
 *   ordena por ella: el más antiguo queda arriba porque LO ES, no porque una
 *   regla inventada lo declare urgente.
 * - **Ningún panel de números gigantes.** Los contadores por estado siguen
 *   estando, pero abajo y en pequeño: informan, no dirigen. Lo que dirige es la
 *   cola.
 *
 * Cada bloque carga en su propio `<Suspense>`: que falle el catálogo no puede
 * dejar al admin sin ver los pedidos. Sin `loading.tsx`, que rompería los 404
 * del panel (AI-DEVELOPMENT §12).
 */
export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Qué atender ahora
        </h1>
      </header>

      <Suspense fallback={<AdminSkeleton rows={5} />}>
        <WorkQueue />
      </Suspense>

      <Suspense fallback={<AdminSkeleton rows={3} />}>
        <StockAndCatalog />
      </Suspense>

      <Suspense fallback={<AdminSkeleton rows={1} />}>
        <StatusCounters />
      </Suspense>
    </div>
  );
}

/* ─────────────────────────────── Cola de trabajo ────────────────────────── */

async function WorkQueue() {
  const market = await getActiveMarket();
  const queue = await listOperationalQueue(market);
  const now = requestNow();

  if (queue.length === 0) {
    return (
      <section aria-labelledby="cola" className="flex flex-col gap-3">
        <h2 id="cola" className="text-sm font-medium text-black">
          {/* TODO(i18n) */}
          Pedidos abiertos
        </h2>
        {/* Vacío BUENO: no es un hueco, es la señal de que no hay nada que hacer. */}
        <p className="rounded-md border border-line bg-cream px-4 py-6 text-sm text-black">
          {/* TODO(i18n) */}
          Nada pendiente. Todos los pedidos están entregados o cancelados.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="cola" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="cola" className="text-sm font-medium text-black">
          {/* TODO(i18n) */}
          Pedidos abiertos
        </h2>
        <Link
          href="/admin/pedidos"
          className="text-sm text-gray-700 underline-offset-2 hover:text-black hover:underline"
        >
          {/* TODO(i18n) */}
          Ver todos
        </Link>
      </div>
      <p className="text-xs text-gray-400">
        {/* TODO(i18n) */}
        Ordenados por tiempo en su estado actual. El primero es el que lleva más
        esperando.
      </p>

      <ul className="flex flex-col gap-2">
        {queue.map((order, index) => {
          const next = quickNextStatus(order.status);
          return (
            <li
              key={order.id}
              className="flex flex-col gap-3 rounded-md border border-line bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/pedidos/${order.orderNumber}`}
                    className="font-mono text-sm font-medium text-black underline-offset-2 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <OrderStatusBadge status={order.status} />
                  {index === 0 ? (
                    // Etiqueta NEUTRA: enuncia un hecho comprobable, no un juicio.
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {/* TODO(i18n) */}
                      el más antiguo
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm text-gray-700">
                  {order.customerName ?? "—"} ·{" "}
                  {formatPrice(order.total, order.currencyCode, market.locale)}
                </p>
                <p className="text-xs text-gray-400">
                  {/* TODO(i18n) */}
                  En {ORDER_STATUS_LABELS[order.status].toLowerCase()} desde{" "}
                  <OrderAge iso={order.stateSince} nowMs={now} locale={market.locale} />
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
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
                {next ? (
                  <QuickAdvanceButton
                    orderId={order.id}
                    orderNumber={order.orderNumber}
                    next={next}
                  />
                ) : (
                  <Link
                    href={`/admin/pedidos/${order.orderNumber}`}
                    className="flex h-9 items-center whitespace-nowrap rounded-full border border-line px-3 text-xs font-medium text-gray-700 hover:border-black hover:text-black"
                  >
                    {/* TODO(i18n) */}
                    Abrir
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ──────────────────────── Stock y salud del catálogo ────────────────────── */

async function StockAndCatalog() {
  const market = await getActiveMarket();
  const [summary, lowStock] = await Promise.all([
    getOperationsSummary(market),
    listLowStockVariants(market),
  ]);

  return (
    <section aria-labelledby="catalogo" className="flex flex-col gap-3">
      <h2 id="catalogo" className="text-sm font-medium text-black">
        {/* TODO(i18n) */}
        Catálogo
      </h2>

      {summary.unsellableProducts > 0 ? (
        // Este SÍ lleva rojo: no es una opinión sobre el tiempo, es un hecho
        // comprobable —el producto está publicado y no se puede comprar— y el
        // fallo lo descubre el cliente.
        // El enlace lleva al FILTRO que muestra exactamente esos productos, no
        // a la lista de todos los activos: un aviso que no lleva a su causa
        // obliga a repetir a mano el trabajo que ya se hizo en SQL (Fase 9.5,
        // 5B). Ambos números salen del mismo predicado, así que no discrepan.
        <Link
          href="/admin/catalogo?ver=no-vendibles"
          className="rounded-md border border-red bg-white px-4 py-3 text-sm text-black transition-colors duration-200 ease-out hover:bg-cream"
        >
          {/* TODO(i18n) */}
          <strong className="text-red">
            {summary.unsellableProducts}{" "}
            {summary.unsellableProducts === 1 ? "producto" : "productos"}
          </strong>{" "}
          {summary.unsellableProducts === 1 ? "está publicado" : "están publicados"}{" "}
          y no se {summary.unsellableProducts === 1 ? "puede" : "pueden"} comprar.{" "}
          <span className="text-gray-700">Ver cuáles →</span>
        </Link>
      ) : null}

      {lowStock.length === 0 ? (
        <p className="text-sm text-gray-700">
          {/* TODO(i18n) */}
          Ninguna variante activa está por debajo de su umbral.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {lowStock.map((variant) => (
              <li key={variant.variantId}>
                <Link
                  href={`/admin/catalogo/${variant.productId}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-line bg-white px-4 py-2.5 transition-colors duration-200 ease-out hover:border-black"
                >
                  <span className="text-sm text-black">
                    {variant.productName}
                    {variant.colorName || variant.sizeLabel ? (
                      <span className="text-gray-700">
                        {" · "}
                        {[variant.colorName, variant.sizeLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs text-gray-400">{variant.sku}</span>
                  <span
                    className={`text-sm font-medium ${
                      variant.stock === 0 ? "text-red" : "text-black"
                    }`}
                  >
                    {/* TODO(i18n) */}
                    {variant.stock === 0 ? "Agotado" : `${variant.stock} uds`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {summary.lowStockVariants > lowStock.length ? (
            <p className="text-xs text-gray-400">
              {/* TODO(i18n) */}
              {lowStock.length} de {summary.lowStockVariants} variantes bajo umbral.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ─────────────────────────── Contadores (contexto) ──────────────────────── */

async function StatusCounters() {
  const market = await getActiveMarket();
  const summary = await getOperationsSummary(market);

  if (summary.ordersTotal === 0) {
    return (
      <section aria-labelledby="contadores" className="flex flex-col gap-2">
        <h2 id="contadores" className="text-sm font-medium text-black">
          {/* TODO(i18n) */}
          Por estado
        </h2>
        <p className="text-sm text-gray-700">
          {/* TODO(i18n) */}
          Todavía no ha entrado ningún pedido. Aparecerán aquí en cuanto alguien
          complete el checkout.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="contadores" className="flex flex-col gap-2">
      <h2 id="contadores" className="text-sm font-medium text-black">
        {/* TODO(i18n) */}
        Por estado
      </h2>
      {/* Contexto, no protagonista: tipografía pequeña y sin tarjetas grandes.
          Informan de cuántas cosas existen; lo que hay que hacer está arriba. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {OPEN_STATUSES.map((status) => (
          <li key={status}>
            <Link
              href={ordersHref({ status })}
              className="text-gray-700 underline-offset-2 hover:text-black hover:underline"
            >
              {ORDER_STATUS_LABELS[status]}{" "}
              <span className="font-medium text-black">
                {summary.byStatus[status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400">
        {/* TODO(i18n) */}
        {summary.byStatus.delivered} entregados · {summary.byStatus.cancelled}{" "}
        cancelados · {summary.ordersTotal} en total
      </p>
    </section>
  );
}
