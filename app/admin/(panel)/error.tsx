"use client";

/**
 * Error boundary del panel (docs/02-ARCHITECTURE.md §6). Mensaje genérico: el
 * detalle técnico solo va al log del servidor (docs/rules/security.md #10).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      {/* TODO(i18n) */}
      <h1 className="text-xl font-bold tracking-tight text-black">
        Algo ha fallado
      </h1>
      <p className="text-sm text-gray-700">
        No se ha podido cargar esta pantalla. Vuelve a intentarlo; si sigue
        fallando, revisa la conexión con la base de datos.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-gray-400">ref: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="h-11 rounded-full border border-black px-5 text-sm font-medium text-black transition-colors duration-200 ease-out hover:bg-black hover:text-white"
      >
        {/* TODO(i18n) */}
        Reintentar
      </button>
    </div>
  );
}
