"use client";

import { useState } from "react";
import Image from "next/image";
import { MockImage } from "@/components/ui/MockImage";

interface RemoteImageProps {
  src: string | null;
  alt: string;
  ratio?: "portrait" | "square" | "wide";
  priority?: boolean;
  className?: string;
  /**
   * Placeholder blur (Fase 9). Data URI WebP generado en el SERVIDOR durante la
   * subida y guardado en `product_images.blur_data_url`. Nunca se construye
   * aquí ni se acepta de otra fuente. `null` (imágenes anteriores a Fase 9) →
   * no se pinta placeholder, que es el comportamiento de siempre.
   */
  blurDataURL?: string | null;
  /**
   * `sizes` de `next/image`. El default sirve para las rejillas de 2/4
   * columnas; la imagen principal de la ficha ocupa media pantalla en desktop
   * y la pasa explícitamente (`09-SEO-PERFORMANCE.md` §54).
   */
  sizes?: string;
}

const RATIO_CLASSES: Record<NonNullable<RemoteImageProps["ratio"]>, string> = {
  portrait: "aspect-[3/4]",
  square: "aspect-square",
  wide: "aspect-[16/9]",
};

/**
 * `next/image` con fallback a `MockImage` cuando no hay `src` o la imagen
 * remota falla al cargar (detectable solo client-side — de ahí 'use client').
 */
export function RemoteImage({
  src,
  alt,
  ratio = "portrait",
  priority,
  className = "",
  blurDataURL = null,
  sizes = "(min-width: 768px) 25vw, 50vw",
}: RemoteImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <MockImage label={alt} ratio={ratio} className={className} />;
  }

  return (
    <div
      className={`relative overflow-hidden rounded-md bg-cream-dark ${RATIO_CLASSES[ratio]} ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // `placeholder="blur"` exige `blurDataURL` para imágenes remotas: se
        // pasan siempre juntos o ninguno.
        {...(blurDataURL
          ? { placeholder: "blur" as const, blurDataURL }
          : {})}
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
