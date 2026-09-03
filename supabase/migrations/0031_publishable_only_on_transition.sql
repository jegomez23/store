-- Fase 9.5 — Incremento 5B: la barrera solo vigila la ENTRADA en publicación.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ SE CORRIGE DE LA 0030
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 0030 revalidaba en CUALQUIER update de un producto ya publicado. Efecto
-- no buscado: un producto que hoy está publicado y al que alguien desactivó su
-- última variante quedaba **imposible de editar** — corregirle el nombre o la
-- descripción fallaba con NO_ACTIVE_VARIANT. Obligaba a despublicarlo primero
-- para poder tocarlo, que es castigar al que intenta arreglarlo.
--
-- Esta versión valida solo la TRANSICIÓN hacia `active`:
--
--   · INSERT que confirma con status='active'        → se valida
--   · UPDATE de no-publicado  →  publicado           → se valida
--   · UPDATE de publicado     →  publicado           → NO se valida
--   · cualquier cosa que acabe en borrador/archivado → NO se valida
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE ESTA BARRERA NO PRETENDE SER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No garantiza la invariante "publicado ⇒ publicable", y no puede: desactivar
-- la última variante de un producto ya publicado lo rompe, y **no se despublica
-- nada automáticamente** porque eso está fuera de alcance. Lo que sí hace es
-- impedir el único caso que depende de una acción deliberada del admin:
-- pulsar "Publicar" sobre algo cuya ficha daría 404.
--
-- Ese otro estado, el que se alcanza por detrás, lo señalan la alerta del
-- resumen y el filtro "No se pueden comprar" del catálogo, que usan el mismo
-- predicado (`product_is_sellable`, migración 0029).
--
-- Se mantiene `deferrable initially deferred`: publicar y crear las variantes
-- en la MISMA transacción sigue siendo válido (es lo que hace el seed), y en
-- transacciones distintas —una petición de PostgREST por commit— no.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_publishable_product()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_still_published boolean;
begin
  -- Solo la ENTRADA en publicación. Un producto que ya estaba publicado antes
  -- de este UPDATE no se revalida: romperlo no fue este cambio.
  if tg_op = 'UPDATE' and old.status = 'active' and old.deleted_at is null then
    return null;
  end if;

  -- Estado REAL en el COMMIT, no el del evento que disparó esto: al diferirse,
  -- la fila puede haberse despublicado o borrado después. Sin esta relectura,
  -- publicar y volver a dejar en borrador dentro de la misma transacción
  -- fallaría sin motivo.
  select exists (
    select 1 from public.products p
    where p.id = new.id
      and p.status = 'active'
      and p.deleted_at is null
  ) into v_still_published;

  if not v_still_published then
    return null;
  end if;

  if not public.product_has_active_variant(new.id) then
    raise exception 'NO_ACTIVE_VARIANT'
      using errcode = 'P0001',
            detail = 'Un producto sin variantes activas no se puede publicar: su ficha devolveria 404.';
  end if;

  return null;
end;
$$;
