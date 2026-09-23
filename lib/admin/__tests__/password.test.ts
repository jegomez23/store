import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  looksLikeEmail,
  passwordErrorMessage,
  validateNewPassword,
} from "../password.ts";

/**
 * Recuperación de contraseña — lógica pura (Incremento 18).
 *
 * Lo que protegen estos tests NO es que React pinte texto: son las invariantes
 * que hacen que la recuperación sea segura.
 *
 *   1. **La política es la de Supabase**, no una inventada aquí.
 *   2. **La contraseña no se toca** antes de guardarla (ni trim, ni normalizar).
 *   3. **Ninguna rama del flujo permite enumerar cuentas.**
 */

describe("validateNewPassword", () => {
  test("acepta el mínimo REAL del proyecto y rechaza uno menos", () => {
    // Medido contra Supabase: "Password should be at least 6 characters."
    assert.equal(PASSWORD_MIN_LENGTH, 6);
    assert.equal(validateNewPassword("x".repeat(6), "x".repeat(6)).ok, true);
    assert.equal(validateNewPassword("x".repeat(5), "x".repeat(5)).ok, false);
  });

  test("NO inventa requisitos de complejidad", () => {
    /*
      El proyecto no exige mayúsculas, dígitos ni símbolos. Pedirlos aquí sería
      mentirle al usuario sobre una regla que el servidor no aplica.
    */
    for (const pwd of ["aaaaaa", "111111", "      ", "áéíóúü", "!!!!!!"]) {
      assert.equal(
        validateNewPassword(pwd, pwd).ok,
        true,
        `${JSON.stringify(pwd)} cumple la política real y no debería rechazarse`,
      );
    }
  });

  test("la contraseña NO se recorta ni se normaliza", () => {
    // Un espacio al principio o al final forma parte de la contraseña: si se
    // recortara, se guardaría una distinta de la que el usuario tecleó y el
    // login siguiente fallaría sin explicación.
    const conEspacios = "  secreto  ";
    const r = validateNewPassword(conEspacios, conEspacios);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.password, conEspacios);
  });

  test("dos contraseñas distintas se rechazan, aunque solo cambie un espacio", () => {
    assert.equal(validateNewPassword("secreto1", "secreto2").ok, false);
    assert.equal(validateNewPassword("secreto ", "secreto").ok, false);
  });

  test("campos vacíos: mensajes distintos para cada casilla", () => {
    const sinPwd = validateNewPassword("", "algo");
    const sinConf = validateNewPassword("algo123", "");
    assert.equal(sinPwd.ok, false);
    assert.equal(sinConf.ok, false);
    if (!sinPwd.ok && !sinConf.ok) assert.notEqual(sinPwd.error, sinConf.error);
  });

  test("tipos que no son cadena se rechazan sin lanzar", () => {
    for (const value of [null, undefined, 12345678, {}, [], true]) {
      assert.equal(validateNewPassword(value, value).ok, false, String(value));
    }
  });

  test("una contraseña absurdamente larga se rechaza antes de la red", () => {
    const larga = "x".repeat(PASSWORD_MAX_LENGTH + 1);
    assert.equal(validateNewPassword(larga, larga).ok, false);
    assert.equal(validateNewPassword("x".repeat(PASSWORD_MAX_LENGTH), "x".repeat(PASSWORD_MAX_LENGTH)).ok, true);
  });

  test("ningún mensaje de error menciona la cuenta ni el email", () => {
    const casos = [["", ""], ["corta", "corta"], ["secreto1", "secreto2"]];
    for (const [a, b] of casos) {
      const r = validateNewPassword(a, b);
      if (!r.ok) {
        assert.ok(
          !/email|cuenta|usuario|existe|registrad/i.test(r.error),
          `el mensaje habla de la cuenta: ${r.error}`,
        );
      }
    }
  });
});

describe("looksLikeEmail", () => {
  test("acepta un email normal y rechaza lo que no lo es", () => {
    assert.equal(looksLikeEmail("juan@yi.es"), true);
    for (const value of ["", "  ", "sin-arroba", "hola@", "@yi.es", "a@b", "con espacio@yi.es", null, 42]) {
      assert.equal(looksLikeEmail(value), false, String(value));
    }
  });

  test("NO se usa para decidir si la cuenta existe", () => {
    /*
      Es solo una comprobación de forma. Quien sabe si hay cuenta es Supabase, y
      responde 200 con cuerpo vacío exista o no (medido). Este test fija la
      intención por escrito para que nadie la convierta en un "¿existe?".
    */
    const source = fs.readFileSync("lib/admin/password.ts", "utf8");
    assert.match(source, /NO decide si la cuenta existe/);
  });
});

describe("passwordErrorMessage", () => {
  test("`weak_password` se muestra con el mensaje DEL SERVIDOR", () => {
    // Si algún día se endurece la política en el panel de Supabase, el usuario
    // tiene que ver la regla nueva, no una copia vieja escrita aquí.
    const delServidor = "Password should be at least 10 characters.";
    assert.equal(passwordErrorMessage("weak_password", delServidor), delServidor);
  });

  test("si el servidor no explica nada, se dice el mínimo conocido", () => {
    const msg = passwordErrorMessage("weak_password", undefined);
    assert.match(msg, new RegExp(String(PASSWORD_MIN_LENGTH)));
  });

  test("un enlace caducado o ya usado dice qué hacer, no el código", () => {
    for (const code of ["otp_expired", "session_not_found"]) {
      const msg = passwordErrorMessage(code, "Email link is invalid or has expired");
      assert.match(msg, /nuevo/i);
      assert.ok(!/otp|session_not_found|403|token/i.test(msg), msg);
    }
  });

  test("un código desconocido no filtra el mensaje crudo de Supabase", () => {
    const msg = passwordErrorMessage("algo_raro", "internal db constraint xyz");
    assert.ok(!msg.includes("internal db constraint"), msg);
  });
});

describe("no enumerable por construcción", () => {
  test("la action de recuperación responde `sent: true` en TODOS los caminos con email", () => {
    /*
      La propiedad importa más que el texto: si alguna rama devolviera
      `sent: false` con un email bien formado, la pantalla cambiaría según
      exista o no la cuenta, y eso ES la enumeración.
    */
    const source = fs.readFileSync("app/admin/(auth)/recuperar/actions.ts", "utf8");
    const sinComentarios = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // El único `sent: false` permitido es el del campo VACÍO, que no dice nada
    // sobre ninguna cuenta.
    const falsos = [...sinComentarios.matchAll(/sent:\s*false/g)];
    assert.equal(falsos.length, 1, "solo puede haber un `sent: false`: el del campo vacío");
    assert.match(sinComentarios, /email\.length === 0[\s\S]{0,400}sent: false/);

    /*
      Y el fallo de Supabase NO puede interrumpir el flujo: la rama `if (error)`
      solo registra en el log y sigue hasta el `sent: true` final. Si algún día
      alguien le pusiera un `return` dentro, la pantalla cambiaría según lo que
      respondiera Supabase —incluido el límite de envío— y eso delataría si la
      cuenta existe.
    */
    const ramaError = sinComentarios.match(/if \(error\) \{[\s\S]*?\n {2}\}/);
    assert.ok(ramaError, "no se encontró la rama de error de Supabase");
    assert.match(ramaError[0], /console\.error/);
    assert.ok(
      !/\breturn\b/.test(ramaError[0]),
      `la rama de error corta el flujo y eso enumera cuentas: ${ramaError[0]}`,
    );

    // El último return de la función es el genérico.
    assert.match(sinComentarios, /return \{ sent: true, error: null \};\s*\}\s*$/);
  });

  test("el email NO se escribe en el log", () => {
    const source = fs.readFileSync("app/admin/(auth)/recuperar/actions.ts", "utf8");
    const log = source.match(/console\.error\([\s\S]*?\);/g) ?? [];
    for (const call of log) {
      assert.ok(!/\bemail\b/.test(call), `el log incluye el email: ${call}`);
    }
  });
});
