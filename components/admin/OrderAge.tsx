import { formatAge, formatExact } from "@/lib/admin/age";

/**
 * Antigüedad de un pedido (Fase 9.5, Incremento 3).
 *
 * Server Component: el `now` se calcula en el servidor al renderizar. El panel
 * es `force-dynamic`, así que el valor es fresco en cada carga y no hay
 * discrepancia entre servidor y cliente al hidratar.
 *
 * SIN COLOR NI SEVERIDAD. Todos los pedidos se pintan igual, lleven 3 minutos o
 * 3 semanas. Colorear por antigüedad exigiría un umbral —a partir de cuándo un
 * pedido "va tarde"— y esa regla de negocio no existe en YI Store. La utilidad
 * la aporta el ORDEN de la lista, que es un hecho; el color sería una opinión.
 *
 * El `title` lleva la fecha exacta: la antigüedad relativa sirve para decidir de
 * un vistazo, la exacta para hablar con el cliente.
 */
export function OrderAge({
  iso,
  nowMs,
  locale = "es-ES",
  className = "",
}: {
  iso: string;
  /**
   * Instante de referencia, resuelto UNA vez por petición y pasado hacia
   * abajo. No se lee el reloj aquí dentro por dos razones: leerlo durante el
   * render es impuro (lo rechaza `react-hooks/purity`), y así todas las
   * antigüedades de la misma pantalla se miden contra el mismo instante — sin
   * eso, una lista larga podría decir "hace 2 h" en una fila y "hace 3 h" en
   * la de al lado por haber cruzado un minuto a mitad del render.
   */
  nowMs: number;
  locale?: string;
  className?: string;
}) {
  const relative = formatAge(iso, nowMs, locale);
  const exact = formatExact(iso, locale);

  if (!relative) return <span className={className}>—</span>;

  return (
    <time
      dateTime={iso}
      title={exact ?? undefined}
      className={`whitespace-nowrap ${className}`}
    >
      {relative}
    </time>
  );
}
