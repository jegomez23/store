/**
 * Recuperación de contraseña — LÓGICA PURA (incremento 18).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA POLÍTICA DE CONTRASEÑAS ES LA DE SUPABASE, NO UNA INVENTADA AQUÍ
 * ─────────────────────────────────────────────────────────────────────────
 * MEDIDO contra el proyecto real antes de escribir esto:
 *
 *     "123"    → 422 · weak_password · "Password should be at least 6 characters."
 *     "Aa1"    → 422 · weak_password · lo mismo
 *     "corta"  → 422 · weak_password · lo mismo
 *
 * O sea: el proyecto exige **6 caracteres y nada más**. No hay requisito de
 * mayúsculas, dígitos ni símbolos, así que aquí tampoco se inventa ninguno:
 * pedir en el formulario algo que el servidor no exige es mentirle al usuario
 * y, si algún día se endurece la política en el panel de Supabase, esta copia
 * se quedaría corta sin que nadie se entere.
 *
 * Lo que sí se comprueba aquí es lo que Supabase NO puede comprobar: que las
 * dos casillas coincidan. Y el mínimo se replica para dar el mensaje antes de
 * gastar una ida y vuelta — la autoridad sigue siendo el servidor, cuyo error
 * se muestra tal cual si llega (`weakPasswordMessage`).
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

/** Mínimo que impone el proyecto en Supabase Auth, medido. */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Tope de cordura para no mandar payloads absurdos a la red. No es una regla
 * de negocio: bcrypt trabaja sobre los primeros 72 bytes, así que por encima
 * de esto no se gana seguridad.
 */
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordCheck = { ok: true; password: string } | { ok: false; error: string };

// TODO(i18n)
export function validateNewPassword(password: unknown, confirmation: unknown): PasswordCheck {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Escribe la contraseña nueva." };
  }
  if (typeof confirmation !== "string" || confirmation.length === 0) {
    return { ok: false, error: "Repite la contraseña nueva." };
  }
  // NO se recorta: un espacio al principio o al final forma parte de la
  // contraseña, y quitarlo guardaría una distinta de la que se tecleó.
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: "La contraseña es demasiado larga." };
  }
  if (password !== confirmation) {
    return { ok: false, error: "Las dos contraseñas no coinciden." };
  }
  return { ok: true, password };
}

/**
 * Forma mínima de un email, solo para no gastar una petición en algo que
 * evidentemente no lo es.
 *
 * ⚠️ **Esto NO decide si la cuenta existe, y no debe usarse para decírselo a
 * nadie.** Quien responde a «¿hay cuenta con este email?» es Supabase, y
 * responde **200 con el cuerpo vacío tanto si existe como si no** (medido).
 * La pantalla da siempre el mismo mensaje: ver `app/admin/(auth)/recuperar`.
 */
export function looksLikeEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length < 3 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/**
 * Traduce a algo legible lo que responde Supabase Auth al cambiar la clave.
 *
 * `weak_password` se muestra CON el mensaje del servidor, no con uno propio:
 * es la única forma de que el usuario vea la regla real si algún día se
 * endurece la política en el panel de Supabase.
 */
export function passwordErrorMessage(
  code: string | undefined,
  serverMessage: string | undefined,
): string {
  switch (code) {
    case "weak_password":
      return serverMessage && serverMessage.length > 0
        ? serverMessage
        : `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    case "same_password":
      return "La contraseña nueva tiene que ser distinta de la anterior.";
    case "otp_expired":
    case "session_not_found":
      return "El enlace ya no es válido. Pide uno nuevo.";
    default:
      return "No se pudo cambiar la contraseña. Inténtalo de nuevo.";
  }
}
