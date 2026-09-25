import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AVAILABILITY_MESSAGE,
  isAssistantUsable,
  resolveAssistantAvailability,
} from "../availability.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("resolveAssistantAvailability", () => {
  test("las dos condiciones tienen que cumplirse", () => {
    assert.equal(
      resolveAssistantAvailability({ enabled: true, configured: true }),
      "READY",
    );
  });

  test("apagada manda aunque haya proveedor: no se envía ninguna foto", () => {
    assert.equal(
      resolveAssistantAvailability({ enabled: false, configured: true }),
      "OFF",
    );
  });

  test("encendida sin proveedor se distingue de apagada", () => {
    assert.equal(
      resolveAssistantAvailability({ enabled: true, configured: false }),
      "NOT_CONFIGURED",
    );
  });

  test("ni encendida ni configurada: manda el interruptor, que es lo que el admin puede tocar", () => {
    assert.equal(
      resolveAssistantAvailability({ enabled: false, configured: false }),
      "OFF",
    );
  });

  test("solo READY habilita el botón", () => {
    assert.equal(isAssistantUsable("READY"), true);
    assert.equal(isAssistantUsable("OFF"), false);
    assert.equal(isAssistantUsable("NOT_CONFIGURED"), false);
  });
});

describe("mensajes", () => {
  test("cada «no» dice dónde se arregla, y son distintos", () => {
    const off = AVAILABILITY_MESSAGE.OFF!;
    const sinProveedor = AVAILABILITY_MESSAGE.NOT_CONFIGURED!;
    assert.notEqual(off, sinProveedor);
    assert.match(off, /ajustes/i);
    assert.match(sinProveedor, /a mano/i);
  });

  test("READY no tiene mensaje de error", () => {
    assert.equal(AVAILABILITY_MESSAGE.READY, null);
  });

  test("ningún mensaje muestra jerga ni nombres de variables al administrador", () => {
    for (const mensaje of Object.values(AVAILABILITY_MESSAGE)) {
      if (mensaje === null) continue;
      for (const jerga of ["API", "null", "undefined", "500", "GEMINI_API_KEY"]) {
        assert.equal(
          mensaje.includes(jerga),
          false,
          `"${mensaje}" contiene jerga: ${jerga}`,
        );
      }
    }
  });
});

describe("invariantes del interruptor", () => {
  /*
    El criterio vive en UN sitio. Si una pantalla vuelve a preguntar
    `isConfigured()` por su cuenta y se olvida del ajuste, la IA quedaría
    encendida para esa pantalla — exactamente el fallo que DEC-070 evitó en el
    estado de venta.
  */
  test("ninguna pantalla evalúa la disponibilidad por su cuenta", () => {
    for (const file of [
      "app/admin/(panel)/catalogo/nuevo/page.tsx",
      "app/admin/(panel)/catalogo/nuevo/ai-actions.ts",
      "app/admin/(panel)/ajustes/page.tsx",
    ]) {
      assert.ok(
        read(file).includes("resolveAssistantAvailability"),
        `${file} debe usar resolveAssistantAvailability`,
      );
    }
  });

  test("la Server Action comprueba el interruptor, no solo la pantalla", () => {
    const action = read("app/admin/(panel)/catalogo/nuevo/ai-actions.ts");
    assert.ok(action.includes("isAssistantUsable"));

    // Y lo hace ANTES de leer los bytes de la foto: con la IA apagada, la
    // imagen no se llega a procesar.
    const guardia = action.indexOf("isAssistantUsable");
    const bytes = action.indexOf("arrayBuffer");
    assert.ok(guardia > -1 && bytes > -1 && guardia < bytes);
  });

  test("la IA NO entra en el estado de venta: apagarla no impide vender", () => {
    const saleStatus = read("lib/store/sale-status.ts");
    assert.equal(saleStatus.toLowerCase().includes("assist"), false);
    assert.equal(saleStatus.toLowerCase().includes("ai_"), false);
  });

  test("el interruptor nace apagado en la migración", () => {
    const migration = read("supabase/migrations/0045_settings_ai_assist_toggle.sql");
    assert.match(migration, /ai_assist_enabled boolean not null default false/i);
    // Privada: si alguien le da GRANT a anon, que falle el test.
    assert.equal(/grant\s+select[^;]*ai_assist_enabled/i.test(migration), false);
  });
});
