import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/admin/orders";

/**
 * Estado del pedido como pill. El rojo (`accent`) se reserva a lo que exige
 * atención del admin —un pedido recién entrado— siguiendo la regla de marca
 * (docs/rules/ui.md §Uso del rojo); el resto usa tonos neutros para que el
 * listado no sea una pared de rojo.
 */

const TONE: Record<OrderStatus, string> = {
  pending: "bg-red text-white",
  contacted: "bg-cream-dark text-black",
  confirmed: "bg-cream-dark text-black",
  paid: "bg-black text-white",
  preparing: "bg-cream-dark text-black",
  shipped: "bg-cream-dark text-black",
  delivered: "bg-white text-gray-700 border border-line",
  cancelled: "bg-white text-gray-400 border border-line line-through",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${TONE[status]}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
