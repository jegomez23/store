import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

/**
 * 404 del segmento público (Fase 4.5).
 *
 * `app/not-found.tsx` (raíz) NO cubre el `notFound()` que lanza
 * `app/(store)/producto/[slug]/page.tsx`: al no existir un `not-found.tsx`
 * dentro del grupo `(store)`, Next.js 16 renderizaba el boundary FUERA del
 * root layout y devolvía un documento vacío (HTTP 404 correcto, página en
 * blanco). Verificado en el servidor de producción real durante la Fase 4.5.
 *
 * Con este archivo el 404 de producto se renderiza dentro de `(store)/layout`
 * (header, footer y nav de la tienda) y el usuario conserva la navegación.
 */
export default function StoreNotFound() {
  return (
    <Container className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
      {/* TODO(i18n): mover a lib/i18n/messages.ts cuando exista (DEC-013). */}
      <h1 className="text-2xl font-bold tracking-tight text-black">
        Producto no encontrado
      </h1>
      <p className="text-sm text-gray-700">
        Puede que ya no esté disponible o que el enlace sea incorrecto.
      </p>
      <Link href="/">
        <Button variant="primary">Volver al inicio</Button>
      </Link>
    </Container>
  );
}
