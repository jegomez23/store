import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertDeployEnv,
  deployEnvProblems,
  exposedSecretNames,
} from "../deploy-env.ts";

/**
 * Entorno de despliegue (DEC-090). Los valores de aquí son de mentira: lo que
 * se prueba es la forma, nunca una clave real.
 */

const VALID_VERCEL = {
  VERCEL: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_SITE_URL: "https://tienda.example",
  NEXT_PUBLIC_MARKET: "ES",
};

describe("en local y en CI no se exige nada nuevo", () => {
  test("sin VERCEL, un entorno vacío es válido (los respaldos de desarrollo valen)", () => {
    assert.deepEqual(deployEnvProblems({}), []);
    assert.deepEqual(
      deployEnvProblems({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }),
      [],
    );
  });

  test("el workflow de CI construye con https://example.com y sin VERCEL", () => {
    const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
    assert.doesNotMatch(ci, /VERCEL:/);
  });
});

describe("en Vercel", () => {
  test("un entorno completo pasa", () => {
    assert.deepEqual(deployEnvProblems(VALID_VERCEL), []);
    assert.doesNotThrow(() => assertDeployEnv(VALID_VERCEL));
  });

  test("sin NEXT_PUBLIC_SITE_URL falla: el canonical apuntaría a localhost", () => {
    const { NEXT_PUBLIC_SITE_URL: _omitted, ...env } = VALID_VERCEL;
    void _omitted;
    const problems = deployEnvProblems(env);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^NEXT_PUBLIC_SITE_URL/);
  });

  test("con http o localhost también falla (sin Secure ni HSTS)", () => {
    for (const url of ["http://tienda.example", "https://localhost:3000", "no-es-url"]) {
      const problems = deployEnvProblems({ ...VALID_VERCEL, NEXT_PUBLIC_SITE_URL: url });
      assert.equal(problems.length, 1, url);
    }
  });

  test("sin mercado, o con uno que no existe, falla: vendería en ES por defecto", () => {
    for (const market of [undefined, "", "es", "FR"]) {
      const problems = deployEnvProblems({ ...VALID_VERCEL, NEXT_PUBLIC_MARKET: market });
      assert.equal(problems.length, 1, String(market));
      assert.match(problems[0], /^NEXT_PUBLIC_MARKET/);
    }
    assert.deepEqual(deployEnvProblems({ ...VALID_VERCEL, NEXT_PUBLIC_MARKET: "CO" }), []);
  });

  test("sin Supabase falla con los dos nombres", () => {
    const problems = deployEnvProblems({
      ...VALID_VERCEL,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: " ",
    });
    assert.equal(problems.length, 2);
  });

  test("todos los problemas salen juntos y SIN valores", () => {
    const secret = "valor-que-no-debe-salir";
    const env = {
      VERCEL: "1",
      NEXT_PUBLIC_SITE_URL: `http://${secret}`,
      NEXT_PUBLIC_GEMINI_API_KEY: secret,
    };
    assert.throws(
      () => assertDeployEnv(env),
      (error: Error) => {
        assert.equal(error.message.includes(secret), false, "el mensaje filtra un valor");
        assert.match(error.message, /NEXT_PUBLIC_GEMINI_API_KEY/);
        assert.match(error.message, /NEXT_PUBLIC_SUPABASE_URL/);
        assert.match(error.message, /NEXT_PUBLIC_MARKET/);
        return true;
      },
    );
  });
});

describe("un secreto con NEXT_PUBLIC_ falla SIEMPRE, también en local", () => {
  test("service role, Gemini y similares", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "x",
      NEXT_PUBLIC_GEMINI_API_KEY: "x",
      NEXT_PUBLIC_STRIPE_SECRET: "x",
    };
    assert.deepEqual(exposedSecretNames(env), [
      "NEXT_PUBLIC_GEMINI_API_KEY",
      "NEXT_PUBLIC_STRIPE_SECRET",
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    ]);
    assert.throws(() => assertDeployEnv(env));
  });

  test("las públicas legítimas del proyecto y las de la plataforma no cuentan", () => {
    assert.deepEqual(
      exposedSecretNames({
        ...VALID_VERCEL,
        NEXT_PUBLIC_VERCEL_URL: "x.vercel.app",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "abc",
      }),
      [],
    );
  });

  test("una variable vacía no es una fuga", () => {
    assert.deepEqual(exposedSecretNames({ NEXT_PUBLIC_GEMINI_API_KEY: "" }), []);
  });
});

describe("cableado", () => {
  test("next.config.ts llama a la comprobación con el entorno real", () => {
    const config = fs.readFileSync("next.config.ts", "utf8");
    assert.match(config, /assertDeployEnv\(process\.env\)/);
  });

  test("ninguna clave de servidor se lee con prefijo NEXT_PUBLIC_ en el código", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(path);
        } else if (/\.(ts|tsx)$/.test(path)) {
          for (const match of fs.readFileSync(path, "utf8").matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)) {
            if (exposedSecretNames({ [match[1]]: "x" }).length > 0) offenders.push(`${path}: ${match[1]}`);
          }
        }
      }
    };
    ["app", "components", "lib"].forEach(walk);
    assert.deepEqual(offenders, []);
  });
});
