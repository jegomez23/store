import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Integración de Fase 9 contra el Supabase REAL:
 *
 *  1. El sitemap solo puede contener productos PUBLICADOS. Un borrador o un
 *     producto eliminado en el sitemap sería mandar a Google a un 404, y en el
 *     caso del borrador además filtraría catálogo que el negocio no ha
 *     publicado todavía. Se comprueba con la MISMA clave anónima que usa
 *     `lib/supabase/static.ts`, así que se ejercita RLS de verdad.
 *  2. El CHECK de `product_images.blur_data_url` (migración 0022) rechaza
 *     cualquier cosa que no sea un placeholder WebP en base64 — incluso
 *     escribiendo directamente con la service role key.
 *
 * Los fixtures se crean y se BORRAN aquí; la BD vuelve a su baseline.
 */

interface Env {
  url: string;
  anon: string;
  service: string;
}

function readEnv(): Env | null {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    const map = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const i = line.indexOf("=");
          return [
            line.slice(0, i).trim(),
            line.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
          ];
        }),
    );
    const url = map.NEXT_PUBLIC_SUPABASE_URL;
    const anon = map.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = map.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !service) return null;
    return { url, anon, service };
  } catch {
    return null;
  }
}

const env = readEnv();
const skip = env === null ? "sin .env.local: integración NO VALIDADA" : false;

/** Acceso con service role: SOLO fixtures y limpieza, nunca el flujo probado. */
async function svc(path: string, init: RequestInit = {}) {
  return fetch(`${env!.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Acceso ANÓNIMO: el mismo camino que `lib/supabase/static.ts` en el sitemap. */
async function anon(path: string) {
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    headers: { apikey: env!.anon, Authorization: `Bearer ${env!.anon}` },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const PREFIX = "zz-fase9-sitemap";
const SLUGS = {
  active: `${PREFIX}-activo`,
  draft: `${PREFIX}-borrador`,
  deleted: `${PREFIX}-eliminado`,
  /** Publicado pero SIN variantes activas: su ficha responde 404 (Fase 9.5). */
  sinVariante: `${PREFIX}-sin-variante`,
  /** Publicado, variante activa, stock 0: su ficha responde 200 ("Agotado"). */
  agotado: `${PREFIX}-agotado`,
};

let categoryId = "";
const productIds: string[] = [];

/**
 * Misma consulta que `getSitemapProducts`, palabra por palabra.
 *
 * El `product_variants!inner` + `is_active` se añadió en la Fase 9.5 (5B) al
 * comprobar que faltaba: sin él, el sitemap anunciaba fichas que devuelven 404.
 * Medido sobre el build servido, **2 de 8 URLs del sitemap eran 404**.
 */
const SITEMAP_QUERY =
  "products?select=slug,updated_at,product_variants!inner(id)&market_id=eq.ES&status=eq.active&deleted_at=is.null&product_variants.is_active=eq.true";

async function cleanup() {
  if (!env) return;
  await svc(`product_images?url=like.${PREFIX}*`, { method: "DELETE" });
  const { body: stale } = await (async () => {
    const r = await svc(`products?slug=like.${PREFIX}*&select=id`);
    return { body: (await r.json()) as { id: string }[] };
  })();
  for (const p of stale ?? []) {
    await svc(`product_variants?product_id=eq.${p.id}`, { method: "DELETE" });
  }
  await svc(`products?slug=like.${PREFIX}*`, { method: "DELETE" });
  await svc(`categories?slug=like.${PREFIX}*`, { method: "DELETE" });
}

before(async () => {
  if (!env) return;
  await cleanup();

  const catRes = await svc("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      market_id: "ES",
      name: "ZZ Fase 9 sitemap",
      slug: `${PREFIX}-cat`,
      sort_order: 999,
      // Inactiva: no debe aparecer en el menú de la tienda ni afectar nada.
      is_active: false,
    }),
  });
  const cat = (await catRes.json()) as { id: string }[];
  categoryId = cat[0].id;

  const res = await svc("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Fase 9 activo",
        slug: SLUGS.active,
        // Todos nacen en borrador: publicar sin variantes activas lo rechaza
        // el trigger `enforce_publishable_product` (migración 0031). Se publica
        // más abajo, después de crearlas, que es el orden real del panel.
        status: "draft",
        // PostgREST exige que todos los objetos de un INSERT en lote tengan
        // exactamente las mismas claves.
        deleted_at: null,
      },
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Fase 9 borrador",
        slug: SLUGS.draft,
        status: "draft",
        deleted_at: null,
      },
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Fase 9 eliminado",
        slug: SLUGS.deleted,
        status: "draft",
        deleted_at: null,
      },
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Fase 9 sin variante activa",
        slug: SLUGS.sinVariante,
        status: "draft",
        deleted_at: null,
      },
      {
        market_id: "ES",
        category_id: categoryId,
        name: "ZZ Fase 9 agotado",
        slug: SLUGS.agotado,
        status: "draft",
        deleted_at: null,
      },
    ]),
  });
  const rows = (await res.json()) as { id: string; slug: string }[];
  for (const row of rows) productIds.push(row.id);

  const idBySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));

  async function addVariant(slug: string, stock: number, isActive: boolean) {
    const r = await svc("product_variants", {
      method: "POST",
      body: JSON.stringify({
        product_id: idBySlug[slug],
        sku: `${PREFIX.toUpperCase()}-${slug.slice(-6)}`,
        price: 10,
        stock,
        is_active: isActive,
      }),
    });
    assert.ok(r.status < 300, `variante de ${slug}: ${r.status}`);
  }

  // Con variante activa: publicables. `agotado` además con stock 0, que sigue
  // siendo publicable (su ficha responde 200 y muestra "Agotado").
  await addVariant(SLUGS.active, 5, true);
  await addVariant(SLUGS.deleted, 5, true);
  await addVariant(SLUGS.agotado, 0, true);
  // Con variante INACTIVA: no publicable, su ficha da 404.
  await addVariant(SLUGS.sinVariante, 5, false);

  // Se publican los que deben estarlo. `sinVariante` se publica primero con una
  // variante activa temporal y luego se desactiva: es el ÚNICO camino por el
  // que ese estado se alcanza en producción, porque el trigger impide crearlo
  // de golpe y NO se despublica nada automáticamente.
  const temp = await svc("product_variants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: idBySlug[SLUGS.sinVariante],
      sku: `${PREFIX.toUpperCase()}-TEMP`,
      price: 10,
      stock: 1,
      is_active: true,
    }),
  });
  const tempId = ((await temp.json()) as { id: string }[])[0].id;

  for (const slug of [SLUGS.active, SLUGS.agotado, SLUGS.sinVariante]) {
    const r = await svc(`products?id=eq.${idBySlug[slug]}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    assert.ok(r.status < 300, `publicar ${slug}: ${r.status}`);
  }

  await svc(`product_variants?id=eq.${tempId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: false }),
  });

  // El "eliminado" se publica y luego se borra lógicamente.
  await svc(`products?id=eq.${idBySlug[SLUGS.deleted]}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
  await svc(`products?id=eq.${idBySlug[SLUGS.deleted]}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
});

after(cleanup);

describe("sitemap: solo contenido público", { skip }, () => {
  test("un producto publicado entra en el sitemap", async () => {
    const { status, body } = await anon(SITEMAP_QUERY);
    assert.equal(status, 200);
    const slugs = (body as { slug: string }[]).map((r) => r.slug);
    assert.ok(slugs.includes(SLUGS.active), "el producto activo debería estar");
  });

  test("un BORRADOR nunca entra en el sitemap", async () => {
    const { body } = await anon(SITEMAP_QUERY);
    const slugs = (body as { slug: string }[]).map((r) => r.slug);
    assert.ok(!slugs.includes(SLUGS.draft), "un borrador no puede publicarse a Google");
  });

  test("un producto ELIMINADO nunca entra en el sitemap", async () => {
    const { body } = await anon(SITEMAP_QUERY);
    const slugs = (body as { slug: string }[]).map((r) => r.slug);
    assert.ok(!slugs.includes(SLUGS.deleted), "un eliminado sería un 404 anunciado");
  });

  test("un publicado SIN variantes activas no entra: su ficha da 404", async () => {
    // REGRESIÓN de la Fase 9.5 (5B). Antes esta consulta filtraba solo por
    // `status='active'`, mientras que `getProductBySlug` devuelve null sin
    // variantes activas. Resultado medido sobre el build servido: el sitemap
    // anunciaba /producto/... que respondían 404 — exactamente lo que el
    // comentario de `getSitemapProducts` decía evitar.
    const { body } = await anon(SITEMAP_QUERY);
    const slugs = (body as { slug: string }[]).map((r) => r.slug);
    assert.ok(
      !slugs.includes(SLUGS.sinVariante),
      "un producto cuya ficha responde 404 no puede anunciarse a Google",
    );
  });

  test("un AGOTADO sí entra: su ficha responde 200 y muestra «Agotado»", async () => {
    // CONTROL POSITIVO, y la línea que separa los dos conceptos. Si esto
    // fallara, el filtro nuevo estaría escondiendo producto vendible en cuanto
    // se queda sin stock — que es una decisión de negocio que nadie ha tomado.
    const { body } = await anon(SITEMAP_QUERY);
    const slugs = (body as { slug: string }[]).map((r) => r.slug);
    assert.ok(
      slugs.includes(SLUGS.agotado),
      "el agotado es comportamiento intencionado (01-PRODUCT.md), no un error",
    );
  });

  test("RLS ya oculta el borrador aunque se pida explícitamente", async () => {
    // Sin el filtro de status: la policy pública debe seguir tapándolo.
    const { body } = await anon(`products?select=slug&slug=eq.${SLUGS.draft}`);
    assert.deepEqual(body, [], "el anónimo no puede ver un borrador ni pidiéndolo");
  });

  test("el sitemap devuelve `updated_at` para el lastModified", async () => {
    const { body } = await anon(`${SITEMAP_QUERY}&slug=eq.${SLUGS.active}`);
    const rows = body as { slug: string; updated_at: string }[];
    assert.equal(rows.length, 1);
    assert.ok(!Number.isNaN(Date.parse(rows[0].updated_at)), "updated_at debe ser una fecha");
  });

  test("una categoría INACTIVA no es visible para el anónimo", async () => {
    const { body } = await anon(`categories?select=slug&slug=eq.${PREFIX}-cat`);
    assert.deepEqual(body, [], "una categoría desactivada no puede salir en el menú");
  });
});

describe("blur_data_url: CHECK de la migración 0022", { skip }, () => {
  async function insertImage(blur: string | null) {
    const response = await svc("product_images", {
      method: "POST",
      body: JSON.stringify({
        product_id: productIds[0],
        url: `${PREFIX}/x.webp`,
        alt_text: "fixture",
        sort_order: 0,
        is_primary: false,
        blur_data_url: blur,
      }),
    });
    if (response.status < 300) {
      await svc(`product_images?url=eq.${PREFIX}/x.webp`, { method: "DELETE" });
    }
    return response.status;
  }

  test("acepta NULL: las imágenes anteriores a Fase 9 siguen siendo válidas", async () => {
    assert.ok((await insertImage(null)) < 300);
  });

  test("acepta un placeholder WebP en base64", async () => {
    const valid = `data:image/webp;base64,${"UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="}`;
    assert.ok((await insertImage(valid)) < 300);
  });

  test("RECHAZA un data URI que no sea WebP", async () => {
    assert.ok((await insertImage("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")) >= 400);
    assert.ok((await insertImage("data:text/html;base64,PHNjcmlwdD4=")) >= 400);
  });

  test("RECHAZA una URL remota disfrazada de blur", async () => {
    assert.ok((await insertImage("https://evil.example/x.webp")) >= 400);
  });

  test("RECHAZA una imagen entera: el límite de 4000 caracteres es real", async () => {
    assert.ok((await insertImage(`data:image/webp;base64,${"A".repeat(4100)}`)) >= 400);
  });

  test("RECHAZA un data URI demasiado corto para ser una imagen", async () => {
    assert.ok((await insertImage("data:image/webp;base64,AA")) >= 400);
  });
});
