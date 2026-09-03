-- Fase 9.5 — Incremento 5B: la barrera de publicación pasa a diferirse al COMMIT.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ CAMBIA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El trigger `BEFORE` de la migración 0029 evaluaba la condición en el
-- instante del INSERT/UPDATE, y eso rechaza un patrón que SÍ es legítimo:
-- crear el producto ya publicado y sus variantes **dentro de la misma
-- transacción**. Es exactamente lo que hace `supabase/seed/04_products_es.sql`
-- en su bloque `do $$ ... $$`, y lo que haría cualquier importación futura.
--
-- Un CONSTRAINT TRIGGER `deferrable initially deferred` se evalúa al COMMIT,
-- así que juzga el estado FINAL de la transacción y no un estado intermedio.
-- Con eso:
--
--   · producto activo + variantes en UNA transacción  → válido (seed, importes)
--   · producto activo solo, confirmado sin variantes  → rechazado
--
-- Y lo segundo incluye el caso que importa: PostgREST abre una transacción por
-- petición, así que publicar desde el panel y crear las variantes después son
-- commits distintos. Entre uno y otro el producto estaría publicado y roto, y
-- eso es justo lo que no puede pasar.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ SE COMPRUEBA AL COMMIT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Al diferirse, la fila puede haber cambiado —o desaparecido— después del
-- evento que disparó el trigger. Por eso se relee el estado ACTUAL antes de
-- juzgar: si el producto ya no existe, se borró lógicamente o dejó de estar
-- publicado, no hay nada que validar. Sin esa relectura, publicar y volver a
-- guardar como borrador en la misma transacción fallaría sin motivo.
-- ───────────────────────────────────────────────────────────────────────────

drop trigger if exists enforce_publishable_product on public.products;

create or replace function public.enforce_publishable_product()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_still_published boolean;
begin
  -- Estado REAL en el momento del COMMIT, no el del evento que disparó esto.
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

-- `after` + `deferrable initially deferred`: es lo que lo convierte en una
-- comprobación de fin de transacción y no de fin de sentencia.
--
-- Se dispara también cuando un producto YA publicado se actualiza. No es un
-- descuido: la relectura de arriba hace que solo falle si en ese momento sigue
-- publicado y sin variantes activas, que es un estado que no debe existir.
-- Desactivar la última variante de un producto publicado NO dispara esto —el
-- trigger está en `products`, no en `product_variants`— y eso es deliberado:
-- **no se despublica nada automáticamente**, queda fuera de alcance. Ese caso
-- lo señala la alerta del resumen y el filtro "No se pueden comprar".
create constraint trigger enforce_publishable_product
  after insert or update on public.products
  deferrable initially deferred
  for each row execute function public.enforce_publishable_product();
