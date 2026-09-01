/**
 * Clave de `sessionStorage` donde el checkout deja el resultado del último
 * pedido creado, para que `/pedido/[numero]` pueda mostrarlo.
 *
 * POR QUÉ NO SE LEE DE LA BD: RLS impide que un anónimo lea `orders`
 * (docs/08-SECURITY.md §4) y los `order_number` son correlativos, así que
 * exponerlos por URL permitiría enumerar pedidos ajenos. La confirmación es
 * efímera y vive solo en la pestaña que hizo la compra.
 *
 * Se usa la misma convención de nombres que el carrito (`yi-store:...:v1`).
 */
export const CHECKOUT_RESULT_STORAGE_KEY = "yi-store:last-order:v1";
