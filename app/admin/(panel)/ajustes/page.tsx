import type { Metadata } from "next";
import { AiAssistForm } from "@/components/admin/AiAssistForm";
import { LogoForm } from "@/components/admin/LogoForm";
import { StoreSettingsForm } from "@/components/admin/StoreSettingsForm";
import { WhatsAppNumberForm } from "@/components/admin/WhatsAppNumberForm";
import {
  NewShippingMethodForm,
  ShippingMethodRow,
} from "@/components/admin/ShippingMethodForms";
import { getFullSettingsForAdmin } from "@/lib/data/admin/cms";
import { listShippingMethodsForAdmin } from "@/lib/data/shipping";
import { getActiveMarket } from "@/lib/markets";
import { SaleStatus } from "@/components/admin/SaleStatus";
import { hasBlocker, resolveSaleBlockers, resolveSaleChecklist } from "@/lib/store/sale-status";
import { resolveAssistantAvailability } from "@/lib/ai/availability";
import { createGeminiProductAssistant } from "@/lib/ai/gemini-assistant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajustes",
  robots: { index: false, follow: false },
};

/**
 * `/admin/ajustes` — el centro de control operativo de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL ORDEN DE LA PÁGINA ES LA FUNCIÓN DE LA PÁGINA (incremento 16)
 * ─────────────────────────────────────────────────────────────────────────
 * Antes empezaba por una tabla de solo lectura («Moneda y locale», «Logo ·
 * subida pendiente») y el formulario de WhatsApp quedaba el último, detrás de
 * un formulario de alta de método de entrega. En un teléfono eso significa que
 * lo ÚNICO que impide vender está al final del scroll y que, al guardarlo, el
 * estado de venta que confirma el arreglo se ha quedado dos pantallas arriba.
 *
 * Ahora el orden es el de la urgencia operativa:
 *
 *   1. Estado de venta — y cada bloqueo enlaza a su sección.
 *   2. WhatsApp        — el bloqueo más frecuente, con su aviso al lado.
 *   3. Entrega         — lo que decide lo que cobra la tienda.
 *   4. Identidad       — nombre, frase, email, redes y LOGO.
 *   5. Solo lectura    — al final, porque no se puede hacer nada con ello.
 *
 * Nada de esto es un rediseño: son las mismas piezas de la Fase 8 y del
 * incremento 9, ordenadas por lo que cuesta que estén mal.
 */
export default async function AdminSettingsPage() {
  const market = await getActiveMarket();
  const settings = await getFullSettingsForAdmin(market);
  const shippingMethods = await listShippingMethodsForAdmin(market);

  /*
    ESTADO DE VENTA (incremento 15). Se calcula UNA vez, con los datos que esta
    pantalla ya ha cargado —cero consultas extra— y con la misma función que
    usan el panel de inicio y `/checkout` (los dos a través de
    `getSaleBlockers`, incremento 16). Los métodos activos se cuentan aquí en
    vez de volver a preguntar a la base de datos.
  */
  const saleInput = {
    whatsappNumber: settings?.whatsappNumber,
    activeShippingMethods: shippingMethods.filter((method) => method.isActive).length,
  };
  // La lista completa se pinta; los bloqueos se derivan de ella y siguen
  // decidiendo el aviso que va junto al campo de WhatsApp.
  const checks = resolveSaleChecklist(saleInput);
  const blockers = resolveSaleBlockers(saleInput);

  /*
    Mismo criterio que usa `/admin/catalogo/nuevo`, con los datos que esta
    pantalla ya tiene: el interruptor de la BD y si hay clave en el servidor.
    Distinguir «apagada» de «encendida pero sin proveedor» es justo lo que
    evita que el administrador vea «Activada» junto a un botón muerto.
  */
  const assistantAvailability = resolveAssistantAvailability({
    enabled: settings?.aiAssistEnabled ?? false,
    configured: createGeminiProductAssistant().isConfigured(),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        {/* TODO(i18n) */}
        <h1 className="text-xl font-bold tracking-tight text-black md:text-2xl">
          Ajustes
        </h1>
        <p className="text-sm text-gray-700">
          {market.name} ({market.id}) · {market.currencyCode} · {market.locale}
        </p>
      </header>

      <SaleStatus checks={checks} />

      {/* ──────────────────── 1. Contacto: WhatsApp ──────────────────── */}
      {settings === null ? (
        <p className="rounded-md border border-line bg-cream px-4 py-8 text-center text-sm text-gray-700">
          {/* TODO(i18n) */}
          Este mercado todavía no tiene una fila en `settings`. Créala antes de
          poder configurarlo.
        </p>
      ) : (
        <section
          id="whatsapp"
          aria-labelledby="whatsapp-titulo"
          className="flex scroll-mt-20 flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            {/* TODO(i18n) */}
            <h2 id="whatsapp-titulo" className="text-base font-medium text-black">
              Contacto
            </h2>
            <p className="text-xs text-gray-400">
              Es a este número al que llegan los pedidos. Sin él la tienda no
              vende.
            </p>
          </div>

          {/*
            EL AVISO VA JUNTO AL CAMPO QUE LO ARREGLA (incremento 10). El panel
            de inicio también avisa, pero allí no se puede hacer nada: aquí sí.

            Incremento 15: la condición sale de `resolveSaleBlockers`, la misma
            que pinta el estado de arriba y la que usa el panel de inicio. No es
            una copia del criterio: es el criterio.
          */}
          {hasBlocker(blockers, "WHATSAPP_NOT_CONFIGURED") ? (
            <p className="rounded-md border border-red bg-white px-4 py-3 text-sm text-black">
              {/* TODO(i18n) */}
              El número guardado es el de ejemplo con el que arranca la tienda,
              no uno real. Mientras siga así,{" "}
              <strong>el checkout rechaza las compras</strong> (DEC-065): más
              vale no vender que registrar un pedido que no le llega a nadie.
            </p>
          ) : null}

          <WhatsAppNumberForm current={settings.whatsappNumber} />
        </section>
      )}

      {/* ──────────────────── 2. Métodos de entrega ──────────────────── */}
      {/*
        FUERA DEL `settings === null`, y no es un descuido: los métodos viven en
        su propia tabla y un mercado sin fila en `settings` puede tenerlos igual.
        Van aquí y no en una pantalla nueva porque son configuración del mercado,
        exactamente como el número de WhatsApp.
      */}
      <section
        id="entrega"
        aria-labelledby="entrega-titulo"
        className="flex scroll-mt-20 flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          {/* TODO(i18n) */}
          <h2 id="entrega-titulo" className="text-base font-medium text-black">
            Métodos de entrega
          </h2>
          <p className="text-xs text-gray-400">
            Lo que se edita aquí <strong>decide lo que cobra la tienda</strong>:
            el precio y el umbral entran en el total del pedido. Los métodos son
            de este mercado ({market.id}).
          </p>
        </div>

        {shippingMethods.length === 0 ? (
          <p className="rounded-md border border-red bg-white px-4 py-6 text-center text-sm text-black">
            {/* Vacío MALO, y por eso en rojo: sin métodos no se puede comprar,
                porque el checkout exige elegir uno. */}
            {/* TODO(i18n) */}
            No hay ningún método de entrega. <strong>Nadie puede completar un
            pedido</strong> hasta que crees al menos uno.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shippingMethods.map((method) => (
              <ShippingMethodRow
                key={method.id}
                method={method}
                currencyCode={market.currencyCode}
                locale={market.locale}
              />
            ))}
          </ul>
        )}

        {shippingMethods.length > 0 && shippingMethods.every((m) => !m.isActive) ? (
          <p className="rounded-md border border-red bg-white px-4 py-3 text-sm text-black">
            {/* TODO(i18n) */}
            Ninguno está marcado como «Ofrecer en el checkout»:{" "}
            <strong>nadie puede completar un pedido</strong>.
          </p>
        ) : null}

        {/*
          EL ALTA VA DEBAJO DE LA LISTA Y PLEGADA (incremento 16). Crear un
          método es lo que menos se hace —se crean una vez y se editan muchas—,
          y arriba y desplegado obligaba a pasar por encima de seis campos para
          llegar a lo que se venía a cambiar. `<details>` y no estado de
          cliente: así el formulario va SERVIDO en el HTML y sigue funcionando
          sin JavaScript, igual que la edición.
        */}
        <details className="rounded-md border border-line bg-white px-4 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-black">
            {/* TODO(i18n) */}
            Añadir un método de entrega
          </summary>
          <div className="mb-2 mt-1 border-t border-line pt-3">
            <NewShippingMethodForm currencyCode={market.currencyCode} />
          </div>
        </details>
      </section>

      {settings === null ? null : (
        <>
          {/* ─────────────────── 3. Identidad de la tienda ─────────────── */}
          <section
            id="identidad"
            aria-labelledby="identidad-titulo"
            className="flex scroll-mt-20 flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              {/* TODO(i18n) */}
              <h2 id="identidad-titulo" className="text-base font-medium text-black">
                Identidad y redes
              </h2>
              <p className="text-xs text-gray-400">
                El nombre y la frase salen en la pestaña del navegador, en el pie
                de página y en la imagen que se ve al compartir el enlace de la
                tienda. El email y las redes, en el pie.
              </p>
            </div>

            <StoreSettingsForm settings={settings} />

            {/*
              El logo va DEBAJO del nombre y la frase, no encima: es la parte
              de la identidad que menos se cambia y la única que exige elegir
              un archivo. En un móvil, lo que se toca a menudo va primero.
            */}
            <LogoForm logoPublicUrl={settings.logoPublicUrl} storeName={settings.storeName} />
          </section>

          {/* ─────────────────── 4. Herramientas del panel ──────────────── */}
          {/*
            Va DESPUÉS de la identidad y ANTES de la tabla de solo lectura: no
            es urgente —apagarla no impide vender, y encenderla tampoco hace
            vender más—, pero es lo único de esta página que decide si una foto
            sale del proyecto, así que no puede quedar enterrado al final.

            Deliberadamente NO está en el estado de venta de arriba: la IA no
            es un bloqueo de venta y `SALE_CHECKS` no crece por esto (DEC-077).
          */}
          <section
            id="ia"
            aria-labelledby="ia-titulo"
            className="flex scroll-mt-20 flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              {/* TODO(i18n) */}
              <h2 id="ia-titulo" className="text-base font-medium text-black">
                Ayuda con IA
              </h2>
              <p className="text-xs text-gray-400">
                Opcional. El alta de producto funciona igual con esto apagado.
              </p>
            </div>

            <AiAssistForm
              enabled={settings.aiAssistEnabled}
              availability={assistantAvailability}
            />
          </section>

          {/* ─────────────────── 5. Solo lectura, al final ─────────────── */}
          {/*
            La fila del logo se va de aquí en el incremento 17: decía «subida
            pendiente» y ya no lo está. Enseñar la ruta cruda del objeto no le
            servía a nadie.
          */}
          <dl className="rounded-md border border-line bg-white px-4 py-2">
            {/* TODO(i18n) */}
            <div className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="text-sm text-gray-700">Moneda y locale</dt>
              <dd className="text-right text-sm text-gray-400">
                {/* Solo lectura por diseño: docs/05-ADMIN.md §4.6. */}
                {market.currencyCode} · {market.locale} (se cambian en `markets`)
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
