import { ImageResponse } from "next/og";

/**
 * Imagen Open Graph de la home (Fase 9, `docs/09-SEO-PERFORMANCE.md` §29).
 *
 * Es tipográfica a propósito: no hay fotografía de marca en el repositorio y
 * no se inventa una. Usa los mismos colores del design system (`globals.css`,
 * `04-UX-UI.md`) y el mismo claim que ya está en la metadata base, así que no
 * introduce ningún contenido comercial nuevo.
 *
 * `next/og` viene dentro de Next 16: no añade ninguna dependencia (regla #8 de
 * CLAUDE.md). Se genera una sola vez en build y se sirve como archivo estático.
 *
 * NO hay OG por producto: `09-SEO-PERFORMANCE.md` §29 la difiere explícitamente
 * ("Generación dinámica por producto: diferida hasta justificarla"). Las fichas
 * usan como OG su propia foto de catálogo, que es mejor que cualquier plantilla.
 */

export const alt = "YI — Vive a tu propio ritmo.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          backgroundColor: "#faf7f2",
          color: "#111111",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 12,
            textTransform: "uppercase",
            color: "#8a8378",
          }}
        >
          Streetwear · Naturaleza · Ciudad
        </div>
        <div style={{ fontSize: 180, fontWeight: 700, letterSpacing: -6 }}>YI</div>
        <div style={{ fontSize: 40, color: "#3d3a35" }}>
          Vive a tu propio ritmo.
        </div>
        <div style={{ width: 120, height: 8, backgroundColor: "#c8102e" }} />
      </div>
    ),
    size,
  );
}
