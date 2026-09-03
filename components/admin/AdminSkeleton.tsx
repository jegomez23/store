/**
 * Skeleton de carga del panel.
 *
 * POR QUÉ NO HAY `loading.tsx` EN `(panel)/`: un `loading.tsx` en ese segmento
 * cubre TAMBIÉN las rutas hijas, y hace que Next envíe el shell —con su código
 * 200— antes de que la página se resuelva. Comprobado sirviendo el build: con
 * `loading.tsx`, `/admin/pedidos/YI-ES-999999` devolvía **200** en vez de 404
 * pese a llamar a `notFound()`; sin él, devuelve 404. Usar `<Suspense>` dentro
 * de cada página que sí quiere skeleton deja intacto el detalle de pedido, que
 * es la única ruta del panel que necesita responder 404 de verdad.
 */
export function AdminSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
      {/* TODO(i18n) */}
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-cream-dark" />
      ))}
    </div>
  );
}
