import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getStorefrontSettings } from "@/lib/data/settings";
import { getActiveMarket } from "@/lib/markets";

/**
 * Imagen Open Graph de la home (Fase 9, `docs/09-SEO-PERFORMANCE.md` §29).
 *
 * Es tipográfica a propósito: no hay fotografía de marca en el repositorio y
 * no se inventa una. Usa los mismos colores del design system (`globals.css`,
 * `04-UX-UI.md`).
 *
 * `next/og` viene dentro de Next 16: no añade ninguna dependencia (regla #8 de
 * CLAUDE.md).
 *
 * NO hay OG por producto: `09-SEO-PERFORMANCE.md` §29 la difiere explícitamente
 * ("Generación dinámica por producto: diferida hasta justificarla"). Las fichas
 * usan como OG su propia foto de catálogo, que es mejor que cualquier plantilla.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INCREMENTO 16: EL NOMBRE Y LA FRASE SALEN DE `settings`
 * ─────────────────────────────────────────────────────────────────────────
 * Esta es LA imagen que se ve al pegar el enlace de la tienda en WhatsApp, en
 * Instagram o en un anuncio. Tenía «YI» y «Vive a tu propio ritmo.» escritos a
 * mano: renombrar la tienda desde el panel dejaba la marca vieja justo en el
 * sitio donde más se ve.
 *
 * Deja de ser un archivo horneado en el build y pasa a ISR de 5 minutos, la
 * misma cadencia que la home (DEC-004). Además queda dentro del alcance de
 * `revalidateStorefront()` —`revalidatePath("/", "layout")` invalida las
 * páginas bajo el layout raíz—, así que al guardar en Ajustes la imagen se
 * regenera con el resto de la tienda.
 *
 * El kicker («Streetwear · Naturaleza · Ciudad») se queda en el código porque
 * es la composición de la plantilla, no un dato comercial: no lo edita nadie
 * desde el panel y no hay pantalla que lo ofrezca.
 */

export const revalidate = 300;

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * `alt` tiene que ser una constante: `generateImageMetadata` existe para
 * generar VARIAS imágenes por ruta y añade un `?id=` a la URL
 * (`node_modules/next/dist/docs/.../generate-image-metadata.md`), que aquí no
 * hace ninguna falta. Como el contenido ya no es fijo, el texto alternativo
 * describe la función de la imagen en vez de repetir una marca que puede haber
 * cambiado.
 */
export const alt = "Portada de la tienda";

/**
 * ── El logo, si lo hay (incremento 17) ────────────────────────────────────
 *
 * `ImageResponse` no puede pedir una URL remota por su cuenta de forma fiable
 * dentro de una ruta de metadata, así que los bytes se traen aquí y se pasan
 * como data URI. Con un tope de tiempo: esta imagen se regenera cada 5 minutos
 * y una petición colgada dejaría la tarjeta de Open Graph sin responder.
 *
 * ⚠️ **SE CONVIERTE A PNG, Y NO ES OPCIONAL. MEDIDO.** El logo se guarda en
 * WebP (`lib/storage/logo.ts`), y **`next/og` no sabe decodificar WebP**: con
 * un data URI WebP, la ruta devolvió `500` y el log del servidor dijo
 * `TypeError: u2 is not iterable` — el detector de formatos de Satori se va por
 * la rama del SVG y revienta. Verificado en su código compilado
 * (`node_modules/next/dist/compiled/@vercel/og/index.node.js`: la lista de
 * tipos admitidos no incluye WebP). O sea: subir un logo dejaba la tarjeta de
 * Open Graph rota **justo en el sitio donde se comparte la tienda**.
 *
 * `sharp` ya es dependencia del proyecto y esta ruta corre en Node, así que la
 * conversión no añade nada nuevo. Se hace como mucho una vez cada 5 minutos.
 *
 * **NUNCA rompe la tarjeta.** Cualquier fallo —red, 404, objeto enorme, sharp—
 * cae al mismo diseño tipográfico que había antes. Una tarjeta sin logo es peor
 * que una con logo; una tarjeta que no carga es peor que las dos.
 */
async function fetchLogoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    // El objeto lo genera `lib/storage/logo.ts` acotado a 512 px, así que
    // pasarse de 1 MB significa que no es nuestro: no se pinta.
    if (buffer.byteLength === 0 || buffer.byteLength > 1024 * 1024) return null;

    const png = await sharp(Buffer.from(buffer)).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.error("[og] no se pudo cargar el logo para la portada", {
      message: error instanceof Error ? error.message : "desconocido",
    });
    return null;
  }
}

export default async function OpengraphImage() {
  const market = await getActiveMarket();
  const settings = await getStorefrontSettings(market);
  const logo = await fetchLogoDataUri(settings?.logoUrl ?? null);

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
        {/*
          CON LOGO, EL LOGO MANDA. El nombre no se repite debajo: la tarjeta se
          ve a tamaño de miniatura en un chat, y decir la marca dos veces gasta
          el espacio que necesita la frase. Sin logo, el nombre ocupa su sitio,
          que es exactamente lo que hacía antes del incremento 17.
        */}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            style={{ maxWidth: 720, maxHeight: 260, objectFit: "contain" }}
          />
        ) : settings?.storeName ? (
          <div
            style={{
              /*
                El nombre ya no es de longitud conocida: con `store_name` de
                hasta 80 caracteres (CHECK de la 0042) un tamaño fijo de 180 px
                se saldría del lienzo. Se escala por tramos y se deja que el
                texto ocupe como mucho el ancho útil.
              */
              fontSize: settings.storeName.length <= 4 ? 180 : settings.storeName.length <= 12 ? 110 : 64,
              fontWeight: 700,
              letterSpacing: -6,
              maxWidth: 1040,
              textAlign: "center",
              lineHeight: 1.05,
            }}
          >
            {settings.storeName}
          </div>
        ) : null}
        {settings?.tagline ? (
          <div
            style={{ fontSize: 40, color: "#3d3a35", maxWidth: 900, textAlign: "center" }}
          >
            {settings.tagline}
          </div>
        ) : null}
        <div style={{ width: 120, height: 8, backgroundColor: "#c8102e" }} />
      </div>
    ),
    size,
  );
}
