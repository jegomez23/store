import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * El logo de la tienda contra el Supabase REAL (Incremento 17).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ PROTEGEN ESTOS TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. **El logo es público, pero solo lo cambia un admin.** El bucket
 *      `content` ya tenía las policies correctas desde la 0015; esto lo
 *      COMPRUEBA en vez de darlo por hecho.
 *   2. **La sustitución no deja huérfanos** y, sobre todo, **nunca deja
 *      `logo_url` apuntando a un objeto que no existe**: eso sería la tienda
 *      entera con la imagen rota.
 *   3. **El cliente puede LEER el objeto** con la anon key, que es lo que hace
 *      su navegador al pintar la cabecera.
 *
 * La fila real de `settings` del mercado ES se guarda al empezar y se restaura
 * al terminar, y todo objeto creado aquí se borra.
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

const BUCKET = "content";

async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env!.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Sube un objeto al bucket con el token que se le pase (o sin ninguno). */
async function uploadAs(token: string | null, path: string, bytes: Uint8Array) {
  const response = await fetch(`${env!.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: env!.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "image/webp",
    },
    body: bytes as unknown as BodyInit,
  });
  return { status: response.status, text: await response.text() };
}

async function deleteAs(token: string | null, path: string) {
  const response = await fetch(`${env!.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: {
      apikey: env!.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: response.status, text: await response.text() };
}

/** Lectura pública, exactamente como la hace el navegador del cliente. */
async function publicGet(path: string) {
  const response = await fetch(`${env!.url}/storage/v1/object/public/${BUCKET}/${path}`);
  return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
}

/**
 * ¿Existe el objeto DE VERDAD? Se pregunta a la API de Storage, no a la URL
 * pública.
 *
 * ⚠️ MEDIDO EN ESTE INCREMENTO, y es justo la razón de que cada subida use un
 * uuid nuevo: tras borrar un objeto, su URL pública **sigue devolviendo 200**
 * un rato — la sirve el CDN desde su caché, no Storage. Comprobar la
 * desaparición contra la URL pública daría un test que falla por un motivo
 * falso, y —lo importante— sobrescribir la MISMA ruta al sustituir el logo
 * dejaría al cliente viendo el logo anterior sin que nadie pudiera arreglarlo
 * desde el panel.
 */
async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const prefix = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);

  const response = await fetch(`${env!.url}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 200 }),
  });
  const rows = (await response.json()) as { name: string }[];
  return Array.isArray(rows) && rows.some((row) => row.name === name);
}

async function patchSettingsAs(token: string | null, body: unknown) {
  const response = await fetch(`${env!.url}/rest/v1/settings?market_id=eq.ES`, {
    method: "PATCH",
    headers: {
      apikey: env!.anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

interface TestUser {
  id: string;
  token: string;
}

async function createUser(isAdmin: boolean): Promise<TestUser> {
  const email = `logo-${isAdmin ? "adm" : "usr"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@yi-test.local`;
  const password = `Lg-${Math.random().toString(36).slice(2)}-D5`;

  const created = await fetch(`${env!.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env!.service,
      Authorization: `Bearer ${env!.service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = (await created.json()) as { id?: string };
  assert.ok(user.id, "no se pudo crear el usuario");

  if (isAdmin) {
    const profile = await db("profiles", {
      method: "POST",
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Admin Logo" }),
    });
    assert.equal(profile.status, 201, JSON.stringify(profile.body));
  }

  const session = await fetch(`${env!.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokens = (await session.json()) as { access_token?: string };
  assert.ok(tokens.access_token, "login del fixture falló");
  return { id: user.id, token: tokens.access_token };
}

async function deleteUser(id: string): Promise<void> {
  await db(`profiles?id=eq.${id}`, { method: "DELETE" });
  await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

/** WebP mínimo real (RIFF….WEBP): sirve como objeto de prueba. */
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
]);

const UNIQUE = Math.random().toString(36).slice(2, 8);
const OLD_PATH = `logo/ES-aaaaaaaa-0000-4000-8000-${UNIQUE}0000.webp`;
const NEW_PATH = `logo/ES-bbbbbbbb-0000-4000-8000-${UNIQUE}0000.webp`;

let admin: TestUser;
let plainUser: TestUser;
let originalLogo: string | null = null;
const created: string[] = [];

before(async () => {
  if (skip) return;
  [admin, plainUser] = await Promise.all([createUser(true), createUser(false)]);
  originalLogo = (await db("settings?market_id=eq.ES&select=logo_url")).body[0].logo_url;
});

after(async () => {
  if (skip) return;
  await db("settings?market_id=eq.ES", {
    method: "PATCH",
    body: JSON.stringify({ logo_url: originalLogo }),
  });
  for (const path of created) {
    await fetch(`${env!.url}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
    });
  }
  for (const user of [admin, plainUser]) {
    if (user?.id) await deleteUser(user.id);
  }
});

describe("logo · quién puede escribir en el bucket `content`", { skip }, () => {
  test("un ADMIN sube el objeto", async () => {
    const response = await uploadAs(admin.token, OLD_PATH, WEBP_BYTES);
    assert.equal(response.status, 200, response.text.slice(0, 200));
    created.push(OLD_PATH);
  });

  test("anon NO puede subir", async () => {
    const path = `logo/ES-cccccccc-0000-4000-8000-${UNIQUE}0000.webp`;
    const response = await uploadAs(null, path, WEBP_BYTES);
    assert.ok(response.status >= 400, `${response.status} ${response.text.slice(0, 160)}`);
    // Control: tampoco quedó creado.
    assert.equal(await objectExists(path), false);
  });

  test("un autenticado SIN rol admin tampoco", async () => {
    const path = `logo/ES-dddddddd-0000-4000-8000-${UNIQUE}0000.webp`;
    const response = await uploadAs(plainUser.token, path, WEBP_BYTES);
    assert.ok(response.status >= 400, `${response.status} ${response.text.slice(0, 160)}`);
    assert.equal(await objectExists(path), false);
  });

  test("anon NO puede borrar el logo publicado", async () => {
    const response = await deleteAs(null, OLD_PATH);
    assert.ok(response.status >= 400, `${response.status} ${response.text.slice(0, 160)}`);
    // Y sigue ahí: lo importante no es el código, es que el objeto no se movió.
    assert.equal(await objectExists(OLD_PATH), true);
  });

  test("un autenticado sin rol admin tampoco puede borrarlo", async () => {
    const response = await deleteAs(plainUser.token, OLD_PATH);
    assert.ok(response.status >= 400, `${response.status} ${response.text.slice(0, 160)}`);
    assert.equal(await objectExists(OLD_PATH), true);
  });
});

describe("logo · el cliente lo LEE, que es de lo que se trata", { skip }, () => {
  test("la URL pública responde 200 y devuelve bytes, SIN sesión", async () => {
    const response = await publicGet(OLD_PATH);
    assert.equal(response.status, 200);
    assert.ok(response.bytes > 0, "el objeto llegó vacío");
  });

  test("una ruta que no existe da 400, no una imagen rota silenciosa", async () => {
    const response = await publicGet(`logo/ES-no-existe-${UNIQUE}.webp`);
    assert.equal(response.status, 400);
  });
});

describe("logo · quién puede cambiar la referencia en `settings`", { skip }, () => {
  test("un admin escribe logo_url", async () => {
    const response = await patchSettingsAs(admin.token, { logo_url: OLD_PATH });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((response.body as { logo_url: string }[])[0].logo_url, OLD_PATH);
  });

  test("anon NO puede, y el valor queda intacto", async () => {
    const before = (await db("settings?market_id=eq.ES&select=logo_url")).body[0];
    const response = await patchSettingsAs(null, { logo_url: "logo/pirata.webp" });
    assert.ok(response.status >= 400, JSON.stringify(response.body));
    assert.deepEqual((await db("settings?market_id=eq.ES&select=logo_url")).body[0], before);
  });

  test("un autenticado SIN rol admin tampoco", async () => {
    const before = (await db("settings?market_id=eq.ES&select=logo_url")).body[0];
    const response = await patchSettingsAs(plainUser.token, { logo_url: "logo/pirata.webp" });
    assert.deepEqual(response.body, [], JSON.stringify(response.body));
    assert.deepEqual((await db("settings?market_id=eq.ES&select=logo_url")).body[0], before);
  });

  test("anon SÍ puede LEER logo_url: la cabecera de la tienda lo necesita", async () => {
    const response = await fetch(
      `${env!.url}/rest/v1/settings?select=store_name,logo_url&market_id=eq.ES`,
      { headers: { apikey: env!.anon } },
    );
    assert.equal(response.status, 200, (await response.text()).slice(0, 160));
  });
});

describe("logo · sustituir es seguro, y el orden es la garantía", { skip }, () => {
  test("el objeto NUEVO tiene una ruta distinta: el CDN no puede servir el viejo", async () => {
    const { buildLogoPath } = await import("../images.ts");
    const a = buildLogoPath("ES", crypto.randomUUID());
    const b = buildLogoPath("ES", crypto.randomUUID());
    assert.notEqual(a, b);
  });

  test("sustitución completa: sube el nuevo, apunta al nuevo, borra el viejo", async () => {
    // Estado de partida: logo_url = OLD_PATH y el objeto existe.
    assert.equal((await db("settings?market_id=eq.ES&select=logo_url")).body[0].logo_url, OLD_PATH);
    assert.equal(await objectExists(OLD_PATH), true);

    // 1. objeto nuevo
    const upload = await uploadAs(admin.token, NEW_PATH, WEBP_BYTES);
    assert.equal(upload.status, 200, upload.text.slice(0, 160));
    created.push(NEW_PATH);

    // 2. referencia
    const patch = await patchSettingsAs(admin.token, { logo_url: NEW_PATH });
    assert.equal(patch.status, 200);

    // 3. viejo fuera
    const removed = await deleteAs(admin.token, OLD_PATH);
    assert.equal(removed.status, 200, removed.text.slice(0, 160));

    // Resultado: la referencia apunta a un objeto que EXISTE, y el anterior no
    // quedó ocupando espacio.
    const after = (await db("settings?market_id=eq.ES&select=logo_url")).body[0].logo_url;
    assert.equal(after, NEW_PATH);
    assert.equal(await objectExists(NEW_PATH), true, "el logo publicado tiene que existir");
    assert.equal(await objectExists(OLD_PATH), false, "el anterior tenía que desaparecer");
  });

  test("quitar el logo deja NULL, no una cadena vacía", async () => {
    const response = await patchSettingsAs(admin.token, { logo_url: null });
    assert.equal(response.status, 200);
    assert.equal((response.body as { logo_url: string | null }[])[0].logo_url, null);
  });

  test("INVARIANTE: si hay logo_url, su objeto existe", async () => {
    // Es la propiedad que hace que el orden del incremento 17 importe: la
    // tienda nunca debe apuntar a un objeto borrado.
    await patchSettingsAs(admin.token, { logo_url: NEW_PATH });
    const current = (await db("settings?market_id=eq.ES&select=logo_url")).body[0].logo_url;
    if (current !== null) {
      assert.equal(await objectExists(current), true, `logo_url apunta a ${current} y no existe`);
    }
  });
});

describe("logo · el CDN es la razón de que cada subida sea un objeto nuevo", { skip }, () => {
  test("tras BORRAR un objeto, su URL pública puede seguir devolviendo 200", async () => {
    /*
      MEDIDO en este incremento, y no es un fallo: la URL pública la sirve un
      CDN por delante de Storage. El objeto ya no existe —`objectExists` dice
      que no— y la caché sigue entregándolo un rato.

      CONSECUENCIA DE DISEÑO: si al sustituir el logo se escribiera en la MISMA
      ruta, el cliente seguiría viendo el logo anterior y el administrador no
      tendría forma de arreglarlo desde el panel. Por eso `buildLogoPath` mete
      un uuid nuevo en cada subida: la URL cambia y no hay caché que valga.

      El test no afirma que el 200 ocurra siempre —depende de si esa URL se
      había pedido antes—, solo que la desaparición se comprueba contra Storage.
    */
    const path = `logo/ES-eeeeeeee-0000-4000-8000-${UNIQUE}0000.webp`;
    const upload = await uploadAs(admin.token, path, WEBP_BYTES);
    assert.equal(upload.status, 200, upload.text.slice(0, 160));
    assert.equal(await objectExists(path), true);

    // Se pide por la URL pública para que el CDN la guarde.
    assert.equal((await publicGet(path)).status, 200);

    const removed = await deleteAs(admin.token, path);
    assert.equal(removed.status, 200, removed.text.slice(0, 160));

    // La AUTORIDAD dice que ya no está...
    assert.equal(await objectExists(path), false);
    // ...y la URL pública puede decir lo contrario durante un rato. Las dos
    // cosas son ciertas a la vez, y por eso la ruta nueva no es opcional.
    const cached = await publicGet(path);
    assert.ok([200, 400].includes(cached.status), `estado inesperado: ${cached.status}`);
  });
});
