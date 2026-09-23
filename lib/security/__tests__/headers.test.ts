import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  buildStrictTransportSecurity,
  isSecureSite,
  originOf,
} from "../headers.ts";

const SUPABASE = "https://proyecto.supabase.co";
const HTTPS_SITE = "https://yi.example";
const HTTP_SITE = "http://localhost:3000";

/** Parte una CSP en directivas para poder afirmar sobre una sola. */
function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const chunk of policy.split(";")) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    map.set(parts[0]!, parts.slice(1));
  }
  return map;
}

describe("originOf", () => {
  test("se queda con el origen y descarta la ruta", () => {
    assert.equal(originOf("https://proyecto.supabase.co/rest/v1"), SUPABASE);
    assert.equal(originOf("  https://yi.example/  "), HTTPS_SITE);
  });

  test("conserva el puerto", () => {
    assert.equal(originOf("http://localhost:3000"), HTTP_SITE);
  });

  test("una variable vacía o inválida NO ensancha la política: devuelve null", () => {
    assert.equal(originOf(undefined), null);
    assert.equal(originOf(null), null);
    assert.equal(originOf(""), null);
    assert.equal(originOf("no-es-una-url"), null);
    // Nada de `javascript:` ni `data:` colándose como origen permitido.
    assert.equal(originOf("javascript:alert(1)"), null);
    assert.equal(originOf("data:text/html,x"), null);
  });
});

describe("isSecureSite", () => {
  test("solo HTTPS", () => {
    assert.equal(isSecureSite(HTTPS_SITE), true);
    assert.equal(isSecureSite(HTTP_SITE), false);
    assert.equal(isSecureSite(undefined), false);
  });
});

describe("Content-Security-Policy · lo que niega siempre", () => {
  const policy = directives(
    buildContentSecurityPolicy({ supabaseUrl: SUPABASE, siteUrl: HTTPS_SITE }),
  );

  test("default-src es el propio origen", () => {
    assert.deepEqual(policy.get("default-src"), ["'self'"]);
  });

  test("nada de objetos, iframes ni reescritura de la base", () => {
    assert.deepEqual(policy.get("object-src"), ["'none'"]);
    assert.deepEqual(policy.get("frame-src"), ["'none'"]);
    assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(policy.get("base-uri"), ["'self'"]);
  });

  test("un formulario inyectado no puede POSTear fuera", () => {
    assert.deepEqual(policy.get("form-action"), ["'self'"]);
  });

  test("ningún script externo: script-src no admite ningún origen ajeno", () => {
    const scriptSrc = policy.get("script-src") ?? [];
    assert.ok(scriptSrc.includes("'self'"));
    assert.equal(
      scriptSrc.some((value) => value.startsWith("http")),
      false,
      "script-src no debe permitir ningún dominio externo",
    );
  });

  test("las fuentes son del propio origen: next/font sirve Geist local", () => {
    assert.deepEqual(policy.get("font-src"), ["'self'"]);
  });
});

describe("Content-Security-Policy · lo que necesita la tienda para funcionar", () => {
  const policy = directives(
    buildContentSecurityPolicy({ supabaseUrl: SUPABASE, siteUrl: HTTPS_SITE }),
  );

  test("img-src admite data: (placeholder blur), blob: (previsualización) y Storage", () => {
    const imgSrc = policy.get("img-src") ?? [];
    assert.ok(imgSrc.includes("'self'"));
    assert.ok(imgSrc.includes("data:"));
    assert.ok(imgSrc.includes("blob:"));
    assert.ok(imgSrc.includes(SUPABASE));
  });

  test("connect-src admite Supabase: el panel llama a Auth desde el navegador", () => {
    const connectSrc = policy.get("connect-src") ?? [];
    assert.ok(connectSrc.includes("'self'"));
    assert.ok(connectSrc.includes(SUPABASE));
  });

  test("los estilos inline se permiten: Tailwind y React los emiten", () => {
    assert.ok((policy.get("style-src") ?? []).includes("'unsafe-inline'"));
  });
});

describe("Content-Security-Policy · desarrollo frente a producción", () => {
  const prod = directives(
    buildContentSecurityPolicy({ supabaseUrl: SUPABASE, siteUrl: HTTPS_SITE }),
  );
  const dev = directives(
    buildContentSecurityPolicy({
      supabaseUrl: SUPABASE,
      siteUrl: HTTP_SITE,
      isDev: true,
    }),
  );

  test("'unsafe-eval' SOLO en desarrollo (React reconstruye stacks con eval)", () => {
    assert.equal((dev.get("script-src") ?? []).includes("'unsafe-eval'"), true);
    assert.equal((prod.get("script-src") ?? []).includes("'unsafe-eval'"), false);
  });

  test("el WebSocket del hot reload SOLO en desarrollo", () => {
    assert.equal((dev.get("connect-src") ?? []).includes("ws:"), true);
    assert.equal((prod.get("connect-src") ?? []).includes("ws:"), false);
  });

  test("upgrade-insecure-requests solo con un sitio HTTPS", () => {
    assert.ok(prod.has("upgrade-insecure-requests"));
    assert.equal(dev.has("upgrade-insecure-requests"), false);
  });
});

describe("Content-Security-Policy · entorno incompleto", () => {
  test("sin NEXT_PUBLIC_SUPABASE_URL la política queda MÁS estricta, no rota", () => {
    const policy = directives(buildContentSecurityPolicy({}));
    assert.deepEqual(policy.get("connect-src"), ["'self'"]);
    assert.deepEqual(policy.get("img-src"), ["'self'", "data:", "blob:"]);
  });

  test("ninguna directiva se queda sin valores", () => {
    for (const [name, values] of directives(buildContentSecurityPolicy({}))) {
      if (name === "upgrade-insecure-requests") continue;
      assert.ok(values.length > 0, `${name} sin valores`);
    }
  });

  test("no hay directivas repetidas", () => {
    const names = buildContentSecurityPolicy({ supabaseUrl: SUPABASE })
      .split(";")
      .map((chunk) => chunk.trim().split(/\s+/)[0]);
    assert.equal(new Set(names).size, names.length);
  });
});

describe("Strict-Transport-Security", () => {
  test("no se emite sin HTTPS: en local no aporta nada", () => {
    assert.equal(buildStrictTransportSecurity(HTTP_SITE), null);
    assert.equal(buildStrictTransportSecurity(undefined), null);
  });

  test("un año y subdominios cuando el sitio es HTTPS", () => {
    assert.equal(
      buildStrictTransportSecurity(HTTPS_SITE),
      "max-age=31536000; includeSubDomains",
    );
  });

  test("SIN preload: entrar en la lista de los navegadores no se decide aquí", () => {
    assert.equal(buildStrictTransportSecurity(HTTPS_SITE)?.includes("preload"), false);
  });
});

describe("buildSecurityHeaders", () => {
  test("conserva las cuatro cabeceras de la fase 9 (DEC-042)", () => {
    const keys = buildSecurityHeaders({ siteUrl: HTTPS_SITE }).map((h) => h.key);
    for (const key of [
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      assert.ok(keys.includes(key), `falta ${key}`);
    }
  });

  test("añade CSP siempre y HSTS solo con HTTPS", () => {
    const https = buildSecurityHeaders({ siteUrl: HTTPS_SITE }).map((h) => h.key);
    const http = buildSecurityHeaders({ siteUrl: HTTP_SITE }).map((h) => h.key);

    assert.ok(https.includes("Content-Security-Policy"));
    assert.ok(http.includes("Content-Security-Policy"));

    assert.ok(https.includes("Strict-Transport-Security"));
    assert.equal(http.includes("Strict-Transport-Security"), false);
  });

  test("ninguna cabecera se repite", () => {
    const keys = buildSecurityHeaders({ siteUrl: HTTPS_SITE }).map((h) => h.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("next.config.ts no reescribe las cabeceras por su cuenta", () => {
  /*
    Mismo criterio que el límite de subida (incremento 7): el valor vive en un
    módulo y la configuración lo importa. Si alguien vuelve a escribir la lista
    a mano en `next.config.ts`, las dos copias se separan sin que nada falle.
  */
  const config = readFileSync(new URL("../../../next.config.ts", import.meta.url), "utf8");

  test("importa buildSecurityHeaders en vez de repetir la lista", () => {
    assert.match(config, /buildSecurityHeaders/);
  });

  test("no declara una CSP a mano", () => {
    assert.equal(
      /Content-Security-Policy\s*"?\s*:/.test(config),
      false,
      "la CSP debe salir de lib/security/headers.ts",
    );
  });
});
