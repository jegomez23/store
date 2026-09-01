import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildWhatsAppUrl, normalizePhone } from "../phone.ts";

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
