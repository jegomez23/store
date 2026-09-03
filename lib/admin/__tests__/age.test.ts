import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ageMs, formatAge, formatExact } from "../age.ts";

/**
 * Antigüedad de pedidos. Función pura, sin reloj propio: el `now` se inyecta,
 * así que estos tests no dependen de la hora a la que se ejecuten.
 */

const NOW = Date.parse("2026-09-03T18:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("ageMs", () => {
  test("mide la distancia real al instante dado", () => {
    assert.equal(ageMs(ago(5 * MIN), NOW), 5 * MIN);
    assert.equal(ageMs(ago(3 * DAY), NOW), 3 * DAY);
  });

  test("una fecha FUTURA da 0, no un negativo", () => {
    // Pasa con relojes desviados. "Dentro de 3 minutos" no significa nada aquí.
    assert.equal(ageMs(new Date(NOW + 3 * MIN).toISOString(), NOW), 0);
  });

  test("entradas inutilizables devuelven null en vez de lanzar", () => {
    assert.equal(ageMs(null, NOW), null);
    assert.equal(ageMs(undefined, NOW), null);
    assert.equal(ageMs("", NOW), null);
    assert.equal(ageMs("no es una fecha", NOW), null);
  });
});

describe("formatAge", () => {
  test("menos de un minuto es 'ahora mismo'", () => {
    assert.equal(formatAge(ago(0), NOW), "ahora mismo");
    assert.equal(formatAge(ago(59_000), NOW), "ahora mismo");
  });

  test("minutos en formato corto", () => {
    assert.equal(formatAge(ago(MIN), NOW), "hace 1 min");
    assert.equal(formatAge(ago(12 * MIN), NOW), "hace 12 min");
    assert.equal(formatAge(ago(59 * MIN), NOW), "hace 59 min");
  });

  test("horas en formato corto", () => {
    assert.equal(formatAge(ago(HOUR), NOW), "hace 1 h");
    assert.equal(formatAge(ago(3 * HOUR), NOW), "hace 3 h");
    assert.equal(formatAge(ago(23 * HOUR), NOW), "hace 23 h");
  });

  test("días en formato largo, que se lee mejor", () => {
    assert.equal(formatAge(ago(DAY), NOW), "hace 1 día");
    assert.equal(formatAge(ago(2 * DAY), NOW), "hace 2 días");
    assert.equal(formatAge(ago(45 * DAY), NOW), "hace 45 días");
  });

  test("las fronteras caen del lado correcto", () => {
    assert.equal(formatAge(ago(60 * MIN - 1), NOW), "hace 59 min");
    assert.equal(formatAge(ago(60 * MIN), NOW), "hace 1 h");
    assert.equal(formatAge(ago(DAY - 1), NOW), "hace 23 h");
    assert.equal(formatAge(ago(DAY), NOW), "hace 1 día");
  });

  test("trunca, no redondea: 89 minutos son 1 h, no 2", () => {
    assert.equal(formatAge(ago(89 * MIN), NOW), "hace 1 h");
  });

  test("null si la fecha no sirve", () => {
    assert.equal(formatAge(null, NOW), null);
    assert.equal(formatAge("basura", NOW), null);
  });
});

describe("no clasifica: solo mide", () => {
  test("NINGUNA salida contiene un juicio de valor", () => {
    // Si algún día alguien añade "atrasado" o "urgente" aquí, este test falla.
    // Esos calificativos exigen un umbral que el negocio no ha definido.
    const juicios = /atrasad|urgent|tarde|problem|crític|alerta|riesgo|retras/i;
    for (const ms of [0, MIN, 30 * MIN, HOUR, 12 * HOUR, DAY, 30 * DAY, 400 * DAY]) {
      const label = formatAge(ago(ms), NOW);
      assert.ok(label !== null);
      assert.ok(!juicios.test(label!), `"${label}" emite un juicio, no un hecho`);
    }
  });

  test("el módulo no exporta ningún umbral", async () => {
    const mod = await import("../age.ts");
    const sospechosos = Object.keys(mod).filter((k) =>
      /threshold|umbral|limit|stale|overdue|urgent/i.test(k),
    );
    assert.deepEqual(sospechosos, []);
  });
});

describe("formatExact", () => {
  test("devuelve fecha y hora legibles", () => {
    const out = formatExact("2026-09-03T16:42:00.000Z");
    assert.ok(out !== null);
    assert.ok(/2026/.test(out!), out!);
  });

  test("null si la fecha no sirve", () => {
    assert.equal(formatExact(null), null);
    assert.equal(formatExact("basura"), null);
  });
});
