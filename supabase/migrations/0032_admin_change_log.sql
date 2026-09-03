-- Fase 9.5 — Incremento 5C: trazabilidad de decisiones administrativas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ SE AUDITA, Y POR QUÉ NO TODO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cuatro campos, y solo cuatro: `products.status`, `products.deleted_at`,
-- `product_variants.price` y `product_variants.stock`. Auditados porque un
-- cambio en ellos cuesta dinero o visibilidad y hoy no deja NINGÚN rastro:
-- `order_events` es la única tabla de auditoría del esquema y solo cubre
-- transiciones de pedido.
--
-- No se auditan nombre, descripciones, campos SEO, imágenes, categoría ni
-- `updated_at`. Un log que lo registra todo no responde ninguna pregunta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA DISTINCIÓN QUE IMPORTA: "CAMBIÓ EL VALOR" vs "ALGUIEN LO DECIDIÓ"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El stock se mueve por cuatro caminos, y solo dos son decisiones:
--
--   A) VENTA        create_order            → NO se audita
--   B) CANCELACIÓN  admin_update_order_status → NO se audita
--   C) REPOSICIÓN   admin_restock_variants  → sí
--   D) CORRECCIÓN   updateVariantAction     → sí
--
-- A y B quedan fuera porque `order_events` YA los cubre —guarda actor, fecha y
-- la transición, y el detalle por variante sale de `order_items.variant_id`—.
-- Registrarlos otra vez sería una segunda auditoría artificial.
--
-- CONSECUENCIA HONESTA: el historial de stock TIENE HUECOS. Un stock puede
-- pasar de 24 a 20 sin una entrada, porque se vendieron cuatro unidades. Esta
-- tabla NO es un libro mayor de existencias y la interfaz no lo dice: enseña
-- decisiones del administrador. Si algún día hiciera falta el libro mayor
-- completo, sería otra cosa y otra tabla.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ UN TRIGGER Y NO UNA SERVER ACTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Porque una Server Action se salta. El PATCH directo a PostgREST con la
-- sesión del admin pasa por RLS sin tocar una línea de TypeScript. El trigger
-- se dispara igual, y registra el cambio REAL que quedó en la fila —no el que
-- la interfaz creía escribir—, lo que además hace que la concurrencia salga
-- bien sola: dos reposiciones simultáneas de +5 y +7 sobre 10 producen
-- 10 → 15 y 15 → 22, porque la segunda transacción relee tras el bloqueo.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÓMO SABE EL TRIGGER DE DÓNDE VIENE EL CAMBIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por `current_setting('request.path')`, que PostgREST fija por petición. No
-- depende de que ninguna función se acuerde de marcar nada: sale del propio
-- request. Si el ajuste no existe (una sesión SQL directa), el origen queda
-- como 'directo', que es la verdad.
-- ───────────────────────────────────────────────────────────────────────────

create table public.admin_change_log (
  id bigint generated always as identity primary key,

  -- ANCLA DE LECTURA. El historial siempre se pide por producto, así que la
  -- columna que ordena el acceso es esta. `market_id` NO se guarda: se deriva
  -- de `products.market_id` por este mismo join, y duplicarlo solo abriría la
  -- posibilidad de que los dos valores dejaran de coincidir.
  product_id uuid not null references public.products (id) on delete cascade,

  -- NULL para los campos del producto (status, deleted_at). `set null` y no
  -- `cascade`: borrar una variante no puede borrar la constancia de lo que se
  -- hizo con ella.
  variant_id uuid references public.product_variants (id) on delete set null,

  -- Único dato duplicado de toda la tabla, y con motivo: es lo que sobrevive
  -- al borrado de la variante, igual que los snapshots de `order_items`. Sin
  -- él, `variant_id = null` dejaría un registro que no dice de qué hablaba.
  -- El NOMBRE del producto no se copia: `product_id` no se borra en duro
  -- (el borrado del catálogo es lógico), así que siempre se puede leer.
  sku text,

  field_name text not null check (
    field_name in ('status', 'deleted_at', 'price', 'stock')
  ),

  -- `text` y no `jsonb`: los cuatro campos son escalares (text, timestamptz,
  -- numeric, int) y quien lee necesita "29.90 → 34.90", no un documento.
  -- `jsonb` obligaría a la interfaz a interpretar estructura para nada.
  old_value text,
  new_value text,

  -- De dónde vino el cambio. No es derivable a posteriori y cambia lo que se
  -- le enseña al administrador: "repuso +12" no es lo mismo que "corrigió a 24".
  source text not null check (
    source in ('reposicion', 'correccion', 'matriz', 'directo', 'rpc')
  ),

  -- Quién. Del `auth.uid()` de la sesión, jamás de un formulario.
  actor_id uuid not null references public.profiles (id),

  created_at timestamptz not null default now()
);

-- ÚNICO PATRÓN DE ACCESO: "el historial de este producto, lo más reciente
-- primero", con LIMIT. El índice compuesto sirve al filtro y al orden a la vez,
-- así que el plan no necesita ordenar después. No se añade ningún índice por
-- `actor_id` ni por `created_at` global: nadie hace esas preguntas hoy.
create index idx_admin_change_log_product
  on public.admin_change_log (product_id, created_at desc);

alter table public.admin_change_log enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: SE PUEDE LEER, NO SE PUEDE ESCRIBIR — NI SIENDO ADMIN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hay UNA sola policy, y es de SELECT. No existe policy de INSERT a propósito:
-- si un administrador pudiera insertar, podría fabricar un registro diciendo
-- que otro bajó un precio. La única forma de escribir aquí es el trigger.
--
-- El trigger puede hacerlo porque su función es SECURITY DEFINER y pertenece a
-- `postgres`, dueño de la tabla, y el dueño no está sujeto a RLS mientras no se
-- active FORCE ROW LEVEL SECURITY. Es decir: **no hace falta ninguna policy de
-- escritura, y por eso no la hay**. Nada de service_role.
--
-- El REVOKE es la segunda barrera, por si algún día alguien añadiera una policy
-- por descuido: sin el privilegio de tabla, la policy no serviría de nada.
create policy "admin_read_admin_change_log" on public.admin_change_log
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.admin_change_log from authenticated, anon;

comment on table public.admin_change_log is
  'Fase 9.5 (5C, DEC-055). Decisiones administrativas sobre status, deleted_at, price y stock. Escrita SOLO por el trigger log_admin_change (SECURITY DEFINER); no hay policy de INSERT para que un admin no pueda fabricar registros. NO es un libro mayor de stock: las ventas y las cancelaciones no entran porque order_events ya las cubre.';

-- ═══════════════════════════════════════════════════════════════════════════
-- EL TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.log_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_path text := coalesce(current_setting('request.path', true), '');
  v_source text;
  v_product_id uuid;
  v_sku text;
begin
  -- 1. SIN ACTOR NO HAY DECISIÓN.
  --    El checkout llama a `create_order` como anónimo, así que `auth.uid()`
  --    es NULL y la venta no entra. Tampoco entra nada escrito con la service
  --    role key (su JWT no lleva `sub`), que es exactamente lo que se quiere:
  --    esta tabla registra decisiones de personas identificadas.
  if v_actor is null then
    return null;
  end if;

  -- 2. ORIGEN, desde el propio request y no desde una marca que alguien tenga
  --    que acordarse de poner.
  v_source := case
    when v_path like '%/rpc/admin_restock_variants' then 'reposicion'
    when v_path like '%/rpc/admin_create_variant_matrix' then 'matriz'
    when v_path like '%/rpc/%' then 'rpc'
    else 'directo'
  end;

  -- 3. LO QUE YA CUBRE `order_events` NO SE DUPLICA.
  --    Cancelar un pedido devuelve stock, y eso queda registrado con actor,
  --    fecha y la nota del evento; el detalle por variante sale de
  --    `order_items`. Registrarlo otra vez aquí no añadiría información.
  if v_path like '%/rpc/admin_update_order_status' then
    return null;
  end if;

  if tg_table_name = 'products' then
    v_product_id := new.id;

    -- `is distinct from` y no `<>`: con NULL, `<>` devuelve NULL y el IF no se
    -- cumple. `deleted_at` es NULL la mayor parte de su vida, así que sin esto
    -- el borrado lógico no se registraría nunca.
    if new.status is distinct from old.status then
      insert into public.admin_change_log
        (product_id, field_name, old_value, new_value, source, actor_id)
      values (v_product_id, 'status', old.status, new.status, v_source, v_actor);
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      insert into public.admin_change_log
        (product_id, field_name, old_value, new_value, source, actor_id)
      values (
        v_product_id, 'deleted_at',
        old.deleted_at::text, new.deleted_at::text,
        v_source, v_actor
      );
    end if;

    return null;
  end if;

  -- product_variants
  select p.id, new.sku into v_product_id, v_sku
    from public.products p
   where p.id = new.product_id;

  if new.price is distinct from old.price then
    insert into public.admin_change_log
      (product_id, variant_id, sku, field_name, old_value, new_value, source, actor_id)
    values (
      v_product_id, new.id, v_sku, 'price',
      old.price::text, new.price::text, v_source, v_actor
    );
  end if;

  if new.stock is distinct from old.stock then
    -- La corrección absoluta llega por PATCH a /product_variants; la reposición
    -- por RPC. Se distinguen para que la interfaz pueda decir "repuso" o
    -- "corrigió" en vez de un frío "12 → 24".
    insert into public.admin_change_log
      (product_id, variant_id, sku, field_name, old_value, new_value, source, actor_id)
    values (
      v_product_id, new.id, v_sku, 'stock',
      old.stock::text, new.stock::text,
      case when v_source = 'directo' then 'correccion' else v_source end,
      v_actor
    );
  end if;

  return null;
end;
$$;

comment on function public.log_admin_change() is
  'Fase 9.5 (5C). SECURITY DEFINER para poder escribir en admin_change_log, que no tiene policy de INSERT. Solo AFTER UPDATE: crear algo no es cambiarlo. Ignora los cambios sin auth.uid() (venta anonima, service role) y los de admin_update_order_status (ya cubiertos por order_events).';

-- AFTER UPDATE y no BEFORE: se registra lo que quedó escrito de verdad.
-- Tampoco en INSERT: crear un producto o una variante no es un cambio de un
-- valor a otro, y su existencia ya es visible en el catálogo.
create trigger log_admin_change_products
  after update on public.products
  for each row execute function public.log_admin_change();

create trigger log_admin_change_variants
  after update on public.product_variants
  for each row execute function public.log_admin_change();
