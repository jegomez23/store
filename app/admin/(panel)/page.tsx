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
import {
  countProductsWithBrokenImages,
  countProductsWithoutImage,
  listLowStockVariants,
} from "@/lib/data/admin/catalog";
import { requestNow } from "@/lib/admin/clock";
import { getActiveMarket } from "@/lib/markets";
import { SaleStatus } from "@/components/admin/SaleStatus";
import { getSaleChecklist } from "@/lib/store/sale-status-data";
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INCREMENTO 20: LOS BLOQUES VACÍOS DEJAN DE OCUPAR SITIO
 * ═══════════════════════════════════════════════════════════════════════════
 * Medido a 390×844 antes de este cambio: cuatro secciones con título, y TRES
 * de ellas diciendo que no hay nada que hacer («ninguna variante bajo umbral»,
 * «todavía no ha entrado ningún pedido»…). El único aviso real —4 productos
 * publicados sin foto— caía a 825 px, fuera de la primera pantalla, empujado
 * por títulos que no informaban de nada.
 *
 * Ahora un bloque sin contenido **no se pinta**. La excepción es la cola de
 * pedidos: ahí el vacío ES la información («no hay nada pendiente»), y es la
 * pregunta que el administrador viene a hacerle a esta pantalla.
 *
 * Y lo primero visible pasa a ser la acción que más veces se va a usar en una
 * tienda que todavía se está llenando: **añadir un producto**. Antes no estaba
 * en ninguna parte de esta página.
 */
export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Inicio
        </h1>

        {/*
          ACCIÓN PRIMARIA, y única en rojo de la pantalla (docs/rules/ui.md
          §Uso del rojo). Los avisos de abajo son tarjetas, no CTA.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/catalogo/nuevo"
            className="inline-flex h-12 items-center justify-center rounded-full bg-red px-5 text-sm font-medium text-white transition-colors duration-200 ease-out hover:bg-red-dark md:h-11"
          >
            {/* TODO(i18n) */}
            + Añadir producto
          </Link>
          <Link
            href="/admin/catalogo"
            className="inline-flex min-h-11 items-center text-sm text-gray-700 underline-offset-2 hover:text-black hover:underline"
          >
            {/* TODO(i18n) */}
            Ver catálogo
          </Link>
        </div>
      </header>

      {/*
        LO PRIMERO DESPUÉS DE LA ACCIÓN (incremento 10): si la tienda no puede
        recibir un pedido, todo lo demás es secundario. Va en su propio
        Suspense para que un fallo aquí no deje al admin sin ver los pedidos.
      */}
      <Suspense fallback={null}>
        <StoreReadiness />
      </Suspense>

      <Suspense fallback={<AdminSkeleton rows={5} />}>
        <WorkQueue />
      </Suspense>

      <Suspense fallback={null}>
        <NeedsAttention />
      </Suspense>

      <Suspense fallback={null}>
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
        {/*
          Vacío BUENO: no es un hueco, es la señal de que no hay nada que hacer,
          y es la pregunta que trae al administrador aquí. Por eso este bloque
          SÍ se pinta vacío, al revés que los de abajo.

          El texto no afirma que haya pedidos entregados —con cero pedidos era
          falso—: dice solo lo que se ha comprobado.
        */}
        <p className="rounded-md border border-line bg-cream px-4 py-6 text-sm text-black">
          {/* TODO(i18n) */}
          Ningún pedido pendiente de atender.
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

/**
 * Problemas REALES del catálogo. Si no hay ninguno, no se pinta nada.
 *
 * Antes esta sección tenía siempre su título y, sin problemas, una línea que
 * decía «ninguna variante activa está por debajo de su umbral». Esa frase no
 * le sirve a nadie para hacer nada: solo recuerda que el sistema sabe mirar el
 * stock. Ocupaba la mitad de la primera pantalla del móvil y empujaba abajo el
 * aviso que sí importaba (incremento 20).
 */
async function NeedsAttention() {
  const market = await getActiveMarket();
  // Tres consultas independientes del mismo bloque, en paralelo. El recuento de
  // "sin foto" NO viaja dentro de `admin_operations_summary`: es un contador
  // distinto de un problema distinto, y meterlo allí habría obligado a tocar
  // la migración 0023 para nada.
  const [summary, lowStock, withoutImage, brokenImages] = await Promise.all([
    getOperationsSummary(market),
    listLowStockVariants(market),
    countProductsWithoutImage(market),
    countProductsWithBrokenImages(market),
  ]);

  // Nada que atender → nada que pintar. El silencio es la respuesta.
  if (
    summary.unsellableProducts === 0 &&
    withoutImage === 0 &&
    brokenImages === 0 &&
    lowStock.length === 0
  ) {
    return null;
  }

  return (
    <section aria-labelledby="catalogo" className="flex flex-col gap-3">
      <h2 id="catalogo" className="text-sm font-medium text-black">
        {/* TODO(i18n) */}
        Necesita atención
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

      {/*
        SIN FOTO (incremento P2). Aviso APARTE del de arriba y deliberadamente
        NEUTRO —borde normal, sin rojo, sin «urgente»—, porque es otra cosa:
        estos productos se compran perfectamente, solo que el cliente los ve
        como un recuadro gris. Sumarlo al contador rojo haría que ese rojo
        dejara de significar «no se puede comprar», que es lo único que hoy
        significa. Y no bloquea publicar: no es una regla de publicación.
      */}
      {withoutImage > 0 ? (
        <Link
          href="/admin/catalogo?ver=sin-foto"
          className="rounded-md border border-line bg-white px-4 py-3 text-sm text-black transition-colors duration-200 ease-out hover:bg-cream"
        >
          {/* TODO(i18n) */}
          <strong>{withoutImage}</strong>{" "}
          {withoutImage === 1 ? "producto publicado no tiene" : "productos publicados no tienen"}{" "}
          ninguna foto. <span className="text-gray-700">Ver cuáles →</span>
        </Link>
      ) : null}

      {/*
        FOTO ROTA (incremento 10). Tercer aviso, distinto de los dos de arriba.
        Aquí la fila de imagen SÍ existe —así que P2 da el producto por
        fotografiado— pero el objeto no está en Storage: el cliente ve un hueco
        y `og:image` sirve un 400.

        NEUTRO como el de "sin foto", no rojo: el producto se compra igual, y el
        rojo de esta pantalla significa solo «no se puede comprar». Lo que lo
        hace peor que "sin foto" no es la gravedad, es que el panel afirmaba lo
        contrario; por eso el texto dice «apunta a una foto que ya no está».
      */}
      {brokenImages > 0 ? (
        <Link
          href="/admin/catalogo?ver=foto-rota"
          className="rounded-md border border-line bg-white px-4 py-3 text-sm text-black transition-colors duration-200 ease-out hover:bg-cream"
        >
          {/* TODO(i18n) */}
          <strong>{brokenImages}</strong>{" "}
          {brokenImages === 1 ? "producto apunta" : "productos apuntan"} a una foto
          que ya no está en el almacenamiento: el cliente ve un hueco.{" "}
          <span className="text-gray-700">Ver cuáles →</span>
        </Link>
      ) : null}

      {lowStock.length === 0 ? null : (
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

  /*
    Sin pedidos no hay nada que contar: antes se pintaba un título y una frase
    explicando que aparecerían pedidos cuando alguien comprase. Eso no es
    información operativa, es el sistema describiéndose a sí mismo
    (incremento 20).
  */
  if (summary.ordersTotal === 0) return null;

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

/**
 * ¿PUEDE LA TIENDA RECIBIR UN PEDIDO? (incremento 10)
 *
 * Hasta este incremento la respuesta era NO y no había forma de saberlo: el
 * número de WhatsApp seguía siendo el del seed (`34600000000`), el checkout lo
 * daba por válido —tiene 11 dígitos— y mandaba al cliente a un chat que no es
 * el de la tienda. El pedido quedaba `pending` y nadie se enteraba.
 *
 * Desde DEC-065 el checkout se niega a vender en ese estado, así que este aviso
 * no es informativo: explica por qué la tienda no está vendiendo. De ahí el
 * rojo, que en este panel significa exactamente eso.
 *
 * INCREMENTO 15: la respuesta ya no se calcula aquí. `resolveSaleBlockers`
 * (a través de `getSaleBlockers`, incremento 16)
 * (`lib/store/sale-status.ts`) es la ÚNICA definición de «se puede vender», y
 * suma el segundo bloqueo real que este aviso no miraba: sin ningún método de
 * entrega activo tampoco se puede completar un pedido. Si el panel dijera
 * «listo» mientras el cliente no puede comprar, el aviso sería peor que no
 * tenerlo.
 */
async function StoreReadiness() {
  const market = await getActiveMarket();

  // INCREMENTO 16: la carga también deja de estar copiada. `getSaleBlockers`
  // hace las dos consultas y llama a `resolveSaleBlockers`; `/checkout` usa
  // exactamente la misma función, así que el panel y la tienda no pueden
  // responder cosas distintas a la misma pregunta.
  const checks = await getSaleChecklist(market);

  // Cuando la tienda vende, este panel no dice nada: el resumen es para lo que
  // hay que atender, y "todo bien" no es una tarea. El estado completo vive
  // en /admin/ajustes, que desde el incremento 17 lo enseña como lista.
  if (checks.every((check) => check.passed)) return null;

  return <SaleStatus checks={checks} linkToSettings />;
}
