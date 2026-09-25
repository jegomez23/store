/**
 * ¿Está disponible la ayuda con IA? (incremento 21, DEC-087).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DOS CONDICIONES, Y NINGUNA PANTALLA LAS EVALÚA POR SU CUENTA
 * ═══════════════════════════════════════════════════════════════════════════
 * Hacen falta las dos:
 *
 *   1. que el ADMINISTRADOR la haya encendido (`settings.ai_assist_enabled`);
 *   2. que el PROVEEDOR esté configurado en el servidor (la clave de API).
 *
 * Separarlas importa porque los dos «no» significan cosas distintas y se
 * arreglan en sitios distintos: uno con un clic en `/admin/ajustes`, el otro
 * poniendo una variable de entorno en el despliegue. Un único booleano
 * obligaría a la pantalla a adivinar cuál de los dos es, y acabaría
 * diciéndole a Juan que ponga una clave que ya tiene puesta.
 *
 * Mismo patrón que `resolveSaleBlockers` (DEC-070): el criterio vive en un
 * módulo puro, se calcula una vez y las pantallas lo consumen. Módulo sin I/O
 * para poder comprobarlo con `node:test` (DEC-025).
 *
 * ⚠️ Esto NO es un bloqueo de venta. Que la IA esté apagada no impide crear un
 * producto ni cerrar un pedido: el alta funciona igual a mano, que es el
 * camino principal. No lo metas en `SALE_CHECKS`.
 */

export type AssistantAvailability =
  /** El administrador la ha apagado. Se arregla en `/admin/ajustes`. */
  | "OFF"
  /** Encendida, pero sin proveedor en el servidor. Se arregla en el despliegue. */
  | "NOT_CONFIGURED"
  /** Encendida y con proveedor: el botón de analizar funciona. */
  | "READY";

export interface AssistantAvailabilityInput {
  /** `settings.ai_assist_enabled` del mercado activo. */
  enabled: boolean;
  /** `assistant.isConfigured()`: hay clave de API en el servidor. */
  configured: boolean;
}

export function resolveAssistantAvailability(
  input: AssistantAvailabilityInput,
): AssistantAvailability {
  /*
    El interruptor manda. Si está apagado da igual que haya clave: no se manda
    ninguna foto a ningún sitio, y el mensaje que ve el administrador habla de
    lo que él puede cambiar.
  */
  if (!input.enabled) return "OFF";
  return input.configured ? "READY" : "NOT_CONFIGURED";
}

/** Atajo para la única pregunta que le hace el formulario. */
export function isAssistantUsable(availability: AssistantAvailability): boolean {
  return availability === "READY";
}

/**
 * Lo que se le dice al administrador en cada caso.
 *
 * Sin jerga y sin códigos: cada texto nombra la acción que lo resuelve, y
 * ninguno culpa al usuario de algo que no puede tocar.
 */
// TODO(i18n)
export const AVAILABILITY_MESSAGE: Readonly<Record<AssistantAvailability, string | null>> =
  {
    OFF: "La ayuda con IA está desactivada. Puedes activarla en Ajustes.",
    NOT_CONFIGURED: "El asistente no está configurado. Rellena la ficha a mano.",
    READY: null,
  };
