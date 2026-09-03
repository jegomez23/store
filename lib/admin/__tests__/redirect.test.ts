import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeAdminRedirect, ADMIN_HOME } from "../redirect.ts";

describe("safeAdminRedirect", () => {
  test("acepta una ruta interna del panel", () => {
    assert.equal(safeAdminRedirect("/admin/pedidos"), "/admin/pedidos");
    assert.equal(
      safeAdminRedirect("/admin/pedidos?estado=pending"),
      "/admin/pedidos?estado=pending",
    );
    assert.equal(safeAdminRedirect("/admin"), "/admin");
  });

  test("rechaza URLs absolutas (open redirect)", () => {
    assert.equal(safeAdminRedirect("https://evil.example"), ADMIN_HOME);
    assert.equal(safeAdminRedirect("http://evil.example/admin"), ADMIN_HOME);
  });

  test("rechaza protocol-relative y backslashes", () => {
    assert.equal(safeAdminRedirect("//evil.example"), ADMIN_HOME);
    assert.equal(safeAdminRedirect("/\\evil.example"), ADMIN_HOME);
    assert.equal(safeAdminRedirect("/admin/\\evil"), ADMIN_HOME);
  });

  test("rechaza rutas fuera de /admin", () => {
    assert.equal(safeAdminRedirect("/carrito"), ADMIN_HOME);
    assert.equal(safeAdminRedirect("/adminx/algo"), ADMIN_HOME);
  });

  test("no devuelve al propio login (evita bucle)", () => {
    assert.equal(safeAdminRedirect("/admin/login"), ADMIN_HOME);
    assert.equal(safeAdminRedirect("/admin/login?next=/admin"), ADMIN_HOME);
  });

  test("valores vacíos o no-string caen a /admin", () => {
    assert.equal(safeAdminRedirect(undefined), ADMIN_HOME);
    assert.equal(safeAdminRedirect(null), ADMIN_HOME);
    assert.equal(safeAdminRedirect(""), ADMIN_HOME);
  });
});
