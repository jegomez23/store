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
import { CHECKOUT_RESULT_STORAGE_KEY } from "@/lib/checkout/storage-key";

/**
 * Formulario de checkout (Fase 6).
 *
 * Muestra un resumen del carrito con los precios que el usuario ya conocía
 * (snapshot, solo informativo) y recoge los datos de contacto. Los importes
 * definitivos son los que devuelve el servidor.
 *
 * La UI no conoce WhatsApp: llama a la Server Action, que resuelve el canal.
 */
export function CheckoutForm() {
  const router = useRouter();
  const { lines, totals, market, isHydrated, clearCart, getCheckoutItems } = useCart();
  const [isPending, startTransition] = useTransition();

  const nameId = useId();
  const phoneId = useId();
  const errorId = useId();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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

    if (!nameValid || !phoneValid) {
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
        sourceUrl: window.location.href,
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

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="whatsapp"
            disabled={isPending}
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

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-black">Total</span>
          <span className="text-lg font-semibold text-red">
            {formatPrice(totals.subtotal, market.currencyCode, market.locale)}
          </span>
        </div>
        <p className="text-xs text-gray-700">
          El envío se acuerda contigo por WhatsApp.
        </p>
      </aside>
    </div>
  );
}
