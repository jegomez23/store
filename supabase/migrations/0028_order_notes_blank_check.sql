-- Fase 9.5 — Incremento 5A: corrección del CHECK de `order_notes.body`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL FALLO, ENCONTRADO POR EL TEST DE INTEGRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La migración 0027 escribió:
--
--     check (length(btrim(body)) between 1 and 2000)
--
-- dando por hecho que `btrim` se comporta como `String.prototype.trim()` de
-- JavaScript. **No es así.** `btrim(string)` con un solo argumento elimina
-- ÚNICAMENTE espacios (U+0020). Ni tabuladores, ni saltos de línea, ni
-- retornos de carro.
--
-- Consecuencia medida contra el proyecto real: un POST directo a PostgREST con
--
--     { "body": "\n\t " }
--
-- devolvía 201 y guardaba la fila. La validación de TypeScript
-- (`parseNoteBody`) sí la rechazaba, así que desde la interfaz era imposible —
-- pero una Server Action no es la barrera, y la tabla es APPEND-ONLY: esa fila
-- en blanco no se podría borrar después ni siendo admin.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA CORRECCIÓN
-- ═══════════════════════════════════════════════════════════════════════════
--
--   · `body ~ '\S'` — "contiene al menos un carácter que no es espacio en
--     blanco". Es la forma directa de decir "no está en blanco", y no depende
--     de qué caracteres recorte `btrim`.
--   · El límite superior se mide sobre el texto recortado, ahora indicando
--     explícitamente el conjunto a quitar, para que coincida con lo que
--     `String.prototype.trim()` habrá hecho ya en el servidor.
--
-- `order_notes` se creó en esta misma fase y está vacía, así que el ALTER
-- valida cero filas.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.order_notes
  drop constraint order_notes_body_check;

alter table public.order_notes
  add constraint order_notes_body_check
  check (body ~ '\S' and length(btrim(body, E' \t\n\r\f\v')) <= 2000);

comment on constraint order_notes_body_check on public.order_notes is
  'Fase 9.5 (5A). No en blanco + 2000 caracteres como maximo. Se usa ~ para lo primero porque btrim(text) solo quita espacios, no \t ni \n: la version de la 0027 aceptaba notas en blanco por POST directo.';
