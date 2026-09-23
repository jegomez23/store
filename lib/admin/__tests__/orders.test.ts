import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ALLOWED_TRANSITIONS,
  OPEN_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDERS_PAGE_SIZE,
  TERMINAL_STATUSES,
  canTransition,
  isOrderStatus,
  isTerminal,
  nextStatusesFor,
  normalizeOrderQuery,
  orderSearchTokens,
  sanitizeOrderSearch,
  ordersHref,
  parseOrderListParams,
  quickNextStatus,
  requiresPaymentConfirmation,
  restoresStock,
  totalPages,
  type OrderStatus,
} from "../orders.ts";

describe("estados de pedido", () => {
  test("son exactamente los del CHECK de la migración 0011", () => {
    const sql = fs.readFileSync("supabase/migrations/0011_orders.sql", "utf8");
    const match = sql.match(/status in \(([^)]+)\)/);
    assert.ok(match, "no se encontró el CHECK de status en la migración");
    const fromSql = match[1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    assert.deepEqual([...ORDER_STATUSES].sort(), fromSql);
  });

  test("todos tienen etiqueta visible", () => {
    for (const status of ORDER_STATUSES) {
      assert.ok(ORDER_STATUS_LABELS[status], `falta etiqueta de ${status}`);
    }
  });

  test("isOrderStatus rechaza lo que no es un estado", () => {
    assert.equal(isOrderStatus("pending"), true);
    assert.equal(isOrderStatus("PENDING"), false);
    assert.equal(isOrderStatus("refunded"), false);
    assert.equal(isOrderStatus(""), false);
    assert.equal(isOrderStatus(undefined), false);
    assert.equal(isOrderStatus(42), false);
  });
});

describe("máquina de estados (espejo de la migración 0019)", () => {
  /**
   * Control de deriva: la autoridad es el SQL. Si alguien cambia la migración
   * y no este archivo (o al revés), este test lo caza.
   */
  test("coincide exactamente con el `case` de admin_update_order_status", () => {
    const sql = fs.readFileSync(
      "supabase/migrations/0019_admin_order_status.sql",
      "utf8",
    );
    const fromSql: Record<string, string[]> = {};
    for (const [, from, list] of sql.matchAll(
      /when '(\w+)'\s+then array\[([^\]]*)\]/g,
    )) {
      fromSql[from] = list
        .split(",")
        .map((s) => s.trim().replace(/^'|'$/g, ""))
        .filter(Boolean);
    }

    // Los terminales no aparecen en el `case` (caen en el `else array[]`).
    for (const status of ORDER_STATUSES) {
      const expected = [...ALLOWED_TRANSITIONS[status]];
      const actual = fromSql[status] ?? [];
      assert.deepEqual(
        actual,
        expected,
        `divergencia en "${status}": SQL=${JSON.stringify(actual)} TS=${JSON.stringify(expected)}`,
      );
    }
  });

  test("la cadena feliz avanza paso a paso", () => {
    const chain: OrderStatus[] = [
      "pending",
      "contacted",
      "confirmed",
      "paid",
      "preparing",
      "shipped",
      "delivered",
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      assert.equal(canTransition(chain[i], chain[i + 1]), true, `${chain[i]} → ${chain[i + 1]}`);
    }
  });

  test("no se puede saltar un paso ni retroceder", () => {
    assert.equal(canTransition("pending", "paid"), false);
    assert.equal(canTransition("pending", "delivered"), false);
    assert.equal(canTransition("confirmed", "shipped"), false);
    assert.equal(canTransition("contacted", "pending"), false);
    assert.equal(canTransition("shipped", "preparing"), false);
  });

  test("cancelar es válido desde cualquier estado no terminal", () => {
    for (const status of ORDER_STATUSES) {
      const terminal = status === "delivered" || status === "cancelled";
      assert.equal(
        canTransition(status, "cancelled"),
        !terminal,
        `cancelar desde ${status}`,
      );
    }
  });

  test("delivered y cancelled son terminales", () => {
    assert.deepEqual(nextStatusesFor("delivered"), []);
    assert.deepEqual(nextStatusesFor("cancelled"), []);
  });

  test("ningún estado permite transitar a sí mismo", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(canTransition(status, status), false, status);
    }
  });

  test("solo paid exige confirmación de pago", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(requiresPaymentConfirmation(status), status === "paid", status);
    }
  });

  test("solo cancelar devuelve stock", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(restoresStock(status), status === "cancelled", status);
    }
  });
});

describe("parseOrderListParams", () => {
  test("lee filtros válidos", () => {
    assert.deepEqual(
      parseOrderListParams({ estado: "shipped", q: "YI-ES-000012", pagina: "3" }),
      { status: "shipped", query: "YI-ES-000012", unusableQuery: false, page: 3 },
    );
  });

  test("sin parámetros usa los valores por defecto", () => {
    assert.deepEqual(parseOrderListParams({}), {
      status: null,
      query: null,
      unusableQuery: false,
      page: 1,
    });
  });

  test("un estado inventado se ignora en vez de romper", () => {
    assert.equal(parseOrderListParams({ estado: "refunded" }).status, null);
    assert.equal(parseOrderListParams({ estado: "" }).status, null);
    assert.equal(parseOrderListParams({ estado: ["paid", "x"] }).status, "paid");
  });

  test("páginas inválidas caen a 1", () => {
    for (const pagina of ["0", "-4", "abc", "1.5", "", "99999", "1e3"]) {
      assert.equal(parseOrderListParams({ pagina }).page, 1, `pagina=${pagina}`);
    }
  });
});

describe("normalizeOrderQuery", () => {
  test("normaliza a mayúsculas y conserva el formato del número", () => {
    assert.equal(normalizeOrderQuery(" yi-es-000001 "), "YI-ES-000001");
    assert.equal(normalizeOrderQuery("000012"), "000012");
  });

  test("elimina los comodines de PostgREST/ilike", () => {
    // Sin esto, `%` convertiría la búsqueda en "todos los pedidos" y `,`
    // rompería el parser de filtros de PostgREST.
    assert.equal(normalizeOrderQuery("%"), null);
    assert.equal(normalizeOrderQuery("YI%ES"), "YIES");
    assert.equal(normalizeOrderQuery("a_b,c*d"), "ABCD");
    assert.equal(normalizeOrderQuery("YI-ES-1)"), "YI-ES-1");
  });

  test("vacío o no-string da null", () => {
    assert.equal(normalizeOrderQuery(""), null);
    assert.equal(normalizeOrderQuery("   "), null);
    assert.equal(normalizeOrderQuery(undefined), null);
    assert.equal(normalizeOrderQuery(null), null);
  });

  test("recorta entradas desmesuradas", () => {
    assert.equal(normalizeOrderQuery("A".repeat(200))?.length, 40);
  });
});

describe("paginación y enlaces", () => {
  test("totalPages nunca baja de 1", () => {
    assert.equal(totalPages(0), 1);
    assert.equal(totalPages(1), 1);
    assert.equal(totalPages(ORDERS_PAGE_SIZE), 1);
    assert.equal(totalPages(ORDERS_PAGE_SIZE + 1), 2);
    assert.equal(totalPages(ORDERS_PAGE_SIZE * 3), 3);
  });

  test("ordersHref conserva los filtros y omite la página 1", () => {
    assert.equal(ordersHref({}), "/admin/pedidos");
    assert.equal(ordersHref({ page: 1 }), "/admin/pedidos");
    assert.equal(ordersHref({ status: "paid" }), "/admin/pedidos?estado=paid");
    assert.equal(
      ordersHref({ status: "paid", query: "YI-ES-000001", page: 2 }),
      "/admin/pedidos?estado=paid&q=YI-ES-000001&pagina=2",
    );
  });
});

// ───────────────────────────────────── Cola operativa (Fase 9.5, Incremento 3)

describe("OPEN_STATUSES y terminales", () => {
  test("los abiertos son exactamente los que tienen alguna salida", () => {
    assert.deepEqual([...OPEN_STATUSES], [
      "pending",
      "contacted",
      "confirmed",
      "paid",
      "preparing",
      "shipped",
    ]);
  });

  test("delivered y cancelled son terminales y quedan fuera de la cola", () => {
    assert.equal(isTerminal("delivered"), true);
    assert.equal(isTerminal("cancelled"), true);
    assert.ok(!OPEN_STATUSES.includes("delivered"));
    assert.ok(!OPEN_STATUSES.includes("cancelled"));
  });

  test("abiertos + terminales cubren los ocho estados, sin solaparse", () => {
    const todos = new Set([...OPEN_STATUSES, ...TERMINAL_STATUSES]);
    assert.equal(todos.size, ORDER_STATUSES.length);
    for (const s of ORDER_STATUSES) assert.ok(todos.has(s), s);
  });

  test("se deriva de las transiciones, no de una lista escrita a mano", () => {
    for (const status of ORDER_STATUSES) {
      const abierto = OPEN_STATUSES.includes(status);
      assert.equal(
        abierto,
        ALLOWED_TRANSITIONS[status].length > 0,
        `${status} no coincide con su tabla de transiciones`,
      );
    }
  });
});

describe("quickNextStatus — qué cabe en un solo clic", () => {
  test("ofrece el avance natural de los estados seguros", () => {
    assert.equal(quickNextStatus("pending"), "contacted");
    assert.equal(quickNextStatus("contacted"), "confirmed");
    assert.equal(quickNextStatus("paid"), "preparing");
    assert.equal(quickNextStatus("preparing"), "shipped");
  });

  test("NUNCA ofrece 'paid': exige confirmación explícita del pago", () => {
    assert.equal(quickNextStatus("confirmed"), null);
    for (const status of ORDER_STATUSES) {
      assert.notEqual(quickNextStatus(status), "paid", `${status} ofrecía paid`);
    }
  });

  test("NUNCA ofrece un estado terminal desde el listado", () => {
    assert.equal(quickNextStatus("shipped"), null);
    for (const status of ORDER_STATUSES) {
      const next = quickNextStatus(status);
      if (next !== null) assert.ok(!isTerminal(next), `${status} ofrecía ${next}`);
    }
  });

  test("NUNCA ofrece 'cancelled': devuelve stock y es irreversible", () => {
    for (const status of ORDER_STATUSES) {
      assert.notEqual(quickNextStatus(status), "cancelled", `${status} ofrecía cancelled`);
    }
  });

  test("los terminales no ofrecen nada", () => {
    assert.equal(quickNextStatus("delivered"), null);
    assert.equal(quickNextStatus("cancelled"), null);
  });

  test("todo atajo que se ofrece es una transición LEGAL", () => {
    for (const status of ORDER_STATUSES) {
      const next = quickNextStatus(status);
      if (next !== null) {
        assert.ok(canTransition(status, next), `${status} → ${next} no es legal`);
      }
    }
  });
});

// ─────────────────────────────────── Buscador del listado (P3)

describe("sanitizeOrderSearch", () => {
  test("conserva un nombre con tildes, ñ y espacios", () => {
    // Lo que hacía la normalización anterior con esto era dejar "ANAPREZ".
    assert.equal(sanitizeOrderSearch("Ana Pérez"), "Ana Pérez");
    assert.equal(sanitizeOrderSearch("Bruno Núñez"), "Bruno Núñez");
    assert.equal(sanitizeOrderSearch("O'Connor"), "O'Connor");
  });

  test("conserva el número de pedido tal cual", () => {
    assert.equal(sanitizeOrderSearch("YI-ES-000001"), "YI-ES-000001");
  });

  test("conserva los dígitos de un teléfono pegado del chat", () => {
    assert.equal(sanitizeOrderSearch("+34 600 111 222"), "34 600 111 222");
  });

  test("elimina los comodines de LIKE y de PostgREST", () => {
    for (const wildcard of ["%", "_", "*"]) {
      assert.equal(
        sanitizeOrderSearch(`Ana${wildcard}`),
        "Ana",
        `no debe sobrevivir ${wildcard}`,
      );
    }
  });

  test("elimina lo que rompería el `or=(…)` de PostgREST", () => {
    // `,` `(` `)` y `.` son estructura de la consulta: si pasaran, el texto del
    // usuario dejaría de ser un valor.
    assert.equal(sanitizeOrderSearch("a,b"), "a b");
    assert.equal(sanitizeOrderSearch("a(b)c"), "a b c");
    assert.equal(sanitizeOrderSearch("name.ilike"), "name ilike");
    // `String.raw` para que el backslash llegue de verdad al test.
    assert.equal(sanitizeOrderSearch(String.raw`a"b\c`), "a b c");
  });

  test("colapsa espacios y recorta", () => {
    assert.equal(sanitizeOrderSearch("  Ana    Pérez  "), "Ana Pérez");
  });

  test("vacío, solo espacios y solo símbolos dan null", () => {
    assert.equal(sanitizeOrderSearch(""), null);
    assert.equal(sanitizeOrderSearch("   "), null);
    assert.equal(sanitizeOrderSearch("%%%"), null);
    assert.equal(sanitizeOrderSearch(undefined), null);
    assert.equal(sanitizeOrderSearch(null), null);
  });

  test("acota la longitud", () => {
    assert.equal(sanitizeOrderSearch("a".repeat(200))?.length, 40);
  });
});

describe("orderSearchTokens", () => {
  test("de un número de pedido salen los tres tokens", () => {
    const t = orderSearchTokens("YI-ES-000001");
    assert.equal(t.orderNumber, "YI-ES-000001");
    assert.equal(t.digits, "000001");
    assert.equal(t.name, "YI-ES-000001");
  });

  test("de un teléfono con formato salen SOLO sus dígitos para `phone`", () => {
    // `customers.phone` se guarda sin '+' ni espacios (create_order), así que
    // sin esto pegar el número del chat no encontraría nada.
    const t = orderSearchTokens("34 600 111 222");
    assert.equal(t.digits, "34600111222");
  });

  test("de un nombre sin dígitos, `digits` es null", () => {
    // Si no, la cláusula quedaría `phone.ilike.**` y casaría con TODOS.
    const t = orderSearchTokens("Ana Pérez");
    assert.equal(t.digits, null);
    assert.equal(t.name, "Ana Pérez");
  });

  test("un nombre sin letras aptas para número deja `orderNumber` null", () => {
    assert.equal(orderSearchTokens("   ")?.orderNumber, null);
  });

  test("null entra, null sale en los tres", () => {
    assert.deepEqual(orderSearchTokens(null), {
      orderNumber: null,
      digits: null,
      name: null,
    });
  });

  test("el token de número se pasa a mayúsculas, el de nombre NO", () => {
    const t = orderSearchTokens("yi-es-1 Ana");
    assert.equal(t.orderNumber, "YI-ES-1ANA");
    assert.equal(t.name, "yi-es-1 Ana");
  });
});

describe("parseOrderListParams · búsqueda", () => {
  test("el parámetro `q` ya no destruye un nombre", () => {
    const params = parseOrderListParams({ q: "Ana Pérez" });
    assert.equal(params.query, "Ana Pérez");
  });

  test("sigue aceptando un número de pedido", () => {
    assert.equal(parseOrderListParams({ q: " YI-ES-000001 " }).query, "YI-ES-000001");
  });
});

describe("parseOrderListParams · búsqueda inservible", () => {
  test("escribir solo comodines NO equivale a no buscar", () => {
    // Antes de P3 esto devolvía `query: null` y la pantalla listaba TODOS los
    // pedidos, que se lee como "tu búsqueda ha encontrado todo". Medido sobre
    // el build servido: `%` devolvía los tres pedidos de prueba.
    for (const evil of ["%", "***", "%%%", "((("]) {
      const params = parseOrderListParams({ q: evil });
      assert.equal(params.query, null, evil);
      assert.equal(params.unusableQuery, true, `${evil} debe marcarse inservible`);
    }
  });

  test("no buscar nada NO es una búsqueda inservible", () => {
    assert.equal(parseOrderListParams({}).unusableQuery, false);
    assert.equal(parseOrderListParams({ q: "" }).unusableQuery, false);
    assert.equal(parseOrderListParams({ q: "   " }).unusableQuery, false);
  });

  test("una búsqueda válida tampoco", () => {
    assert.equal(parseOrderListParams({ q: "Ana" }).unusableQuery, false);
  });
});
