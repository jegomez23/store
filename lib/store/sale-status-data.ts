import { getSettings } from "@/lib/data/settings";
import { countActiveShippingMethods } from "@/lib/data/shipping";
import { resolveSaleChecklist, type SaleCheck } from "@/lib/store/sale-status";
import type { ActiveMarket } from "@/lib/markets";


/**
 * «¿Puede esta tienda aceptar un pedido?» — LA CONSULTA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE, SI YA ESTÁ `resolveSaleChecklist`
 * ─────────────────────────────────────────────────────────────────────────
 * `lib/store/sale-status.ts` es el CRITERIO y es puro: recibe datos y decide.
 * Esto es la forma de CONSEGUIR esos datos, y estaba copiada en el panel de
 * inicio. Una sola función carga, una sola función decide.
 *
 * `/admin/ajustes` y `/checkout` llaman al criterio DIRECTAMENTE **y no es una
 * excepción**: esas pantallas ya tienen en la mano el número de WhatsApp y los
 * métodos porque los pintan, así que pedirlos otra vez sería un viaje de más.
 * Medido en el incremento 16: ~85 ms por carga. El criterio es el mismo; lo
 * único que no comparten es el viaje a la base de datos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS CONSULTAS, Y NINGUNA TRAE FILAS DE MÁS
 * ─────────────────────────────────────────────────────────────────────────
 * `getSettings` selecciona tres columnas y `countActiveShippingMethods` usa
 * `head: true`: cuenta en PostgreSQL sin traer ni una fila. Van en paralelo
 * porque no dependen entre sí.
 *
 * Devuelve las DOS comprobaciones con su resultado, no solo los fallos: desde
 * el incremento 17 el panel enseña también lo que ya está bien.
 */
export async function getSaleChecklist(market: ActiveMarket): Promise<SaleCheck[]> {
  const [settings, activeShippingMethods] = await Promise.all([
    getSettings(market),
    countActiveShippingMethods(market),
  ]);

  return resolveSaleChecklist({
    whatsappNumber: settings?.whatsappNumber,
    activeShippingMethods,
  });
}
