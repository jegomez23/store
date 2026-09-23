import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLACEHOLDER_WHATSAPP_NUMBERS,
  buildWhatsAppUrl,
  isPlaceholderWhatsAppNumber,
  isWhatsAppConfigured,
  normalizePhone,
} from "../phone.ts";

/**
 * Normalización de teléfonos y enlace wa.me (Fase 6).
 * Único punto del proyecto donde se construye una URL de WhatsApp.
 */

describe("normalizePhone", () => {
  test("deja solo dígitos (formato de settings.whatsapp_number)", () => {
    assert.equal(normalizePhone("+34 600 11 22 33"), "34600112233");
    assert.equal(normalizePhone("34-600-112-233"), "34600112233");
    assert.equal(normalizePhone("(34) 600 112 233"), "34600112233");
    assert.equal(normalizePhone("34600112233"), "34600112233");
  });

  test("convierte el prefijo 00 al formato E.164", () => {
    assert.equal(normalizePhone("0034600112233"), "34600112233");
  });

  test("acepta el número colombiano documentado", () => {
    // Ejemplo literal de docs/03-DATABASE.md §2.16.
    assert.equal(normalizePhone("+57 300 123 4567"), "573001234567");
  });

  const invalid: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["cadena vacía", ""],
    ["sin dígitos", "no-soy-un-numero"],
    ["demasiado corto", "12345"],
    ["demasiado largo", "1".repeat(21)],
    ["número en vez de string", 34600112233],
  ];

  for (const [label, value] of invalid) {
    test(`devuelve null con ${label}`, () => {
      assert.equal(normalizePhone(value as string | null | undefined), null);
    });
  }

  test("nunca lanza", () => {
    assert.doesNotThrow(() => normalizePhone(undefined));
    assert.doesNotThrow(() => normalizePhone("💥"));
  });
});

describe("buildWhatsAppUrl", () => {
  test("construye la URL con el número normalizado", () => {
    const url = buildWhatsAppUrl("+34 600 11 22 33", "Hola");
    assert.equal(url, "https://wa.me/34600112233?text=Hola");
  });

  test("codifica saltos de línea, espacios y emojis", () => {
    const url = buildWhatsAppUrl("34600112233", "Hola 👋\nPedido: YI-ES-000001");
    assert.ok(url);
    assert.ok(!url.includes("\n"), "no debe quedar ningún salto de línea crudo");
    assert.ok(url.includes("%0A"), "el salto de línea debe ir codificado");
    assert.ok(url.includes("%20"), "los espacios deben ir codificados");
    // Y debe poder recuperarse intacto.
    const text = decodeURIComponent(new URL(url).searchParams.get("text") ?? "");
    assert.equal(text, "Hola 👋\nPedido: YI-ES-000001");
  });

  test("codifica caracteres que romperían la query string", () => {
    const url = buildWhatsAppUrl("34600112233", "Precio: 34,90 € & 100% algodón #YI");
    assert.ok(url);
    assert.ok(!url.includes("&text"), "el & del mensaje no debe crear otro parámetro");
    assert.ok(!url.includes("#YI"), "el # no debe convertirse en fragmento");
    const parsed = new URL(url);
    assert.equal(
      parsed.searchParams.get("text"),
      "Precio: 34,90 € & 100% algodón #YI",
    );
  });

  test("devuelve null si WhatsApp no está configurado", () => {
    for (const phone of [null, undefined, "", "   ", "abc", "123"]) {
      assert.equal(
        buildWhatsAppUrl(phone as string | null | undefined, "Hola"),
        null,
        `phone=${String(phone)}`,
      );
    }
  });

  test("el resultado es siempre una URL válida de wa.me", () => {
    const url = buildWhatsAppUrl("34600112233", "1x Chaqueta\nTotal: 89,90 €");
    assert.ok(url);
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "wa.me");
    assert.equal(parsed.pathname, "/34600112233");
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * "CONFIGURADO" NO ES "VÁLIDO" (incremento 10, DEC-065)
 * ─────────────────────────────────────────────────────────────────────────
 */

describe("isPlaceholderWhatsAppNumber", () => {
  test("el placeholder del seed PASA la validación de forma", () => {
    // Este es el hecho que hacía invisible el problema: 11 dígitos, formato
    // correcto y enlace construible. Si algún día esto dejara de ser cierto,
    // el resto del incremento sobraría — y el test lo diría.
    assert.equal(normalizePhone("34600000000"), "34600000000");
    assert.notEqual(buildWhatsAppUrl("34600000000", "hola"), null);
  });

  test("y aun así se reconoce como placeholder", () => {
    assert.equal(isPlaceholderWhatsAppNumber("34600000000"), true);
    // Escrito como lo teclearía una persona: la comparación es tras normalizar.
    assert.equal(isPlaceholderWhatsAppNumber("+34 600 00 00 00"), true);
    assert.equal(isPlaceholderWhatsAppNumber("0034600000000"), true);
  });

  test("NO se inventa ninguna regla sobre qué números «parecen falsos»", () => {
    // Un número real que empiece por 600 es perfectamente válido. La lista
    // contiene lo que siembra el repositorio, ni un valor más.
    for (const real of ["34600112233", "34600000001", "573001234567", "600000000"]) {
      assert.equal(isPlaceholderWhatsAppNumber(real), false, real);
    }
  });

  test("vacío o basura no es «placeholder», es «sin número»", () => {
    for (const bad of [null, undefined, "", "   ", "abc", "12"]) {
      assert.equal(isPlaceholderWhatsAppNumber(bad), false, JSON.stringify(bad));
    }
  });
});

describe("isWhatsAppConfigured", () => {
  test("solo es true con un número usable que no sea el del seed", () => {
    assert.equal(isWhatsAppConfigured("34600112233"), true);
    assert.equal(isWhatsAppConfigured("+34 600 11 22 33"), true);
  });

  test("es false con el placeholder, con vacío y con basura", () => {
    assert.equal(isWhatsAppConfigured("34600000000"), false);
    assert.equal(isWhatsAppConfigured(null), false);
    assert.equal(isWhatsAppConfigured(undefined), false);
    assert.equal(isWhatsAppConfigured(""), false);
    assert.equal(isWhatsAppConfigured("12"), false);
  });
});

describe("la lista de placeholders no puede separarse del seed", () => {
  test("el número que siembra 05_settings_and_shipping_es.sql está en la lista", () => {
    // Misma técnica que `ACTION_BODY_LIMIT_BYTES` en next.config.ts: una sola
    // fuente de verdad. Si alguien cambia el seed, este test cae y obliga a
    // actualizar la lista en vez de dejar la puerta abierta en silencio.
    const seed = readFileSync("supabase/seed/05_settings_and_shipping_es.sql", "utf8");
    const insert = seed.match(
      /insert into public\.settings[^;]*values\s*\(([^)]*)\)/i,
    );
    assert.ok(insert, "no se encuentra el insert de settings en el seed");

    const literals = [...insert[1].matchAll(/'([^']*)'/g)].map((match) => match[1]);
    const seeded = literals.filter((value) => /^\d{6,20}$/.test(value));
    assert.equal(seeded.length, 1, `esperaba un único número sembrado: ${JSON.stringify(literals)}`);

    assert.ok(
      PLACEHOLDER_WHATSAPP_NUMBERS.includes(seeded[0]),
      `el seed pone ${seeded[0]} y no está en PLACEHOLDER_WHATSAPP_NUMBERS`,
    );
  });

  test("el seed sigue declarando que ese número NO es real", () => {
    const seed = readFileSync("supabase/seed/05_settings_and_shipping_es.sql", "utf8");
    assert.match(seed, /n[úu]mero de prueba, NO real/i);
  });
});
