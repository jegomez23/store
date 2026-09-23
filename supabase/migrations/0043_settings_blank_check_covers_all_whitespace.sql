-- Incremento 16: corrige dos CHECK de la 0042 que dejaban pasar un nombre y una
-- frase hechos solo de espacio en blanco NO-espacio.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ FALLABA, Y CÓMO SE VIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 0042 escribió `btrim(store_name) <> ''`. **`btrim(x)` sin segundo
-- argumento recorta SOLO el carácter espacio**, no el tabulador ni el salto de
-- línea. Su propio test de integración lo cazó con la 0042 ya aplicada:
--
--     PATCH /rest/v1/settings?market_id=eq.ES   (sesión de admin)
--     {"store_name":"   "}     → 400 · 23514   ← la comprobación funciona
--     {"store_name":"\t\n "}   → 200           ← y aquí no
--
-- Consecuencia real: el nombre de la tienda puede quedarse "vacío pero no
-- vacío". Desde este mismo incremento ese valor va al `<title>` de todas las
-- páginas, al logo del Header, al footer y a la imagen de Open Graph, así que
-- el resultado sería una tienda sin nombre en todas partes y un CHECK diciendo
-- que todo está bien.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA CORRECCIÓN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `x ~ '[^[:space:]]'` = «contiene al menos un carácter que no es espacio en
-- blanco». `[:space:]` cubre espacio, tabulador, salto de línea, retorno de
-- carro, avance de página y tabulador vertical, que es exactamente lo que
-- recorta `String.prototype.trim()` en la validación de TypeScript
-- (`validateSettingsInput`). Las dos barreras tienen que decir lo mismo: la de
-- arriba da el mensaje entendible, esta es la que no se puede esquivar.
--
-- Las otras cuatro comprobaciones de la 0042 (email y las tres redes) NO se
-- tocan: sus patrones ya excluyen el espacio en blanco con `[^[:space:]]`, y
-- están verificadas — `"  "` en cualquiera de las redes devuelve 23514.
--
-- No hay que limpiar datos antes: la fila del mercado ES tiene `store_name`
-- 'YI' y `tagline` 'Vive a tu propio ritmo.', así que ninguna incumple.

alter table public.settings drop constraint settings_store_name_valid;

alter table public.settings
  add constraint settings_store_name_valid
    check (store_name ~ '[^[:space:]]' and length(store_name) <= 80);

alter table public.settings drop constraint settings_tagline_valid;

alter table public.settings
  add constraint settings_tagline_valid
    check (tagline is null or (tagline ~ '[^[:space:]]' and length(tagline) <= 160));
