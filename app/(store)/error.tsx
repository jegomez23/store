"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Error boundary del segmento público (docs/02-ARCHITECTURE.md §6). Captura
 * fallos reales de datos (Supabase inalcanzable, mercado no resuelto, etc.)
 * — nunca expone el detalle técnico al usuario (docs/rules/security.md #10).
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-black">
        Algo salió mal
      </h1>
      <p className="text-sm text-gray-700">
        No pudimos cargar esta página. Inténtalo de nuevo en un momento.
      </p>
      <Button variant="primary" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
