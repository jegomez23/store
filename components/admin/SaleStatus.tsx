import Link from "next/link";
import type { SaleCheck } from "@/lib/store/sale-status";

/**
 * Estado de venta de la tienda (Incremento 15, convertido en lista en el 17).
 *
 * Server Component: solo pinta lo que `resolveSaleChecklist` ya decidió. No
 * vuelve a evaluar nada, para que no pueda existir una segunda definición de
 * «se puede vender».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA LISTA Y NO UN SEMÁFORO (incremento 17)
 * ─────────────────────────────────────────────────────────────────────────
 * Antes se enseñaban **solo los fallos**. «Lista para vender» era un párrafo
 * que había que creerse, y con un fallo el otro requisito desaparecía de la
 * pantalla: el administrador no sabía si estaba bien o si nadie lo había
 * mirado. Ahora se ven siempre las dos comprobaciones, cumplidas o no.
 *
 * Cada fallo lleva su propio botón al sitio donde se arregla. En un móvil, el
 * enlace ES la corrección: leer el problema y estar en el campo son un toque.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TONO
 * ─────────────────────────────────────────────────────────────────────────
 * Ni tecnicismos ni alarmismo. El rojo aparece **solo** cuando el cliente no
 * puede comprar, que es lo que el rojo significa en este panel; el resto es el
 * gris de siempre. Nada de códigos, nombres de columna ni errores de SQL: eso
 * va al log del servidor, no a la cara del administrador.
 */

function Mark({ passed }: { passed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        passed ? "bg-cream-dark text-black" : "bg-red text-white"
      }`}
    >
      {passed ? "✓" : "✕"}
    </span>
  );
}

export function SaleStatus({
  checks,
  /**
   * En el panel de inicio los botones tienen que salir de esta pantalla; dentro
   * de Ajustes son saltos dentro de la misma página.
   */
  linkToSettings = false,
}: {
  checks: readonly SaleCheck[];
  linkToSettings?: boolean;
}) {
  const blocked = checks.some((check) => !check.passed);
  const base = linkToSettings ? "/admin/ajustes" : "";

  return (
    <section
      aria-labelledby="estado-venta"
      className={`flex flex-col gap-3 rounded-md border bg-white px-4 py-4 ${
        blocked ? "border-red" : "border-line"
      }`}
    >
      {/* TODO(i18n) en todo el componente */}
      <div className="flex flex-col gap-1">
        <h2
          id="estado-venta"
          className={`text-sm font-medium ${blocked ? "text-red" : "text-black"}`}
        >
          {blocked ? "Venta bloqueada" : "Lista para vender"}
        </h2>
        <p className="text-sm text-gray-700">
          {blocked
            ? "Ahora mismo nadie puede completar un pedido. Falta esto:"
            : "La tienda puede aceptar pedidos."}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {checks.map((check) => (
          <li key={check.code} className="flex items-start gap-2.5">
            <Mark passed={check.passed} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={`text-sm ${check.passed ? "text-gray-700" : "font-medium text-black"}`}
              >
                {check.passed ? check.label : check.title}
              </span>
              {check.passed ? null : (
                <span className="text-sm text-gray-700">{check.fix}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/*
        UN BOTÓN POR PROBLEMA, y ninguno cuando no hay problemas: «todo bien» no
        es una tarea. Los 44 px son el objetivo táctil mínimo del panel.
      */}
      {blocked ? (
        <div className="flex flex-wrap gap-2">
          {checks
            .filter((check) => !check.passed)
            .map((check) => (
              <Link
                key={check.code}
                href={`${base}#${check.anchor}`}
                className="inline-flex min-h-11 items-center rounded-full border border-red px-4 text-sm font-medium text-red transition-colors duration-200 ease-out hover:bg-red hover:text-white"
              >
                {check.cta}
              </Link>
            ))}
        </div>
      ) : null}
    </section>
  );
}
