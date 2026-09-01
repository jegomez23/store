"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { formatPrice } from "@/lib/money/format";
import { CHECKOUT_RESULT_STORAGE_KEY } from "@/lib/checkout/storage-key";

interface StoredOrder {
  orderNumber: string;
  total: number;
  currencyCode: string;
  locale: string;
  itemCount: number;
  redirectUrl: string;
}

/**
 * `sessionStorage` no cambia mientras la página está abierta, así que no hay
 * nada a lo que suscribirse: `useSyncExternalStore` se usa aquí por su otra
 * propiedad útil — devuelve un valor distinto en servidor y en cliente sin
 * provocar hydration mismatch ni `setState` dentro de un efecto (que React 19
 * desaconseja, igual que en `CartProvider`).
 */
const subscribe = () => () => {};
const getServerSnapshot = () => null;

function getClientSnapshot(): string | null {
  try {
    return sessionStorage.getItem(CHECKOUT_RESULT_STORAGE_KEY);
  } catch {
    // Storage bloqueado (modo privado, cookies desactivadas).
    return null;
  }
}

function parseStoredOrder(raw: string | null, orderNumber: string): StoredOrder | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Record<string, unknown>;

    // Solo se muestra si corresponde al pedido de la URL: así navegar a otro
    // número no enseña los datos del pedido anterior.
    if (value.orderNumber !== orderNumber) return null;
    if (
      typeof value.total !== "number" ||
      typeof value.currencyCode !== "string" ||
      typeof value.locale !== "string" ||
      typeof value.redirectUrl !== "string"
    ) {
      return null;
    }

    return {
      orderNumber,
      total: value.total,
      currencyCode: value.currencyCode,
      locale: value.locale,
      itemCount: typeof value.itemCount === "number" ? value.itemCount : 0,
      redirectUrl: value.redirectUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Confirmación del pedido (Fase 6).
 *
 * NO consulta la base de datos. RLS impide que un anónimo lea `orders`
 * (docs/08-SECURITY.md §4) y los `order_number` son correlativos: exponer un
 * endpoint de lectura por número permitiría enumerar pedidos ajenos con sus
 * datos de cliente. Los datos vienen de `sessionStorage`, escritos por el
 * propio checkout; si no están (otro dispositivo, enlace compartido, storage
 * bloqueado) se muestra un mensaje neutro SIN datos privados.
 */
export function OrderConfirmation({ orderNumber }: { orderNumber: string }) {
  const raw = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const order = useMemo(() => parseStoredOrder(raw, orderNumber), [raw, orderNumber]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/* TODO(i18n): centralizar copy cuando exista lib/i18n (DEC-013). */}
        <h1 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
          Tu pedido está listo
        </h1>
        <p className="text-sm text-gray-700">
          Lo hemos registrado. Continúa por WhatsApp para confirmarlo: todavía
          no has pagado nada.
        </p>
      </div>

      <div className="rounded-md border border-line bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-gray-700">
          Número de pedido
        </p>
        <p className="mt-1 text-xl font-semibold text-black">{orderNumber}</p>

        {order ? (
          <>
            <Divider className="my-4" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {order.itemCount === 1 ? "1 línea" : `${order.itemCount} líneas`}
              </span>
              <span className="text-lg font-semibold text-red">
                {formatPrice(order.total, order.currencyCode, order.locale)}
              </span>
            </div>
          </>
        ) : null}
      </div>

      {order ? (
        <a href={order.redirectUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="whatsapp" className="w-full">
            Continuar por WhatsApp
          </Button>
        </a>
      ) : (
        <p className="text-sm text-gray-700">
          Guarda este número. Si no se ha abierto WhatsApp, escríbenos indicando
          el número de pedido y lo confirmamos contigo.
        </p>
      )}

      <Link href="/" className="text-sm font-medium text-black underline">
        Volver a la tienda
      </Link>
    </div>
  );
}
