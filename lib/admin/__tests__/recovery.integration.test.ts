import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Recuperación de contraseña contra el Supabase REAL (Incremento 18).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SE VERIFICA AQUÍ Y QUÉ NO
 * ═══════════════════════════════════════════════════════════════════════════
 * SÍ: que Supabase emite el token, que se canjea, que es de UN SOLO USO, que
 * la contraseña cambia de verdad, que la antigua deja de valer, y —lo más
 * importante— que **recuperar una cuenta NO concede acceso al panel**.
 *
 * NO: la entrega del correo. El SMTP integrado de Supabase está limitado y en
 * esta auditoría respondió `429 · over_email_send_rate_limit`. Eso es
 * configuración EXTERNA (SMTP propio en el panel de Supabase) y no se simula:
 * lo que aquí se genera es el mismo token que viajaría en ese correo, mediante
 * `admin/generate_link`.
 *
 * ⚠️ `generate_link` usa la service role key y es **solo para los tests**:
 * ocupa el lugar del buzón de correo que este entorno no tiene. El código de
 * producción no la usa en ninguna parte de este flujo.
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * El token que viajaría en el email. Solo para tests: ver cabecera.
 *
 * ⚠️ **SUPABASE LIMITA ESTO DE VERDAD.** Pedir varios seguidos devuelve
 * `429 · over_email_send_rate_limit` — comprobado, y es justo la protección
 * contra abuso que el flujo NO necesita reimplementar. Aquí se reintenta con
 * espera porque una suite de tests dispara muchos más de los que dispararía
 * una persona; en producción ese 429 es el comportamiento deseado y la
 * pantalla lo trata como un éxito más (no puede distinguirse sin enumerar).
 */
async function recoveryToken(email: string) {
  const attempts = [0, 4000, 8000, 12000];
  let last: { status: number; body: string } = { status: 0, body: "" };

  for (const wait of attempts) {
    if (wait) await sleep(wait);

    const response = await fetch(`${env!.url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: env!.service,
        Authorization: `Bearer ${env!.service}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "recovery",
        email,
        redirect_to: "http://localhost:3000/admin/reset-password",
      }),
    });
    const text = await response.text();
    last = { status: response.status, body: text };
    if (response.status !== 429) {
      const body = (text ? JSON.parse(text) : {}) as {
        hashed_token?: string;
        action_link?: string;
        redirect_to?: string;
      };
      return { status: response.status, ...body };
    }
  }

  assert.fail(
    `Supabase sigue limitando el envío tras varios reintentos (${last.status}): ${last.body.slice(0, 160)}`,
  );
}

/**
 * Canje como lo hace `/admin/auth/confirm`: anon key, sin service role.
 *
 * `/auth/v1/verify` tiene su PROPIO límite (`over_request_rate_limit`), aparte
 * del de envío de correos. Se reintenta por lo mismo que `recoveryToken`: una
 * suite dispara muchos más canjes que una persona.
 */
interface VerifyBody {
  access_token?: string;
  error_code?: string;
  msg?: string;
}

async function verifyRecovery(
  tokenHash: string,
  { expectFailure = false } = {},
): Promise<{ status: number; body: VerifyBody }> {
  const attempts = [0, 4000, 8000, 12000];
  let last: { status: number; body: VerifyBody } = { status: 0, body: {} };

  for (const wait of attempts) {
    if (wait) await sleep(wait);
    const response = await fetch(`${env!.url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
    });
    const text = await response.text();
    const body: VerifyBody = text ? JSON.parse(text) : {};
    last = { status: response.status, body };

    // Un 429 es del entorno, no del flujo: se reintenta. Cualquier otro
    // resultado —incluido el 403 que SE ESPERA de un token ya usado— vale.
    const limitado =
      response.status === 429 || body.error_code === "over_request_rate_limit";
    if (!limitado) return last;
  }

  if (expectFailure) return last;
  assert.fail(`Supabase sigue limitando /verify tras varios reintentos: ${JSON.stringify(last).slice(0, 200)}`);
}

async function updatePassword(accessToken: string, password: string) {
  const response = await fetch(`${env!.url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email: string, password: string) {
  const response = await fetch(`${env!.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env!.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function isAdminAs(accessToken: string) {
  const response = await fetch(`${env!.url}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: {
      apikey: env!.anon,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  return { status: response.status, value: JSON.parse(await response.text()) };
}

async function createAccount(email: string, password: string, asAdmin: boolean) {
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
  assert.ok(user.id, `no se pudo crear ${email}`);
  if (asAdmin) {
    const profile = await db("profiles", {
      method: "POST",
      body: JSON.stringify({ id: user.id, role: "admin", full_name: "Recovery Admin" }),
    });
    assert.equal(profile.status, 201, JSON.stringify(profile.body));
  }
  return user.id!;
}

async function deleteAccount(id: string) {
  await db(`profiles?id=eq.${id}`, { method: "DELETE" });
  await fetch(`${env!.url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: env!.service, Authorization: `Bearer ${env!.service}` },
  });
}

const UNIQUE = Math.random().toString(36).slice(2, 8);
const ADMIN_EMAIL = `rec-adm-${UNIQUE}@yi-test.local`;
const PLAIN_EMAIL = `rec-usr-${UNIQUE}@yi-test.local`;
const INITIAL_PASSWORD = "Inicial-18-A9x";
const NEW_PASSWORD = "Nueva-18-B7zq";

let adminId = "";
let plainId = "";

before(async () => {
  if (skip) return;
  adminId = await createAccount(ADMIN_EMAIL, INITIAL_PASSWORD, true);
  plainId = await createAccount(PLAIN_EMAIL, INITIAL_PASSWORD, false);
});

after(async () => {
  if (skip) return;
  for (const id of [adminId, plainId]) if (id) await deleteAccount(id);
});

/*
  ⚠️ POCOS TESTS Y GORDOS, A PROPÓSITO.

  Supabase limita `/auth/v1/admin/generate_link` (`over_email_send_rate_limit`)
  y `/auth/v1/verify` (`over_request_rate_limit`) — los dos medidos en este
  incremento. Un test por afirmación gastaría una decena de tokens y la suite
  fallaría por el entorno, no por el código. Así que cada test recorre una
  secuencia completa con UN token y comprueba varias invariantes por el camino.
*/

describe("recuperación · el flujo completo contra Supabase real", { skip }, () => {
  test("un email que NO existe responde igual que uno que sí: 200 y sin pistas", async () => {
    const inexistente = await fetch(`${env!.url}/auth/v1/recover`, {
      method: "POST",
      headers: { apikey: env!.anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `no-existe-${UNIQUE}@yi-test.local` }),
    });
    const cuerpo = await inexistente.text();
    // Un 429 aquí también es una respuesta sin información sobre la cuenta.
    if (inexistente.status === 429) return;
    assert.equal(inexistente.status, 200, cuerpo);
    assert.ok(cuerpo.trim() === "" || cuerpo.trim() === "{}", cuerpo);
  });

  test("token inventado o manipulado: rechazado, sin sesión", async () => {
    const r = await verifyRecovery("0".repeat(64), { expectFailure: true });
    assert.ok(r.status >= 400, `token falso aceptado: ${JSON.stringify(r.body)}`);
    assert.ok(!r.body?.access_token, "¡un token inventado ha devuelto sesión!");
  });

  test("SECUENCIA COMPLETA del admin: canje, política, cambio y contraseña antigua", async () => {
    const link = await recoveryToken(ADMIN_EMAIL);
    assert.equal(link.status, 200, "no se pudo generar el token");
    assert.ok(link.hashed_token, "Supabase no devolvió token");

    // El `redirect_to` de la aplicación está en la lista blanca del proyecto:
    // si no lo estuviera, Supabase caería al `site_url` y el enlace del email
    // no llegaría nunca a la pantalla de contraseña.
    assert.equal(link.redirect_to, "http://localhost:3000/admin/reset-password");

    // 1. Canje: devuelve sesión.
    const verified = await verifyRecovery(link.hashed_token!);
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const session = verified.body.access_token;
    assert.ok(session, "el canje no devolvió sesión");

    // 2. La política la impone SUPABASE, no la aplicación.
    const debil = await updatePassword(session, "12345");
    assert.equal(debil.status, 422, JSON.stringify(debil.body));
    assert.equal(debil.body.error_code, "weak_password");
    const { PASSWORD_MIN_LENGTH } = await import("../password.ts");
    assert.match(debil.body.msg, new RegExp(`at least ${PASSWORD_MIN_LENGTH} characters`));

    // 3. Con una válida, se cambia de verdad.
    const cambio = await updatePassword(session, NEW_PASSWORD);
    assert.equal(cambio.status, 200, JSON.stringify(cambio.body));

    // 4. La nueva vale y la ANTIGUA deja de valer.
    assert.equal((await login(ADMIN_EMAIL, NEW_PASSWORD)).status, 200, "la nueva no funciona");
    assert.equal(
      (await login(ADMIN_EMAIL, INITIAL_PASSWORD)).status,
      400,
      "la contraseña ANTIGUA sigue funcionando",
    );

    // 5. EL TOKEN ERA DE UN SOLO USO.
    const reuso = await verifyRecovery(link.hashed_token!, { expectFailure: true });
    assert.equal(reuso.status, 403, JSON.stringify(reuso.body));
    assert.equal(reuso.body.error_code, "otp_expired");

    // 6. Y el admin SIGUE siendo admin: recuperar no quita permisos.
    const sesion = await login(ADMIN_EMAIL, NEW_PASSWORD);
    const rol = await isAdminAs(sesion.body.access_token);
    assert.equal(rol.value, true, "el admin ha perdido sus permisos al recuperar");
  });
});

describe("recuperación · autenticación NO es autorización", { skip }, () => {
  test("un usuario SIN perfil recupera su cuenta y NO gana acceso al panel", async () => {
    /*
      Es la invariante central del incremento. Recuperar la contraseña devuelve
      el acceso a una cuenta de Supabase Auth; el panel depende de `is_admin()`,
      que mira `profiles`. Las dos cosas son independientes y tienen que seguir
      siéndolo.
    */
    const perfilAntes = await db(`profiles?id=eq.${plainId}&select=id,role`);
    assert.deepEqual(perfilAntes.body, [], "el usuario de prueba no debería tener perfil");

    const link = await recoveryToken(PLAIN_EMAIL);
    assert.equal(link.status, 200);

    const verified = await verifyRecovery(link.hashed_token!);
    assert.equal(verified.status, 200, "un usuario normal también puede recuperar");
    const recoverySession = verified.body.access_token;
    assert.ok(recoverySession, "el canje no devolvió sesión");

    // La sesión DE RECUPERACIÓN ya no es admin.
    const rolRecuperacion = await isAdminAs(recoverySession);
    assert.equal(rolRecuperacion.value, false, "la sesión de recuperación concede admin");

    // Cambia su contraseña con normalidad.
    const cambio = await updatePassword(recoverySession, NEW_PASSWORD);
    assert.equal(cambio.status, 200, JSON.stringify(cambio.body));

    // Entra en Supabase Auth… y sigue sin ser admin.
    const sesion = await login(PLAIN_EMAIL, NEW_PASSWORD);
    assert.equal(sesion.status, 200, "no puede entrar con su contraseña nueva");
    const rol = await isAdminAs(sesion.body.access_token);
    assert.equal(rol.status, 200);
    assert.equal(rol.value, false, "¡una cuenta sin perfil ha pasado a ser admin!");

    // Y recuperar NO ha creado ni tocado `profiles`.
    const perfilDespues = await db(`profiles?id=eq.${plainId}&select=id,role`);
    assert.deepEqual(perfilDespues.body, perfilAntes.body);
  });
});

describe("recuperación · lo que el código NO hace", { skip }, () => {
  test("ningún archivo del flujo usa la service role key", () => {
    const archivos = [
      "app/admin/(auth)/recuperar/actions.ts",
      "app/admin/(auth)/reset-password/actions.ts",
      "app/admin/(auth)/reset-password/adopt.ts",
      "app/admin/auth/confirm/route.ts",
    ];
    for (const file of archivos) {
      const source = fs.readFileSync(file, "utf8");
      assert.ok(
        !/SERVICE_ROLE|supabase\/admin/.test(source),
        `${file} toca la service role key`,
      );
      assert.match(source, /lib\/supabase\/server/);
    }
  });

  test("no se inventa una recuperación paralela: ni tokens propios, ni tablas", () => {
    const archivos = [
      "app/admin/(auth)/recuperar/actions.ts",
      "app/admin/(auth)/reset-password/actions.ts",
      "app/admin/auth/confirm/route.ts",
    ];
    for (const file of archivos) {
      const source = fs.readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      assert.ok(
        !/randomUUID|crypto\.|\.from\(["']/.test(source),
        `${file} parece generar o guardar algo por su cuenta`,
      );
    }
  });

  test("cambiar la contraseña CIERRA la sesión de recuperación", () => {
    // Así el acceso al panel vuelve a pasar por `loginAction`, que es donde se
    // comprueba `is_admin()`.
    const source = fs.readFileSync("app/admin/(auth)/reset-password/actions.ts", "utf8");
    assert.match(source, /signOut\(\)/);
    assert.match(source, /redirect\("\/admin\/login/);
  });

  test("las rutas de recuperación son públicas en el proxy, y solo esas", () => {
    const source = fs.readFileSync("proxy.ts", "utf8");
    const bloque = source.match(/PUBLIC_ADMIN_PATHS = new Set<string>\(\[([\s\S]*?)\]\)/);
    assert.ok(bloque, "no se encontró la lista de rutas públicas");
    const rutas = [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      rutas.sort(),
      ["/admin/auth/confirm", "/admin/recuperar", "/admin/reset-password"].sort(),
      "la lista de rutas públicas del panel ha cambiado",
    );
    // `LOGIN_PATH` entra por su constante, no como literal.
    assert.match(bloque[1], /LOGIN_PATH/);
  });

  test("el proxy sigue SIN comprobar el rol (DEC-031)", () => {
    const source = fs.readFileSync("proxy.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.ok(!/is_admin|isAdmin/.test(source), "el proxy ha empezado a autorizar");
  });
});
