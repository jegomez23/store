import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canSell,
  hasBlocker,
  resolveSaleBlockers,
  resolveSaleChecklist,
} from "../sale-status.ts";

/**
 * «¿Puede vender la tienda?» (Incremento 15).
 *
 * Lo que protegen estos tests: que la respuesta sea UNA, que use el mismo
 * predicado de WhatsApp que el checkout, y que no se pueda decir «lista para
 * vender» cuando falta algo que impide completar un pedido.
 */

const REAL = "34611222333";
const SEED = "34600000000";

/** Quita comentarios: varias guardas miran el código, no lo que documenta. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("resolveSaleBlockers", () => {
  test("con WhatsApp real y un método activo, la tienda vende", () => {
    const input = { whatsappNumber: REAL, activeShippingMethods: 1 };
    assert.deepEqual(resolveSaleBlockers(input), []);
    assert.equal(canSell(input), true);
  });

  test("el número del seed bloquea la venta", () => {
    const blockers = resolveSaleBlockers({ whatsappNumber: SEED, activeShippingMethods: 2 });
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "WHATSAPP_NOT_CONFIGURED");
    assert.equal(canSell({ whatsappNumber: SEED, activeShippingMethods: 2 }), false);
  });

  test("sin métodos de entrega activos también se bloquea", () => {
    const blockers = resolveSaleBlockers({ whatsappNumber: REAL, activeShippingMethods: 0 });
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "NO_ACTIVE_SHIPPING_METHOD");
  });

  test("los dos fallos se cuentan a la vez: no se esconde el segundo", () => {
    const blockers = resolveSaleBlockers({ whatsappNumber: SEED, activeShippingMethods: 0 });
    assert.equal(blockers.length, 2);
    assert.equal(hasBlocker(blockers, "WHATSAPP_NOT_CONFIGURED"), true);
    assert.equal(hasBlocker(blockers, "NO_ACTIVE_SHIPPING_METHOD"), true);
  });

  test("sin número, con número vacío o con basura: bloqueado", () => {
    for (const value of [null, undefined, "", "   ", "abc", "123"]) {
      assert.equal(
        canSell({ whatsappNumber: value, activeShippingMethods: 1 }),
        false,
        `${JSON.stringify(value)} no debería permitir vender`,
      );
    }
  });

  test("un recuento imposible se trata como bloqueo, no como permiso", () => {
    // Si contar los métodos falla, la capa de datos devuelve 0; y si alguna vez
    // llegara NaN, tampoco puede convertirse en "todo bien".
    assert.equal(canSell({ whatsappNumber: REAL, activeShippingMethods: Number.NaN }), false);
    assert.equal(canSell({ whatsappNumber: REAL, activeShippingMethods: -1 }), false);
  });

  test("cada bloqueo dice qué pasa y qué hacer, sin tecnicismos", () => {
    const blockers = resolveSaleBlockers({ whatsappNumber: SEED, activeShippingMethods: 0 });
    for (const blocker of blockers) {
      assert.ok(blocker.title.length > 0 && blocker.fix.length > 0);
      assert.ok(
        !/whatsapp_number|shipping_methods|is_active|settings\./i.test(`${blocker.title} ${blocker.fix}`),
        `el mensaje enseña un nombre técnico: ${blocker.title} / ${blocker.fix}`,
      );
    }
  });
});

describe("una sola fuente de verdad", () => {
  test("reutiliza `isWhatsAppConfigured`, no una copia del criterio", () => {
    const source = fs.readFileSync("lib/store/sale-status.ts", "utf8");
    assert.match(source, /import \{ isWhatsAppConfigured \}/);
    assert.ok(
      !/PLACEHOLDER|34600000000|replace\(\/\[\^0-9\]/.test(source),
      "aquí no puede haber una segunda definición de qué número vale",
    );
  });

  test("ninguna pantalla vuelve a evaluar el criterio por su cuenta", () => {
    /*
      INCREMENTO 16: la lista incluye `/checkout`. Antes esa pantalla no
      preguntaba nada — pintaba el formulario entero y dejaba que el fallo
      apareciera al final, dentro de `WhatsAppChannel`. Ahora pregunta, y este
      test impide que la respuesta vuelva a calcularse a mano en cualquiera de
      las tres.
    */
    const files = [
      "app/admin/(panel)/page.tsx",
      "app/admin/(panel)/ajustes/page.tsx",
      "app/(store)/checkout/page.tsx",
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      assert.ok(
        !/isWhatsAppConfigured\(/.test(source),
        `${file} llama a isWhatsAppConfigured por su cuenta: el estado de venta se pide a resolveSaleBlockers`,
      );
      assert.match(
        source,
        /resolveSaleBlockers|resolveSaleChecklist|getSaleChecklist/,
        `${file} tiene que preguntar por el estado de venta, no deducirlo`,
      );
    }
  });

  test("la carga de datos delega en el criterio puro, no lo reescribe", () => {
    const source = fs.readFileSync("lib/store/sale-status-data.ts", "utf8");
    assert.match(source, /resolveSaleChecklist/);
    assert.ok(
      !/PLACEHOLDER|34600000000|activeShippingMethods\s*<\s*1/.test(source),
      "la carga de datos no puede tener su propia versión de qué bloquea la venta",
    );
  });
});

describe("qué ve el cliente y qué ve el administrador", () => {
  test("cada bloqueo sabe a qué sección de Ajustes lleva", () => {
    // Sin ancla, "qué hacer" obliga a buscar el campo a mano en un móvil.
    const blockers = resolveSaleBlockers({ whatsappNumber: SEED, activeShippingMethods: 0 });
    assert.equal(blockers.length, 2);
    for (const blocker of blockers) {
      assert.match(blocker.anchor, /^[a-z][a-z-]*$/, "el ancla es un id, no una ruta");
    }
    assert.equal(
      new Set(blockers.map((b) => b.anchor)).size,
      blockers.length,
      "dos bloqueos distintos no pueden llevar al mismo sitio",
    );
  });

  test("las anclas existen de verdad en /admin/ajustes", () => {
    // Un ancla que no existe deja el enlace sin efecto, y eso es imposible de
    // ver leyendo solo uno de los dos archivos.
    const page = fs.readFileSync("app/admin/(panel)/ajustes/page.tsx", "utf8");
    for (const blocker of resolveSaleBlockers({ whatsappNumber: SEED, activeShippingMethods: 0 })) {
      assert.ok(
        page.includes(`id="${blocker.anchor}"`),
        `/admin/ajustes no tiene ninguna sección con id="${blocker.anchor}"`,
      );
    }
  });

  test("el checkout NO le cuenta al cliente por qué está bloqueada la tienda", () => {
    /*
      Los `title`/`fix` de los bloqueos son instrucciones para el administrador
      y describen cómo está configurada la tienda. Al cliente se le da un
      mensaje neutro y una salida: ni "WhatsApp", ni "métodos de entrega", ni
      el código del bloqueo.
    */
    const rendered = fs
      .readFileSync("app/(store)/checkout/page.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const leak of [
      "blocker.title",
      "blocker.fix",
      "blockers.map",
      "SaleStatus",
      "WHATSAPP_NOT_CONFIGURED",
      "NO_ACTIVE_SHIPPING_METHOD",
    ]) {
      assert.ok(
        !rendered.includes(leak),
        `/checkout pinta "${leak}": eso es información del panel, no del cliente`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENTO 17 · El estado de venta es una LISTA, no un semáforo
   ═══════════════════════════════════════════════════════════════════════════

   Antes se enseñaban solo los fallos: «Lista para vender» era un párrafo que
   había que creerse, y con un fallo el otro requisito desaparecía de la
   pantalla. Ahora se ven siempre las dos comprobaciones.

   Lo que estos tests protegen es que la lista y los bloqueos NO puedan
   discrepar, porque los dos salen de la misma declaración.
   ═════════════════════════════════════════════════════════════════════════ */

describe("resolveSaleChecklist", () => {
  test("devuelve SIEMPRE las dos comprobaciones, se cumplan o no", () => {
    for (const input of [
      { whatsappNumber: REAL, activeShippingMethods: 1 },
      { whatsappNumber: SEED, activeShippingMethods: 0 },
      { whatsappNumber: REAL, activeShippingMethods: 0 },
    ]) {
      assert.equal(resolveSaleChecklist(input).length, 2, JSON.stringify(input));
    }
  });

  test("con todo bien, las dos pasan", () => {
    const checks = resolveSaleChecklist({ whatsappNumber: REAL, activeShippingMethods: 2 });
    assert.ok(checks.every((c) => c.passed));
  });

  test("un fallo NO esconde el requisito que sí se cumple", () => {
    // Ese era el fallo real: al bloquearse por WhatsApp, el administrador
    // dejaba de ver que el envío estaba bien y no sabía si lo había mirado.
    const checks = resolveSaleChecklist({ whatsappNumber: SEED, activeShippingMethods: 3 });
    const whatsapp = checks.find((c) => c.code === "WHATSAPP_NOT_CONFIGURED");
    const shipping = checks.find((c) => c.code === "NO_ACTIVE_SHIPPING_METHOD");
    assert.equal(whatsapp?.passed, false);
    assert.equal(shipping?.passed, true);
  });

  test("los bloqueos son EXACTAMENTE las comprobaciones que no pasan", () => {
    for (const input of [
      { whatsappNumber: REAL, activeShippingMethods: 1 },
      { whatsappNumber: SEED, activeShippingMethods: 1 },
      { whatsappNumber: REAL, activeShippingMethods: 0 },
      { whatsappNumber: SEED, activeShippingMethods: 0 },
    ]) {
      const failed = resolveSaleChecklist(input)
        .filter((c) => !c.passed)
        .map((c) => c.code);
      const blockers = resolveSaleBlockers(input).map((b) => b.code);
      assert.deepEqual(blockers, failed, JSON.stringify(input));
    }
  });

  test("cada comprobación es accionable: rótulo, arreglo, botón y ancla", () => {
    for (const check of resolveSaleChecklist({ whatsappNumber: SEED, activeShippingMethods: 0 })) {
      assert.ok(check.label.length > 0, "falta el rótulo en positivo");
      assert.ok(check.cta.length > 0, "falta el texto del botón");
      assert.ok(check.fix.length > 0, "falta qué hacer");
      assert.match(check.anchor, /^[a-z][a-z-]*$/);
    }
  });

  test("no se cuela lenguaje técnico ni alarmista", () => {
    const checks = resolveSaleChecklist({ whatsappNumber: SEED, activeShippingMethods: 0 });
    const texto = checks.map((c) => [c.label, c.title, c.fix, c.cta].join(" ")).join(" ");
    const sinMarca = texto.replace(/WhatsApp/g, "");
    assert.ok(
      !/whatsapp_number|shipping_methods|is_active|settings\.|null|undefined|23514|42501|SQL/i.test(
        sinMarca,
      ),
      `hay algo técnico en los mensajes: ${texto}`,
    );
    assert.ok(
      !/urgente|peligro|grave|crítico|catástrofe|fatal/i.test(texto),
      "el tono no debe ser alarmista",
    );
  });

  test("no se inventan comprobaciones: son DOS, y las dos son reales", () => {
    /*
      Cada entrada de esta lista tiene que poder fallar de verdad. Añadir
      «configuración de envío válida» quedaría bonito y sería mentira: los
      importes negativos ya los rechaza PostgreSQL (migración 0036), así que
      esa comprobación jamás fallaría y solo añadiría un ✓ decorativo.
    */
    const codes = resolveSaleChecklist({ whatsappNumber: REAL, activeShippingMethods: 1 }).map(
      (c) => c.code,
    );
    assert.deepEqual(codes, ["WHATSAPP_NOT_CONFIGURED", "NO_ACTIVE_SHIPPING_METHOD"]);
  });

  test("el criterio sigue declarándose UNA vez", () => {
    const source = fs.readFileSync("lib/store/sale-status.ts", "utf8");
    // Los bloqueos se DERIVAN de la lista; si volvieran a comprobar las
    // condiciones por su cuenta, las dos vistas podrían discrepar.
    assert.match(source, /resolveSaleChecklist\(input\)\.filter/);
    assert.equal(
      (source.match(/isWhatsAppConfigured\(/g) ?? []).length,
      1,
      "el predicado de WhatsApp solo puede evaluarse en un sitio",
    );
  });
});

describe("el panel pinta la lista, no la recalcula", () => {
  test("SaleStatus recibe las comprobaciones ya resueltas", () => {
    // Se mira el CÓDIGO, no la documentación: la cabecera del componente cita
    // `resolveSaleChecklist` para explicar de dónde le llegan los datos.
    const source = stripComments(
      fs.readFileSync("components/admin/SaleStatus.tsx", "utf8"),
    );
    assert.ok(
      !/isWhatsAppConfigured|activeShippingMethods|resolveSale/.test(source),
      "el componente no puede evaluar el criterio: solo lo pinta",
    );
    assert.match(source, /checks/);
  });

  test("cada fallo lleva su botón al ancla que lo arregla, con 44 px", () => {
    const source = fs.readFileSync("components/admin/SaleStatus.tsx", "utf8");
    assert.match(source, /check\.cta/);
    assert.match(source, /check\.anchor/);
    assert.match(source, /min-h-11/);
  });

  test("las anclas de los bloqueos existen en /admin/ajustes", () => {
    const page = fs.readFileSync("app/admin/(panel)/ajustes/page.tsx", "utf8");
    for (const check of resolveSaleChecklist({ whatsappNumber: SEED, activeShippingMethods: 0 })) {
      assert.ok(
        page.includes(`id="${check.anchor}"`),
        `/admin/ajustes no tiene ninguna sección con id="${check.anchor}"`,
      );
    }
  });
});
