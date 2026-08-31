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
        sizes="(min-width: 768px) 25vw, 50vw"
        priority={priority}
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
