import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-black">
        Página no encontrada
      </h1>
      <p className="text-sm text-gray-700">
        Lo que buscas no existe o ya no está disponible.
      </p>
      <Link href="/">
        <Button variant="primary">Volver al inicio</Button>
      </Link>
    </div>
  );
}
