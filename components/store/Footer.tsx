import { Container } from "@/components/ui/Container";
import { Divider } from "@/components/ui/Divider";

/**
 * Footer de la tienda. Enlaces de políticas/redes aún no existen como
 * páginas reales (Fase 4+) — se listan como texto, no como Link roto.
 */
export function Footer() {
  return (
    <footer className="border-t border-line bg-cream pb-20 pt-10 md:pb-10">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-bold tracking-tight text-black">
            YI
          </span>
          <p className="text-sm text-gray-700">Vive a tu propio ritmo.</p>
        </div>
        <Divider />
        <div className="flex flex-col gap-2 text-sm text-gray-400 md:flex-row md:justify-between">
          <span>Envíos · Devoluciones · Contacto (próximamente)</span>
          <span>© {new Date().getFullYear()} YI</span>
        </div>
      </Container>
    </footer>
  );
}
