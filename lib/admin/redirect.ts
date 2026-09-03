/**
 * Destino de vuelta tras el login (`?next=`).
 *
 * Un parámetro de query es input no confiable: sin esta validación,
 * `/admin/login?next=https://evil.example` convertiría el login en un
 * open redirect. Se acepta ÚNICAMENTE una ruta interna del panel.
 *
 * Función pura y sin I/O para poder testearla (docs/rules/testing.md #1).
 */

export const ADMIN_HOME = "/admin";

export function safeAdminRedirect(value: string | undefined | null): string {
  if (typeof value !== "string" || value.length === 0) return ADMIN_HOME;
  // Rechaza absolutas (`https://…`), protocol-relative (`//evil`) y
  // backslashes, que algunos navegadores normalizan a `/`.
  if (!value.startsWith("/")) return ADMIN_HOME;
  if (value.startsWith("//") || value.includes("\\")) return ADMIN_HOME;
  if (value !== ADMIN_HOME && !value.startsWith("/admin/")) return ADMIN_HOME;
  if (value.startsWith("/admin/login")) return ADMIN_HOME;
  return value;
}
