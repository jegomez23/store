import Link from "next/link";

/**
 * 404 del detalle de pedido, dentro del layout del panel (el 404 raíz tiene la
 * estética de la tienda y perdería la navegación del admin).
 */
export default function OrderNotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      {/* TODO(i18n) */}
      <h1 className="text-xl font-bold tracking-tight text-black">
        Pedido no encontrado
      </h1>
      <p className="text-sm text-gray-700">
        Ese número no corresponde a ningún pedido del mercado activo. Comprueba
        que lo has copiado entero (formato <code>YI-ES-000001</code>).
      </p>
      <Link
        href="/admin/pedidos"
        className="flex h-11 items-center rounded-full border border-black px-5 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white"
      >
        {/* TODO(i18n) */}
        Volver a pedidos
      </Link>
    </div>
  );
}
