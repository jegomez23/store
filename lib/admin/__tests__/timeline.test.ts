import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_NOTE_LENGTH,
  buildTimeline,
  parseNoteBody,
  repeatCustomerLabel,
  describeChange,
  isCriticalChange,
  type TimelineEventInput,
  type TimelineNoteInput,
} from "../timeline.ts";

/**
 * Lógica pura del expediente del pedido (Fase 9.5, Incremento 5A).
 *
 * Lo que se protege aquí es el ORDEN: si el hilo miente sobre la secuencia,
 * el administrador reconstruye mal lo que pasó, que es justo lo contrario de
 * lo que este incremento venía a dar.
 */

function event(
  id: string,
  createdAt: string,
  extra: Partial<TimelineEventInput> = {},
): TimelineEventInput {
  return {
    id,
    fromStatus: "pending",
    toStatus: "contacted",
    note: null,
    createdAt,
    actorId: "admin-1",
    ...extra,
  };
}

function note(
  id: string,
  createdAt: string,
  body = "Dirección: calle Mayor 3",
): TimelineNoteInput {
  return { id, body, createdAt, actorId: "admin-1", authorName: "Juan" };
}

describe("buildTimeline", () => {
  test("mezcla eventos y notas en orden cronológico ascendente", () => {
    const timeline = buildTimeline(
      [event("e1", "2026-01-01T10:00:00Z"), event("e2", "2026-01-03T10:00:00Z")],
      [note("n1", "2026-01-02T10:00:00Z")],
    );

    assert.deepEqual(
      timeline.map((entry) => entry.id),
      ["e1", "n1", "e2"],
    );
  });

  test("conserva el tipo de cada entrada", () => {
    const timeline = buildTimeline([event("e1", "2026-01-01T10:00:00Z")], [
      note("n1", "2026-01-02T10:00:00Z"),
    ]);

    assert.equal(timeline[0].kind, "event");
    assert.equal(timeline[1].kind, "note");
    // El cuerpo de la nota sobrevive intacto al mezclado.
    if (timeline[1].kind === "note") {
      assert.equal(timeline[1].body, "Dirección: calle Mayor 3");
      assert.equal(timeline[1].authorName, "Juan");
    }
  });

  test("con el MISMO instante, el hecho va antes que el comentario", () => {
    // Caso real: alguien escribe una nota en el mismo milisegundo en que otra
    // pestaña cambia el estado. Sin desempate, el orden dependería de cómo
    // llegaran los arrays, que PostgREST no garantiza.
    const same = "2026-01-01T10:00:00Z";
    const timeline = buildTimeline([event("e1", same)], [note("n1", same)]);

    assert.deepEqual(
      timeline.map((entry) => entry.kind),
      ["event", "note"],
    );
  });

  test("dos notas en el mismo instante desempatan por id, de forma estable", () => {
    const same = "2026-01-01T10:00:00Z";
    const forward = buildTimeline([], [note("aaa", same), note("bbb", same)]);
    const backward = buildTimeline([], [note("bbb", same), note("aaa", same)]);

    assert.deepEqual(
      forward.map((entry) => entry.id),
      ["aaa", "bbb"],
    );
    // El mismo resultado venga como venga la entrada: eso es ser estable.
    assert.deepEqual(
      backward.map((entry) => entry.id),
      ["aaa", "bbb"],
    );
  });

  test("funciona con cualquiera de las dos listas vacía", () => {
    assert.equal(buildTimeline([], []).length, 0);
    assert.equal(buildTimeline([event("e1", "2026-01-01T10:00:00Z")], []).length, 1);
    assert.equal(buildTimeline([], [note("n1", "2026-01-01T10:00:00Z")]).length, 1);
  });

  test("no muta los arrays que recibe", () => {
    const events = [event("e2", "2026-01-03T10:00:00Z"), event("e1", "2026-01-01T10:00:00Z")];
    const notes = [note("n1", "2026-01-02T10:00:00Z")];

    buildTimeline(events, notes);

    // `Array.prototype.sort` ordena EN SITIO: si se hubiera ordenado el array
    // recibido, el orden original se habría perdido para quien lo pasó.
    assert.deepEqual(events.map((e) => e.id), ["e2", "e1"]);
    assert.equal(notes.length, 1);
  });
});

describe("parseNoteBody", () => {
  test("recorta y acepta texto normal", () => {
    const result = parseNoteBody("  Entrega el jueves por la tarde  ");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.body, "Entrega el jueves por la tarde");
  });

  test("conserva los saltos de línea internos", () => {
    // Una dirección pegada del chat viene en varias líneas y debe seguir así.
    const result = parseNoteBody("Calle Mayor 3\n2º B\n28013 Madrid");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.body.split("\n").length, 3);
  });

  test("rechaza vacío y solo espacios", () => {
    for (const raw of ["", "   ", "\n\t  \n"]) {
      assert.equal(parseNoteBody(raw).ok, false);
    }
  });

  test("rechaza lo que no es texto", () => {
    for (const raw of [null, undefined, 42, {}, []]) {
      assert.equal(parseNoteBody(raw).ok, false);
    }
  });

  test("el límite coincide EXACTAMENTE con el CHECK de la migración 0027", () => {
    // `length(btrim(body)) between 1 and 2000`. Si estos dos números divergen,
    // el admin recibe un código de PostgreSQL en vez de un mensaje legible.
    assert.equal(MAX_NOTE_LENGTH, 2000);
    assert.equal(parseNoteBody("a".repeat(MAX_NOTE_LENGTH)).ok, true);
    assert.equal(parseNoteBody("a".repeat(MAX_NOTE_LENGTH + 1)).ok, false);
  });

  test("mide DESPUÉS de recortar, igual que btrim en SQL", () => {
    const padded = `   ${"a".repeat(MAX_NOTE_LENGTH)}   `;
    assert.equal(parseNoteBody(padded).ok, true);
  });
});

describe("repeatCustomerLabel", () => {
  test("no dice nada en la primera compra", () => {
    assert.equal(repeatCustomerLabel(1), null);
  });

  test("distingue el segundo pedido del resto", () => {
    assert.equal(repeatCustomerLabel(2), "Segundo pedido de este cliente");
    assert.equal(repeatCustomerLabel(7), "Pedido n.º 7 de este cliente");
  });

  test("no inventa ninguna categoría comercial", () => {
    // Se comprueba que el texto es un RECUENTO y nada más: nada de "VIP",
    // "fiel" ni umbrales que el negocio no ha definido.
    const label = repeatCustomerLabel(25) ?? "";
    assert.match(label, /25/);
    for (const inventado of ["VIP", "fiel", "habitual", "premium", "importante"]) {
      assert.equal(label.toLowerCase().includes(inventado.toLowerCase()), false);
    }
  });

  test("aguanta valores imposibles sin afirmar nada", () => {
    for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(repeatCustomerLabel(value), null);
    }
  });
});

describe("describeChange", () => {
  const money = (n: number) => `${n.toFixed(2)} €`;

  test("el precio se lee como una frase, no como JSON", () => {
    const text = describeChange(
      { field: "price", oldValue: "29.90", newValue: "34.90", source: "directo" },
      money,
    );
    assert.equal(text, "Precio: 29.90 € → 34.90 €");
  });

  test("la reposición dice las unidades que entraron", () => {
    // "Repuso +12" es lo que pasó; "12 → 24" solo describe el resultado.
    const text = describeChange(
      { field: "stock", oldValue: "12", newValue: "24", source: "reposicion" },
      money,
    );
    assert.equal(text, "Repuso +12 uds (12 → 24)");
  });

  test("una reposición NEGATIVA se dice con su signo", () => {
    const text = describeChange(
      { field: "stock", oldValue: "12", newValue: "5", source: "reposicion" },
      money,
    );
    assert.equal(text, "Repuso -7 uds (12 → 5)");
  });

  test("la corrección absoluta se distingue de la reposición", () => {
    const text = describeChange(
      { field: "stock", oldValue: "12", newValue: "24", source: "correccion" },
      money,
    );
    assert.equal(text, "Stock corregido: 12 → 24");
  });

  test("el estado se convierte en la acción que fue", () => {
    const frase = (newValue: string) =>
      describeChange({ field: "status", oldValue: "draft", newValue, source: "directo" }, money);
    assert.equal(frase("active"), "Publicado");
    assert.equal(frase("draft"), "Retirado de la tienda");
    assert.equal(frase("archived"), "Archivado");
  });

  test("el borrado y la restauración se distinguen por el valor nuevo", () => {
    const borrado = describeChange(
      { field: "deleted_at", oldValue: null, newValue: "2026-09-03T10:00:00Z", source: "directo" },
      money,
    );
    const restaurado = describeChange(
      { field: "deleted_at", oldValue: "2026-09-03T10:00:00Z", newValue: null, source: "directo" },
      money,
    );
    assert.equal(borrado, "Producto eliminado");
    assert.equal(restaurado, "Producto restaurado");
  });

  test("no revienta con valores corruptos: degrada a una frase genérica", () => {
    assert.equal(
      describeChange({ field: "price", oldValue: "x", newValue: "y", source: "directo" }, money),
      "Precio cambiado",
    );
    assert.equal(
      describeChange({ field: "stock", oldValue: null, newValue: null, source: "directo" }, money),
      "Stock cambiado",
    );
    assert.equal(
      describeChange({ field: "status", oldValue: "draft", newValue: "?", source: "directo" }, money),
      "Estado cambiado",
    );
  });
});

describe("isCriticalChange", () => {
  test("solo se destaca lo que quita venta", () => {
    assert.equal(isCriticalChange({ field: "deleted_at", newValue: "2026-09-03" }), true);
    assert.equal(isCriticalChange({ field: "deleted_at", newValue: null }), false);
    assert.equal(isCriticalChange({ field: "status", newValue: "draft" }), true);
    assert.equal(isCriticalChange({ field: "status", newValue: "archived" }), true);
    assert.equal(isCriticalChange({ field: "status", newValue: "active" }), false);
  });

  test("un precio o un stock no son alarmas: son trabajo normal", () => {
    assert.equal(isCriticalChange({ field: "price", newValue: "1" }), false);
    assert.equal(isCriticalChange({ field: "stock", newValue: "0" }), false);
  });
});
