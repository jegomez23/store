import { useRef, useState } from "react";
import { mayNeedResizeBeforeUpload, uploadBudgetPerFile } from "@/lib/admin/images";

/**
 * Reduce en el NAVEGADOR las fotos elegidas para que quepan en una petición a
 * Vercel (DEC-089).
 *
 * POR QUÉ EXISTE: Vercel corta cualquier cuerpo de más de 4,5 MB con un 413
 * antes de que llegue al servidor, y una foto de móvil corriente pesa entre 2 y
 * 5 MB. Sin esto, subir fotos desde el móvil fallaba en producción con un error
 * genérico, aunque en local funcionara.
 *
 * LO QUE NO CAMBIA: el servidor sigue siendo la autoridad. Recibe un JPEG, PNG
 * o WebP corriente, lo valida por magic bytes y `sharp` lo vuelve a codificar a
 * WebP como siempre. Reducir aquí es transporte, no validación: un navegador
 * manipulado que se salte este paso choca igual con el 413 o con
 * `checkImageUpload`.
 *
 * Se reduce hasta `maxEdge` px de lado —el mismo tope que aplica `sharp`
 * después, así que no se pierde nada que se fuera a conservar—. Desde DEC-091
 * se reduce también una foto que cabe pero trae más píxeles de los que se van
 * a guardar: subirlos era el paso más lento del alta. Una foto ligera o que ya
 * tiene el tamaño final se manda INTACTA.
 *
 * Mecánica: las fotos reducidas se vuelven a meter en el propio `<input>` con
 * `DataTransfer`, así que el formulario y la Server Action no cambian. Mientras
 * se preparan, `guardSubmit` impide enviar (en React 19, un `preventDefault`
 * en `onSubmit` cancela la action del formulario).
 */

const ATTEMPTS: ReadonlyArray<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.85 },
  { scale: 1, quality: 0.72 },
  { scale: 0.8, quality: 0.72 },
  { scale: 0.6, quality: 0.72 },
  { scale: 0.45, quality: 0.7 },
];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name: string, type: string): string {
  const extension = type === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^./]+$/, "") || "foto";
  return `${base}.${extension}`;
}

/**
 * Devuelve el archivo original si no hay nada que ganar —pesa poco, o ya tiene
 * el tamaño que va a conservar el servidor y cabe— o si el navegador no sabe
 * abrirlo (que lo diga el servidor). Si no, la primera versión que quepa y
 * pese menos que el original. Un PNG se intenta primero como PNG para no
 * perder la transparencia de un logo.
 *
 * Desde DEC-091 también se reduce una foto que YA cabía pero trae más píxeles
 * de los que `sharp` va a guardar: es lo que más tiempo de subida ahorra.
 */
async function shrinkImageFile(file: File, maxBytes: number, maxEdge: number): Promise<File> {
  if (!mayNeedResizeBeforeUpload(file.size, maxBytes)) return file;

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return file;
  }

  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  if (longest === 0) return file;
  if (longest <= maxEdge && file.size <= maxBytes) return file;
  const types = file.type === "image/png" ? ["image/png", "image/jpeg"] : ["image/jpeg"];
  // Nunca se cambia el original por algo que pese lo mismo o más.
  const limit = Math.min(maxBytes, file.size - 1);
  // Si ya cabía, solo se prueba la calidad alta: bajar más la calidad de una
  // foto que se podía enviar es perder nitidez por nada.
  const attempts = file.size <= maxBytes ? ATTEMPTS.slice(0, 1) : ATTEMPTS;

  for (const attempt of attempts) {
    const scale = Math.min(1, (maxEdge * attempt.scale) / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const type of types) {
      const blob = await toBlob(canvas, type, attempt.quality);
      if (blob && blob.size <= limit) {
        return new File([blob], renamed(file.name, type), {
          type,
          lastModified: file.lastModified,
        });
      }
    }
  }
  return file;
}

export interface ImageShrinker {
  /** Preparando fotos: no se puede enviar todavía. */
  busy: boolean;
  /** Fotos que ni reducidas caben. Se dice y no se envía. */
  problem: string | null;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  guardSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function useImageShrinker(maxEdge: number): ImageShrinker {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Si se elige otra vez mientras se reduce, la tanda vieja no pisa la nueva. */
  const run = useRef(0);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    const current = ++run.current;
    setProblem(null);
    if (files.length === 0) {
      setBusy(false);
      return;
    }

    const budget = uploadBudgetPerFile(files.length);
    if (files.every((file) => !mayNeedResizeBeforeUpload(file.size, budget))) {
      setBusy(false);
      return;
    }

    setBusy(true);
    void (async () => {
      const prepared: File[] = [];
      for (const file of files) {
        prepared.push(await shrinkImageFile(file, budget, maxEdge));
      }
      if (current !== run.current) return;

      const transfer = new DataTransfer();
      for (const file of prepared) transfer.items.add(file);
      input.files = transfer.files;

      const tooBig = prepared.filter((file) => file.size > budget);
      // TODO(i18n)
      setProblem(
        tooBig.length === 0
          ? null
          : `No se ha podido reducir ${tooBig.map((file) => file.name).join(", ")} lo suficiente para enviarla. Prueba con otra foto o con menos a la vez.`,
      );
      setBusy(false);
    })();
  }

  function guardSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (busy || problem !== null) event.preventDefault();
  }

  return { busy, problem, onChange, guardSubmit };
}
