import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  INVENTORY_FILTERS,
  INVENTORY_PAGE_SIZE,
  isInventoryFilter,
} from "../inventory.ts";

/**
 * Filtros del inventario y las invariantes de la migración 0026, que sigue
 * viva en la base de datos aunque el panel ya no la use (DEC-068).
 *
 * La validación de la edición de stock se prueba en `stock.test.ts`.
 */

describe("filtros del inventario", () => {
  test("solo se aceptan los tres conocidos", () => {
    for (const f of INVENTORY_FILTERS) assert.equal(isInventoryFilter(f), true);
    assert.equal(isInventoryFilter("otro"), false);
    assert.equal(isInventoryFilter(""), false);
    assert.equal(isInventoryFilter(null), false);
    assert.equal(isInventoryFilter(123), false);
  });

  test("la página se cuenta en PRODUCTOS: un grupo no puede partirse", () => {
    assert.ok(Number.isInteger(INVENTORY_PAGE_SIZE) && INVENTORY_PAGE_SIZE > 0);
  });
});

describe("la reposición por delta sigue existiendo, pero fuera del panel", () => {
  test("la migración 0026 no se ha tocado: sigue sumando", () => {
    const sql = fs.readFileSync("supabase/migrations/0026_admin_restock_variants.sql", "utf8");
    assert.match(sql, /set stock = stock \+ v_delta/);
  });

  test("ninguna pantalla del panel llama ya a admin_restock_variants", () => {
    const callers = [
      "app/admin/(panel)/inventario/actions.ts",
      "app/admin/(panel)/catalogo/actions.ts",
      "components/admin/InventoryTable.tsx",
    ];
    for (const file of callers) {
      const source = fs.readFileSync(file, "utf8");
      assert.ok(
        !/rpc\(\s*["']admin_restock_variants["']/.test(source),
        `${file} vuelve a invocar la reposición por delta: el incremento 12 dejó una sola semántica`,
      );
    }
  });
});
