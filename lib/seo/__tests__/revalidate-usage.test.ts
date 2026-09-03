import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Guardas ESTÁTICAS sobre la estrategia de invalidación (Fase 9).
 *
 * No prueban comportamiento en runtime —eso se mide contra el build servido—,
 * sino que impiden que vuelva a colarse la clase de fallo que Fase 8 detectó y
 * que Fase 9 encontró todavía viva en el panel de pedidos:
 *
 *   `revalidatePath("/producto/[slug]", "page")` NO invalida las fichas ya
 *   prerenderizadas por `generateStaticParams` (DEC-037). Un producto retirado
 *   seguía comprándose; un pedido cancelado devolvía stock que la ficha no
 *   mostraba.
 *
 * La regla es sencilla y comprobable: en este repositorio NADIE llama a
 * `revalidatePath` con una ruta que contenga un segmento dinámico `[...]`.
 */

const ROOTS = ["app", "lib", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sources = ROOTS.filter((r) => fs.existsSync(r)).flatMap((r) => walk(r));

/**
 * Quita comentarios antes de analizar: varios de estos archivos DOCUMENTAN el
 * patrón prohibido para explicar por qué no se usa, y un comentario no invalida
 * nada. Se busca código real.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("invalidación por ruta literal (DEC-037)", () => {
  test("hay archivos que analizar", () => {
    assert.ok(sources.length > 20, `solo ${sources.length} archivos`);
  });

  test("ninguna llamada a revalidatePath usa un patrón con [segmento]", () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const content = stripComments(fs.readFileSync(file, "utf8"));
      for (const match of content.matchAll(/revalidatePath\(\s*(["'`])([^"'`]*)\1/g)) {
        const routeArg = match[2];
        // Un template literal (`/admin/catalogo/${id}`) es una ruta literal
        // en tiempo de ejecución: no es el patrón que se persigue.
        if (routeArg.includes("${")) continue;
        if (routeArg.includes("[") && routeArg.includes("]")) {
          offenders.push(`${file}: revalidatePath("${routeArg}")`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `revalidatePath con patrón dinámico (no invalida lo prerenderizado):\n${offenders.join("\n")}`,
    );
  });

  test("el panel de pedidos invalida los productos afectados, no un patrón", () => {
    const content = stripComments(
      fs.readFileSync(path.join("app", "admin", "(panel)", "pedidos", "actions.ts"), "utf8"),
    );
    assert.ok(
      content.includes("revalidateProducts("),
      "cancelar un pedido debe invalidar las fichas de sus líneas",
    );
    assert.ok(
      !content.includes('"/producto/[slug]"'),
      "no debe quedar la invalidación por patrón",
    );
  });

  test("toda mutación de producto invalida también el sitemap", () => {
    const content = fs.readFileSync(path.join("lib", "admin", "revalidate.ts"), "utf8");
    assert.ok(content.includes('revalidatePath("/sitemap.xml")'));
    assert.ok(
      /export function revalidateProductAndHome[\s\S]{0,220}revalidateSitemap\(\)/.test(content),
      "revalidateProductAndHome debe invalidar el sitemap",
    );
    assert.ok(
      /export function revalidateStorefront[\s\S]{0,220}revalidateSitemap\(\)/.test(content),
      "revalidateStorefront debe invalidar el sitemap",
    );
  });

  test("la tienda NO se ha convertido en force-dynamic para tapar la caché", () => {
    // DEC-021: cambiar la estrategia de render para "resolver" la invalidación
    // está explícitamente prohibido.
    for (const file of ["app/(store)/page.tsx", "app/(store)/producto/[slug]/page.tsx"]) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes("force-dynamic"),
        `${file} no puede ser force-dynamic (DEC-004/DEC-021)`,
      );
      assert.ok(
        content.includes("export const revalidate = 300"),
        `${file} debe conservar el ISR de 5 min`,
      );
    }
  });
});
