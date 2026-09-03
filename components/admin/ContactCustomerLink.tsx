import {
  ADMIN_MESSAGE_LABELS,
  buildAdminMessage,
  messageKindForStatus,
  type AdminMessageKind,
  type AdminMessageOrder,
} from "@/lib/whatsapp/admin-message";
import { buildWhatsAppUrl } from "@/lib/whatsapp/phone";
import type { OrderStatus } from "@/lib/admin/orders";

/**
 * Enlace para escribir al cliente por WhatsApp (Fase 9.5).
 *
 * SERVER COMPONENT SIN JAVASCRIPT: es un `<a href>`. No lleva `'use client'`
 * ni estado, así que funciona igual con JS deshabilitado y no añade ni un byte
 * al bundle. El mensaje se compone en servidor a partir del pedido.
 *
 * IMPORTANTE — QUÉ NÚMERO LLEVA LA URL: el del CLIENTE
 * (`customers.phone`), porque es a él a quien se escribe. El número de la
 * tienda (`settings.whatsapp_number`) no interviene: `wa.me` abre el chat
 * desde la cuenta de WhatsApp que el admin ya tenga iniciada. Sigue habiendo
 * una única fuente de verdad para el número de la tienda y este componente no
 * la toca.
 *
 * Si el teléfono no es utilizable, `buildWhatsAppUrl` devuelve `null` y aquí se
 * pinta un aviso en vez de un enlace roto.
 */

interface ContactCustomerLinkProps {
  phone: string;
  status: OrderStatus;
  order: AdminMessageOrder;
  /** `compact` para una fila de listado; `full` para el detalle. */
  variant?: "compact" | "full";
}

const WHATSAPP_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 ease-out";

function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={`h-4 w-4 ${className}`}
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07s.89 2.4 1.02 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

export function ContactCustomerLink({
  phone,
  status,
  order,
  variant = "full",
}: ContactCustomerLinkProps) {
  const kind = messageKindForStatus(status);

  // Estados sin plantilla (paid, preparing, delivered): se abre el chat sin
  // texto. Sigue ahorrando copiar el número y buscar la conversación.
  const primaryKind: AdminMessageKind = kind ?? "plain";
  const primaryUrl = buildWhatsAppUrl(phone, buildAdminMessage(order, primaryKind));

  if (!primaryUrl) {
    if (variant === "compact") return null;
    return (
      <p className="text-sm text-gray-700">
        {/* TODO(i18n) */}
        El teléfono de este cliente no permite abrir WhatsApp.
      </p>
    );
  }

  if (variant === "compact") {
    return (
      <a
        href={primaryUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Escribir por WhatsApp al cliente del pedido ${order.orderNumber}`}
        title={ADMIN_MESSAGE_LABELS[primaryKind]}
        className={`${WHATSAPP_BASE} h-9 w-9 border border-line bg-white text-black hover:border-black`}
      >
        <WhatsAppIcon />
      </a>
    );
  }

  // En el detalle, además de la plantilla se ofrece el chat en blanco: hay
  // conversaciones que no encajan en ninguna plantilla y el admin no debería
  // tener que borrar el texto precargado.
  const plainUrl = buildWhatsAppUrl(phone, "");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <a
        href={primaryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${WHATSAPP_BASE} h-12 bg-red px-5 text-sm text-white hover:bg-red-dark md:h-11`}
      >
        <WhatsAppIcon />
        {ADMIN_MESSAGE_LABELS[primaryKind]}
      </a>

      {kind !== null && plainUrl ? (
        <a
          href={plainUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center rounded-full px-4 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black md:h-11"
        >
          {ADMIN_MESSAGE_LABELS.plain}
        </a>
      ) : null}
    </div>
  );
}
