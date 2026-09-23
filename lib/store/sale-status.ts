import { isWhatsAppConfigured } from "../whatsapp/phone.ts";

/**
 * ¿Puede vender la tienda? (Incremento 15) — MÓDULO PURO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * La respuesta se estaba dando en dos sitios y con criterios distintos: el
 * panel de inicio miraba solo el número de WhatsApp, y `/admin/ajustes` tenía
 * además un aviso suelto para cuando no había métodos de entrega. Las dos
 * cosas bloquean la venta de verdad, pero solo una se llamaba «la tienda no
 * puede recibir pedidos». Un panel que dice «listo» mientras el cliente no
 * puede comprar es peor que no decir nada.
 *
 * Aquí está la ÚNICA definición. Quien quiera pintarla, la lee.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ CUENTA COMO BLOQUEO, Y QUÉ NO
 * ─────────────────────────────────────────────────────────────────────────
 * Solo lo que impide COMPLETAR un pedido hoy:
 *
 *   · WhatsApp sin configurar → `channel.submitOrder` devuelve
 *     `CHECKOUT_NOT_CONFIGURED` antes de crear nada (DEC-065).
 *   · Ningún método de entrega activo → el checkout exige elegir uno y
 *     `create_order` lo valida contra `shipping_methods`, así que sin ninguno
 *     no hay pedido posible (incremento 8).
 *
 * NO es un bloqueo un catálogo vacío o sin stock: eso es una tienda sin nada
 * que vender, no una tienda rota. Ya lo cuentan el resumen de productos no
 * vendibles y el inventario, y mezclarlo aquí diluiría el mensaje.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INCREMENTO 16: EL CLIENTE TAMBIÉN PREGUNTA AQUÍ
 * ─────────────────────────────────────────────────────────────────────────
 * Hasta el 15 esto solo lo consumía el PANEL. La tienda pública seguía
 * pintando el checkout entero —nombre, teléfono, método de entrega, botón— y
 * el cliente descubría que no se podía comprar DESPUÉS de rellenarlo todo y
 * pulsar «Confirmar»: `WhatsAppChannel` devolvía `CHECKOUT_NOT_CONFIGURED` al
 * final del camino. Ahora `/checkout` pregunta antes de pintar el formulario
 * (`lib/store/sale-status-data.ts`).
 *
 * Los textos de `title`/`fix` son para el ADMINISTRADOR: dicen qué falta y
 * dónde arreglarlo. Al cliente no se le enseña ninguno de los dos —no es asunto
 * suyo cómo está configurada la tienda—; `/checkout` pinta su propio mensaje
 * neutro y solo usa de aquí la respuesta «se puede o no».
 *
 * Sin I/O ni imports de runtime: ejecutable con `node --test` (DEC-025).
 */

export type SaleBlockerCode = "WHATSAPP_NOT_CONFIGURED" | "NO_ACTIVE_SHIPPING_METHOD";

export interface SaleBlocker {
  code: SaleBlockerCode;
  /** Qué pasa, en una línea y sin tecnicismos. */
  title: string;
  /** Qué tiene que hacer el administrador. */
  fix: string;
  /**
   * Ancla de la sección de /admin/ajustes que lo arregla (incremento 16).
   *
   * En un móvil el estado de venta está arriba y el campo que lo resuelve
   * puede quedar a dos pantallas de scroll: sin este enlace, «qué hacer» es
   * información que obliga a buscar. Es un id de esa página, no una ruta: la
   * pantalla que lo pinta decide si enlaza dentro de sí misma o a /admin/ajustes.
   */
  anchor: string;
}

export interface SaleStatusInput {
  whatsappNumber: string | null | undefined;
  /** Cuántos métodos de entrega ACTIVOS tiene el mercado. */
  activeShippingMethods: number;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * INCREMENTO 17: LA LISTA SE DECLARA UNA VEZ, Y DE AHÍ SALE TODO
 * ─────────────────────────────────────────────────────────────────────────
 * El panel ya no enseña solo lo que falla: enseña **las dos comprobaciones**,
 * cumplidas o no, para que «lista para vender» sea una lista y no un semáforo.
 * Eso obligaba a tener en algún sitio los checks que PASAN, y ahí es donde se
 * duplican los criterios.
 *
 * Aquí no: `SALE_CHECKS` es la única declaración, cada entrada lleva su propio
 * predicado, y tanto la lista completa como los bloqueos se derivan de ella.
 * Añadir una comprobación es añadir una entrada; no hay un segundo sitio que
 * actualizar y no puede quedarse a medias.
 *
 * ⚠️ **NO SE INVENTAN COMPROBACIONES.** Son dos porque son dos las cosas que
 * impiden completar un pedido hoy. Añadir «configuración de envío válida» como
 * tercera línea quedaría bonito y sería mentira: los importes negativos ya los
 * rechaza PostgreSQL (migración 0036), así que esa comprobación no puede
 * fallar nunca y solo serviría para engordar la lista con un ✓ decorativo.
 */
interface SaleCheckDefinition extends Omit<SaleBlocker, "code"> {
  code: SaleBlockerCode;
  /** Rótulo corto de la lista, en positivo: lo que se ve con un ✓ al lado. */
  label: string;
  /** Texto del botón que lleva a arreglarlo. */
  cta: string;
  /** `true` = cumple. Es el criterio, y solo vive aquí. */
  passes: (input: SaleStatusInput) => boolean;
}

// TODO(i18n)
const SALE_CHECKS: readonly SaleCheckDefinition[] = [
  {
    code: "WHATSAPP_NOT_CONFIGURED",
    label: "WhatsApp configurado",
    title: "El número de WhatsApp es el de ejemplo, no uno real",
    fix: "Escribe el número al que quieres que te lleguen los pedidos.",
    cta: "Configurar WhatsApp",
    anchor: "whatsapp",
    passes: (input) => isWhatsAppConfigured(input.whatsappNumber),
  },
  {
    code: "NO_ACTIVE_SHIPPING_METHOD",
    label: "Método de entrega activo",
    title: "No hay ningún método de entrega activo",
    fix: "Crea o activa al menos uno: el cliente tiene que elegir cómo recibe el pedido.",
    cta: "Configurar entrega",
    anchor: "entrega",
    // Ante la duda se informa de BLOQUEO: si el recuento falla, la capa de
    // datos devuelve 0, y un NaN tampoco puede convertirse en "todo bien".
    passes: (input) =>
      Number.isFinite(input.activeShippingMethods) && input.activeShippingMethods >= 1,
  },
];

/** Una comprobación con su resultado. `passed: false` es exactamente un bloqueo. */
export interface SaleCheck extends SaleBlocker {
  label: string;
  cta: string;
  passed: boolean;
}

/**
 * TODAS las comprobaciones con su resultado, en orden. Es lo que pinta el
 * panel: lo que cumple y lo que no, sin que el administrador tenga que deducir
 * de un silencio que algo está bien.
 */
export function resolveSaleChecklist(input: SaleStatusInput): SaleCheck[] {
  return SALE_CHECKS.map(({ passes, ...check }) => ({ ...check, passed: passes(input) }));
}

/**
 * Todo lo que impide vender ahora mismo. Lista vacía = la tienda vende.
 *
 * El orden importa: primero lo que el administrador tiene que arreglar antes.
 * Se deriva de `SALE_CHECKS`, así que no puede discrepar de la lista completa.
 */
export function resolveSaleBlockers(input: SaleStatusInput): SaleBlocker[] {
  return resolveSaleChecklist(input).filter((check) => !check.passed);
}

/** Azúcar sobre `resolveSaleBlockers`: no dupliques el criterio, úsalo. */
export function canSell(input: SaleStatusInput): boolean {
  return resolveSaleBlockers(input).length === 0;
}

export function hasBlocker(blockers: readonly SaleBlocker[], code: SaleBlockerCode): boolean {
  return blockers.some((blocker) => blocker.code === code);
}
