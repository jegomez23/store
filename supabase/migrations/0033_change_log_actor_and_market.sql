-- Fase 9.5 — Incremento 5C (corrección). Tres agujeros REPRODUCIDOS en la
-- migración 0032 contra el proyecto real antes de escribir una línea de esto.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UNA VENTA CON SESIÓN INICIADA SE AUDITABA COMO DECISIÓN ADMINISTRATIVA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 0032 excluía las operaciones de pedido comprobando UNA sola ruta,
-- `/rpc/admin_update_order_status`, y daba por hecho que la venta nunca llega
-- con actor porque el checkout usa el cliente anónimo. Eso es cierto HOY, y es
-- una garantía de la APLICACIÓN —qué cliente elige `lib/checkout/create-order`—
-- para algo que la migración presentaba como garantía de la base de datos.
--
-- Medido: `create_order` con el token de un admin devuelve 200 y deja
--
--     field_name=stock  old=10  new=8  source=rpc
--
-- que la ficha pinta como «Stock corregido: 10 → 8». Una venta disfrazada de
-- decisión de una persona. `create_order` tiene `grant execute` a
-- `authenticated` desde la 0018, así que basta con estar dentro del panel y
-- comprar en la misma sesión.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Y CON UN USUARIO SIN PERFIL, LA AUDITORÍA ROMPÍA LA COMPRA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Peor que registrar de más: `actor_id` referencia `profiles`, y un usuario
-- autenticado que no es admin NO tiene fila ahí. Medido:
--
--     409 · 23503 · Key (actor_id)=(505b0e18…) is not present in table "profiles"
--
-- El INSERT de auditoría revienta, la transacción entera se deshace y **el
-- pedido no se crea**: el stock se quedó en 10. Es decir, la auditoría podía
-- DENEGAR UNA VENTA. Hoy no es alcanzable por la tienda (el checkout va con la
-- anon key), pero sí por un POST directo de cualquier autenticado, y dejaría
-- de ser teórico el día que existan cuentas de cliente.
--
-- La causa de fondo es la puerta: `if v_actor is null then return null`. "Hay
-- alguien" no es lo mismo que "hay un administrador", y esta tabla solo
-- registra decisiones de administradores. La puerta correcta es `is_admin()`,
-- que además hace la clave ajena INALCANZABLE por construcción: si escribe, el
-- actor tiene perfil.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. EL LOG SOBREVIVÍA AL AISLAMIENTO DE MERCADO DE DEC-035
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `admin_change_log` era la única tabla legible por el admin cuya policy decía
-- solo `is_admin()`. Todas las demás —incluidas `product_variants` y
-- `product_images`, que tampoco tienen `market_id` propio— derivan el mercado
-- del producto con un `exists` (migración 0020).
--
-- Medido: con un producto de CO y CO desactivado, el admin recibe `[]` al pedir
-- el producto y SIN EMBARGO lee su historial completo —sku, precio anterior y
-- precio nuevo—. El catálogo de un mercado apagado seguía contando lo que se
-- cobraba en él.
--
-- La defensa fuerte no es guardar `market_id` en el log (dos copias que pueden
-- divergir): es la relación que ya existe. Misma forma que la 0020.

-- ═══════════════════════════════════════════════════════════════════════════
-- LA POLICY: EL MERCADO SE DERIVA DEL PRODUCTO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sigue sin haber policy de INSERT, UPDATE ni DELETE: append-only por ausencia
-- de policy, y el REVOKE de la 0032 como segunda barrera. Solo cambia el SELECT.

drop policy if exists "admin_read_admin_change_log" on public.admin_change_log;

create policy "admin_read_admin_change_log" on public.admin_change_log
  for select to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.products p
      where p.id = admin_change_log.product_id
        and public.is_active_market(p.market_id)
    )
  );

comment on table public.admin_change_log is
  'Fase 9.5 (5C, DEC-055). Decisiones administrativas sobre status, deleted_at, price y stock. Escrita SOLO por el trigger log_admin_change (SECURITY DEFINER); no hay policy de INSERT para que un admin no pueda fabricar registros. NO es un libro mayor de stock: las ventas y las cancelaciones no entran porque order_events ya las cubre. La lectura hereda el mercado del producto (0033, DEC-035).';

-- ═══════════════════════════════════════════════════════════════════════════
-- EL TRIGGER: PUERTA DE ADMIN Y LAS DOS OPERACIONES DE PEDIDO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Solo tres funciones SQL escriben en `product_variants` en todo el esquema, y
-- se comprobó una a una:
--
--   `create_order`               (0018) → VENTA        · no se audita
--   `admin_update_order_status`  (0019) → CANCELACIÓN  · no se audita
--   `admin_restock_variants`     (0026) → REPOSICIÓN   · sí, y así se etiqueta
--
-- Todo lo demás llega como PATCH del panel, que es una corrección absoluta.
--
-- POR QUÉ `request.path` SIRVE PARA DECIDIRLO. No es un dato del cliente: es la
-- ruta que PostgREST ya usó para ELEGIR qué se ejecuta. Nadie puede pedir un
-- PATCH sobre `/product_variants` haciendo que la ruta diga `/rpc/create_order`,
-- porque entonces se habría ejecutado `create_order`. Y si el ajuste no existe
-- —una sesión SQL directa—, esa sesión tampoco tiene `auth.uid()`, así que la
-- puerta de admin ya la ha descartado antes de mirar la ruta.
--
-- FALLA HACIA EL LADO SEGURO: una función nueva que mueva stock y que nadie
-- añada a esta lista se registra como 'rpc' —ruido visible— en vez de perderse.

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
begin
  -- 1. SOLO UN ADMINISTRADOR DECIDE.
  --    Cubre de una vez al anónimo del checkout, a la service role key (su JWT
  --    no lleva `sub`) y al autenticado sin perfil, que antes hacía saltar la
  --    clave ajena de `actor_id` y tumbaba la transacción que le daba origen.
  if not public.is_admin() then
    return null;
  end if;

  -- 2. LO QUE YA CUBRE `order_events` NO SE DUPLICA.
  --    Ambas mueven stock por causa de un pedido, no por una decisión sobre el
  --    catálogo, y las dos dejan su rastro en el expediente del pedido con
  --    actor, fecha y unidades. El detalle por variante sale de `order_items`.
  if v_path like '%/rpc/create_order'
     or v_path like '%/rpc/admin_update_order_status' then
    return null;
  end if;

  -- 3. ORIGEN, desde el propio request y no desde una marca que alguien tenga
  --    que acordarse de poner.
  v_source := case
    when v_path like '%/rpc/admin_restock_variants' then 'reposicion'
    when v_path like '%/rpc/admin_create_variant_matrix' then 'matriz'
    when v_path like '%/rpc/%' then 'rpc'
    else 'directo'
  end;

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

  -- product_variants. `new.product_id` YA es el producto: la 0032 hacía un
  -- SELECT contra `products` para averiguar lo que tenía delante, una consulta
  -- por fila modificada y por nada.
  if new.price is distinct from old.price then
    insert into public.admin_change_log
      (product_id, variant_id, sku, field_name, old_value, new_value, source, actor_id)
    values (
      new.product_id, new.id, new.sku, 'price',
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
      new.product_id, new.id, new.sku, 'stock',
      old.stock::text, new.stock::text,
      case when v_source = 'directo' then 'correccion' else v_source end,
      v_actor
    );
  end if;

  return null;
end;
$$;

comment on function public.log_admin_change() is
  'Fase 9.5 (5C, corregida en 0033). SECURITY DEFINER para poder escribir en admin_change_log, que no tiene policy de INSERT. Solo AFTER UPDATE: crear algo no es cambiarlo. Escribe unicamente si el actor es ADMIN (is_admin()), lo que ademas hace inalcanzable la FK de actor_id, y descarta create_order y admin_update_order_status porque order_events ya los cubre.';
