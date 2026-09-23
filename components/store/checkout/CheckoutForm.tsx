"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { submitCheckoutAction } from "@/app/(store)/checkout/actions";
import { useCart } from "@/lib/cart/context";
import { selectLineSubtotal } from "@/lib/cart/reducer";
import { formatPrice } from "@/lib/money/format";
import {
  isValidName,
  isValidPhone,
} from "@/lib/checkout/validation";
import {
  amountToFreeShipping,
  isFreeByThreshold,
  resolveShippingCost,
  type ShippingMethodOption,
} from "@/lib/checkout/shipping";
import { CHECKOUT_RESULT_STORAGE_KEY } from "@/lib/checkout/storage-key";
import {
  ATTRIBUTION_STORAGE_KEY,
  sanitizeAttribution,
  type Attribution,
} from "@/lib/attribution/attribution";

/**
 * Formulario de checkout (Fase 6).
 *
 * Muestra un resumen del carrito con los precios que el usuario ya conocía
 * (snapshot, solo informativo) y recoge los datos de contacto. Los importes
 * definitivos son los que devuelve el servidor.
 *
 * La UI no conoce WhatsApp: llama a la Server Action, que resuelve el canal.
 */
/**
 * Atribución guardada por `AttributionCapture` al entrar en la tienda.
 *
 * NUNCA lanza: sin `sessionStorage`, con JSON roto o con un objeto que alguien
 * haya editado a mano devuelve `null` y el pedido se crea sin atribución.
 * ATRIBUCIÓN FALLIDA ≠ CHECKOUT FALLIDO.
 */
function readSessionAttribution(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeAttribution(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function CheckoutForm({
  shippingMethods,
}: {
  shippingMethods: ShippingMethodOption[];
}) {
  const router = useRouter();
  const { lines, totals, market, isHydrated, clearCart, getCheckoutItems } = useCart();
  const [isPending, startTransition] = useTransition();

  const nameId = useId();
  const phoneId = useId();
  const errorId = useId();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  /*
    NINGÚN método viene preseleccionado (decisión de Juan, incremento 8). Así
    nadie confirma un pedido con un envío que no ha elegido: el botón está
    inactivo hasta que se toca una opción.
  */
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * Clave de idempotencia (DEC-028). Se crea en el primer envío y se REUTILIZA
   * en los reintentos: un doble clic o un retry tras un timeout devuelven el
   * pedido ya creado en vez de duplicarlo.
   *
   * Vive en un ref y solo se toca dentro del manejador de evento (leer o
   * mutar un ref durante el render es un error en React 19). Al salir de la
   * página el componente se desmonta y el ref se reinicia, que es justo lo que
   * queremos: modificar el carrito y volver es un pedido distinto.
   */
  const requestIdRef = useRef<string | null>(null);

  const nameValid = isValidName(name);
  const phoneValid = isValidPhone(phone);

  /*
    PREVISIÓN, NO AUTORIDAD (incremento 8).

    Este bloque calcula lo mismo que `create_order`, pero para que el cliente
    vea el total ANTES de confirmar. El importe que se registra y el que se
    manda por WhatsApp son los que devuelve el servidor, no estos. La regla
    vive en `resolveShippingCost` y hay un test de integración que la compara
    con el `case` de la migración 0035 para que no puedan divergir.
  */
  const selectedMethod =
    shippingMethods.find((method) => method.id === shippingMethodId) ?? null;
  const previewShipping = selectedMethod
    ? resolveShippingCost(selectedMethod, totals.subtotal)
    : null;
  const previewTotal =
    previewShipping === null ? totals.subtotal : totals.subtotal + previewShipping;

  const money = (amount: number) =>
    formatPrice(amount, market.currencyCode, market.locale);

  // Si el carrito se vacía (por ejemplo tras completar un pedido en otra
  // pestaña), no tiene sentido quedarse aquí.
  useEffect(() => {
    if (isHydrated && lines.length === 0 && !isPending) {
      router.replace("/carrito");
    }
  }, [isHydrated, lines.length, isPending, router]);

  if (!isHydrated) {
    return (
      <div role="status" aria-live="polite" className="py-10">
        <span className="sr-only">Cargando tu pedido…</span>
        <div className="h-40 animate-pulse rounded-md bg-cream-dark" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-12">
        <p className="text-base text-black">Tu carrito está vacío.</p>
        <Link href="/">
          <Button variant="secondary">Seguir explorando</Button>
        </Link>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    if (!nameValid || !phoneValid || shippingMethodId === null) {
      setShowValidation(true);
      return;
    }

    requestIdRef.current ??= crypto.randomUUID();
    const clientRequestId = requestIdRef.current;

    startTransition(async () => {
      const result = await submitCheckoutAction({
        items: getCheckoutItems(),
        customer: { name, phone },
        clientRequestId,
        // Solo el ID: ningún importe de envío viaja desde el navegador.
        shippingMethodId,
        sourceUrl: window.location.href,
        // Atribución de la sesión (incremento 14). Si el almacenamiento está
        // bloqueado o el contenido no vale, se manda null y el pedido sigue.
        attribution: readSessionAttribution(),
      });

      if (!result.ok) {
        setServerError(result.message);
        return;
      }

      // El pedido ya existe en Supabase. Se guarda el resultado para que
      // /pedido/[numero] pueda mostrarlo SIN consultar la BD: RLS impide que
      // un anónimo lea `orders` y los números son correlativos (adivinables).
      try {
        sessionStorage.setItem(
          CHECKOUT_RESULT_STORAGE_KEY,
          JSON.stringify({
            orderNumber: result.order.orderNumber,
            total: result.order.total,
            currencyCode: result.order.currencyCode,
            locale: market.locale,
            itemCount: result.order.items.length,
            redirectUrl: result.redirectUrl,
          }),
        );
      } catch {
        // Sin sessionStorage la confirmación se degrada a un mensaje neutro.
      }

      clearCart();
      router.push(`/pedido/${result.order.orderNumber}`);
    });
  }

  const inputClasses =
    "h-12 w-full rounded-md border border-line bg-white px-3 text-base text-black outline-none transition-colors focus:border-black";

  return (
    <div className="flex flex-col gap-8 md:grid md:grid-cols-[1fr_20rem] md:items-start md:gap-10">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="text-sm font-medium text-black">
            Nombre
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={showValidation && !nameValid}
            aria-describedby={showValidation && !nameValid ? `${nameId}-err` : undefined}
            className={inputClasses}
          />
          {showValidation && !nameValid ? (
            <p id={`${nameId}-err`} role="alert" className="text-xs font-medium text-red">
              Escribe tu nombre para que sepamos con quién hablamos.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={phoneId} className="text-sm font-medium text-black">
            Teléfono de WhatsApp
          </label>
          <input
            id={phoneId}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+34 600 00 00 00"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={showValidation && !phoneValid}
            aria-describedby={
              showValidation && !phoneValid ? `${phoneId}-err` : `${phoneId}-hint`
            }
            className={inputClasses}
          />
          {showValidation && !phoneValid ? (
            <p id={`${phoneId}-err`} role="alert" className="text-xs font-medium text-red">
              Revisa el número: solo dígitos, con prefijo si es de otro país.
            </p>
          ) : (
            <p id={`${phoneId}-hint`} className="text-xs text-gray-700">
              Lo usamos solo para confirmar este pedido.
            </p>
          )}
        </div>

        <Divider />

        {/*
          MÉTODO DE ENTREGA (incremento 8).

          Radios nativos, no un desplegable: con dos opciones un `select` obliga
          a abrir, leer y elegir, y en móvil tapa media pantalla. Cada opción es
          una etiqueta completa —área táctil grande— con su precio a la vista,
          para que nadie confirme sin saber qué está pagando.

          Nombres, precios y umbrales vienen de `shipping_methods`: aquí no hay
          ni un importe ni un rótulo escrito a mano.
        */}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-black">
            {/* TODO(i18n) */}
            ¿Cómo quieres recibirlo?
          </legend>

          {shippingMethods.length === 0 ? (
            <p role="alert" className="text-sm font-medium text-red">
              {/* TODO(i18n) */}
              Ahora mismo no hay formas de entrega disponibles. Escríbenos y lo
              resolvemos.
            </p>
          ) : (
            shippingMethods.map((method) => {
              const cost = resolveShippingCost(method, totals.subtotal);
              const free = isFreeByThreshold(method, totals.subtotal);
              const missing = amountToFreeShipping(method, totals.subtotal);
              const selected = shippingMethodId === method.id;
              return (
                <label
                  key={method.id}
                  className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${
                    selected ? "border-black bg-cream" : "border-line bg-white hover:border-black"
                  }`}
                >
                  <input
                    type="radio"
                    name="shippingMethodId"
                    value={method.id}
                    checked={selected}
                    onChange={() => setShippingMethodId(method.id)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-red)]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium text-black">{method.name}</span>
                      <span className="text-sm font-semibold text-black">
                        {cost === 0 ? (free ? "Gratis" : money(0)) : money(cost)}
                      </span>
                    </span>
                    {method.description ? (
                      <span className="text-xs text-gray-700">{method.description}</span>
                    ) : null}
                    {/* Dato REAL sacado del umbral del método, no una campaña
                        inventada: solo aparece si falta algo para llegar. */}
                    {missing !== null ? (
                      <span className="text-xs text-gray-700">
                        Te faltan {money(missing)} para que salga gratis.
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })
          )}

          {showValidation && shippingMethodId === null && shippingMethods.length > 0 ? (
            <p role="alert" className="text-xs font-medium text-red">
              {/* TODO(i18n) */}
              Elige cómo quieres recibir el pedido.
            </p>
          ) : null}
        </fieldset>

        <Divider />

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="whatsapp"
            disabled={isPending || shippingMethodId === null}
            aria-describedby={errorId}
            className="w-full"
          >
            {/* Copy documentado en docs/04-UX-UI.md §166. */}
            {isPending ? "Creando tu pedido…" : "COMPRAR POR WHATSAPP"}
          </Button>

          <p className="text-xs text-gray-700">
            No es un pago online: se abrirá WhatsApp con tu pedido para que lo
            confirmemos contigo.
          </p>

          <p id={errorId} role="alert" aria-live="polite" className="min-h-5 text-sm font-medium text-red">
            {serverError}
          </p>
        </div>
      </form>

      <aside
        aria-label="Resumen del pedido"
        className="flex flex-col gap-4 rounded-md border border-line bg-white p-5 md:sticky md:top-24"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black">
          Tu pedido
        </h2>

        <ul className="flex flex-col gap-4">
          {lines.map((line) => (
            <li key={line.variantId} className="flex gap-3">
              <div className="w-14 shrink-0">
                <RemoteImage src={line.imageUrl} alt={line.productName} ratio="portrait" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-black">
                  {line.quantity}× {line.productName}
                </p>
                {line.colorName || line.sizeLabel ? (
                  <p className="text-xs text-gray-700">
                    {[line.colorName, line.sizeLabel].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
              <p className="text-sm font-medium text-black">
                {formatPrice(
                  selectLineSubtotal(line),
                  market.currencyCode,
                  market.locale,
                )}
              </p>
            </li>
          ))}
        </ul>

        <Divider />

        {/* PRODUCTOS + ENVÍO = TOTAL, sin sorpresas al confirmar. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Productos</span>
            <span>{money(totals.subtotal)}</span>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Envío</span>
            {previewShipping === null ? (
              <span className="text-gray-400">Elige cómo recibirlo</span>
            ) : previewShipping === 0 && selectedMethod && isFreeByThreshold(selectedMethod, totals.subtotal) ? (
              <span className="font-medium text-black">Gratis</span>
            ) : (
              <span>{money(previewShipping)}</span>
            )}
          </div>

          <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
            <span className="text-sm font-semibold text-black">Total</span>
            <span className="text-lg font-semibold text-red">
              {previewShipping === null ? "—" : money(previewTotal)}
            </span>
          </div>
        </div>

        {previewShipping === null ? (
          <p className="text-xs text-gray-700">
            {/* TODO(i18n) */}
            El total aparece en cuanto elijas cómo quieres recibir el pedido.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
