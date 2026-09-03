/**
 * Validación pura de categorías, bloques de home y ajustes (Fase 8).
 *
 * Solo campos que EXISTEN en el esquema real. Nada de page builder genérico:
 * las secciones de `home_content` son las tres del CHECK de la migración 0014.
 *
 * Sin I/O ni imports en runtime: ejecutable con `node --test` (DEC-025).
 */

// ───────────────────────────────────────────────────────────── Categorías

export const CATEGORY_LIMITS = { name: 80, description: 500 } as const;

export interface CategoryInput {
  name: string;
  slug: string;
  description: string | null;
  /** `null` = categoría raíz. Máx. 2 niveles: lo impone el trigger de la 0005. */
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type CategoryValidation =
  | { ok: true; input: CategoryInput }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateCategoryInput(
  raw: Record<string, unknown>,
  slugValidator: (v: string) => { ok: true; value: string } | { ok: false; error: string },
): CategoryValidation {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2) return { ok: false, error: "El nombre debe tener al menos 2 caracteres." };
  if (name.length > CATEGORY_LIMITS.name) {
    return { ok: false, error: `El nombre no puede superar ${CATEGORY_LIMITS.name} caracteres.` };
  }

  const slug = slugValidator(typeof raw.slug === "string" ? raw.slug : "");
  if (!slug.ok) return { ok: false, error: slug.error };

  let parentId: string | null = null;
  if (typeof raw.parentId === "string" && raw.parentId.length > 0) {
    if (!UUID.test(raw.parentId)) return { ok: false, error: "La categoría padre no es válida." };
    parentId = raw.parentId;
  }

  let description: string | null = null;
  if (typeof raw.description === "string" && raw.description.trim().length > 0) {
    const trimmed = raw.description.trim();
    if (trimmed.length > CATEGORY_LIMITS.description) {
      return { ok: false, error: `La descripción no puede superar ${CATEGORY_LIMITS.description} caracteres.` };
    }
    description = trimmed;
  }

  const sortOrder = parseSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };

  return {
    ok: true,
    input: { name, slug: slug.value, description, parentId, sortOrder: sortOrder.value, isActive: raw.isActive === true },
  };
}

export const MAX_SORT_ORDER = 9999;

export type SortOrderResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * `sort_order` es `int not null default 0`. Se valida con regex ANTES de
 * convertir: `Number("1e3")` da 1000 y `Number("")` da 0.
 */
export function parseSortOrder(raw: unknown): SortOrderResult {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: 0 };
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: "El orden debe ser un número entero de 0 o más." };
  }
  const value = Number.parseInt(text, 10);
  if (value > MAX_SORT_ORDER) {
    return { ok: false, error: `El orden no puede superar ${MAX_SORT_ORDER}.` };
  }
  return { ok: true, value };
}

/**
 * La jerarquía es de 2 niveles como máximo (trigger `enforce_category_depth`).
 * La UI no debe ofrecer como padre una categoría que ya tiene padre, ni la
 * propia categoría que se edita.
 */
export function canBeParent(
  candidate: { id: string; parentId: string | null },
  editingId: string | null,
): boolean {
  if (candidate.parentId !== null) return false;
  if (editingId !== null && candidate.id === editingId) return false;
  return true;
}

/** Una categoría con hijos no puede convertirse en hija de otra: sería 3 niveles. */
export function canReceiveParent(hasChildren: boolean): boolean {
  return !hasChildren;
}

// ────────────────────────────────────────────────────────────────── Home

/** Las tres del CHECK de `home_content` (migración 0014). No se inventan más. */
export const HOME_SECTIONS = ["hero", "banner", "strip_promo"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export function isHomeSection(value: unknown): value is HomeSection {
  return typeof value === "string" && (HOME_SECTIONS as readonly string[]).includes(value);
}

// TODO(i18n)
export const HOME_SECTION_LABELS: Record<HomeSection, string> = {
  hero: "Hero",
  banner: "Banner",
  strip_promo: "Franja promocional",
};

export const HOME_LIMITS = {
  title: 120,
  subtitle: 240,
  ctaLabel: 40,
  ctaHref: 500,
} as const;

export interface HomeBlockInput {
  section: HomeSection;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type HomeValidation =
  | { ok: true; input: HomeBlockInput }
  | { ok: false; error: string };

/**
 * `cta_href` acaba en un `href` renderizado. Se admiten solo rutas internas:
 * una URL absoluta permitiría convertir la home en un redirector hacia
 * cualquier sitio desde el panel.
 */
export function parseCtaHref(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = raw.trim();
  if (value.length === 0) return { ok: true, value: null };
  if (value.length > HOME_LIMITS.ctaHref) {
    return { ok: false, error: `El enlace no puede superar ${HOME_LIMITS.ctaHref} caracteres.` };
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return { ok: false, error: "El enlace debe ser una ruta interna que empiece por «/» (ej. /producto/gorra)." };
  }
  return { ok: true, value };
}

export function validateHomeBlockInput(raw: Record<string, unknown>): HomeValidation {
  if (!isHomeSection(raw.section)) {
    return { ok: false, error: "Sección no válida." };
  }

  const text = (v: unknown, max: number, label: string) => {
    if (typeof v !== "string") return { ok: true as const, value: null };
    const t = v.trim();
    if (t.length === 0) return { ok: true as const, value: null };
    if (t.length > max) return { ok: false as const, error: `${label} no puede superar ${max} caracteres.` };
    return { ok: true as const, value: t };
  };

  const title = text(raw.title, HOME_LIMITS.title, "El título");
  if (!title.ok) return { ok: false, error: title.error };
  const subtitle = text(raw.subtitle, HOME_LIMITS.subtitle, "El subtítulo");
  if (!subtitle.ok) return { ok: false, error: subtitle.error };
  const ctaLabel = text(raw.ctaLabel, HOME_LIMITS.ctaLabel, "El texto del botón");
  if (!ctaLabel.ok) return { ok: false, error: ctaLabel.error };

  const ctaHref = parseCtaHref(typeof raw.ctaHref === "string" ? raw.ctaHref : "");
  if (!ctaHref.ok) return { ok: false, error: ctaHref.error };

  if (ctaLabel.value !== null && ctaHref.value === null) {
    return { ok: false, error: "Si pones texto de botón, indica también su enlace." };
  }

  const sortOrder = parseSortOrder(raw.sortOrder);
  if (!sortOrder.ok) return { ok: false, error: sortOrder.error };

  return {
    ok: true,
    input: {
      section: raw.section,
      title: title.value,
      subtitle: subtitle.value,
      ctaLabel: ctaLabel.value,
      ctaHref: ctaHref.value,
      sortOrder: sortOrder.value,
      isActive: raw.isActive === true,
    },
  };
}

// ──────────────────────────────────────────────────────────────── Ajustes

export const SETTINGS_LIMITS = { storeName: 80, email: 254, url: 300 } as const;

export interface SettingsInput {
  storeName: string;
  contactEmail: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  facebookUrl: string | null;
}

export type SettingsValidation =
  | { ok: true; input: SettingsInput }
  | { ok: false; error: string };

/**
 * Las URLs de redes sí son externas por definición, pero se acotan a https
 * para no poder inyectar `javascript:` en un `href`.
 */
export function parseSocialUrl(
  raw: unknown,
  label: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) return { ok: true, value: null };
  const value = raw.trim();
  if (value.length > SETTINGS_LIMITS.url) {
    return { ok: false, error: `${label} no puede superar ${SETTINGS_LIMITS.url} caracteres.` };
  }
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) {
    return { ok: false, error: `${label} debe ser una URL https válida.` };
  }
  return { ok: true, value };
}

export function validateSettingsInput(raw: Record<string, unknown>): SettingsValidation {
  const storeName = typeof raw.storeName === "string" ? raw.storeName.trim() : "";
  if (storeName.length < 2) return { ok: false, error: "El nombre de la tienda es obligatorio." };
  if (storeName.length > SETTINGS_LIMITS.storeName) {
    return { ok: false, error: `El nombre no puede superar ${SETTINGS_LIMITS.storeName} caracteres.` };
  }

  let contactEmail: string | null = null;
  if (typeof raw.contactEmail === "string" && raw.contactEmail.trim().length > 0) {
    const email = raw.contactEmail.trim();
    if (email.length > SETTINGS_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false, error: "El email de contacto no es válido." };
    }
    contactEmail = email;
  }

  const instagram = parseSocialUrl(raw.instagramUrl, "La URL de Instagram");
  if (!instagram.ok) return { ok: false, error: instagram.error };
  const tiktok = parseSocialUrl(raw.tiktokUrl, "La URL de TikTok");
  if (!tiktok.ok) return { ok: false, error: tiktok.error };
  const facebook = parseSocialUrl(raw.facebookUrl, "La URL de Facebook");
  if (!facebook.ok) return { ok: false, error: facebook.error };

  return {
    ok: true,
    input: {
      storeName,
      contactEmail,
      instagramUrl: instagram.value,
      tiktokUrl: tiktok.value,
      facebookUrl: facebook.value,
    },
  };
}
