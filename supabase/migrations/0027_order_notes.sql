-- Fase 9.5 — Incremento 5A: notas internas del pedido.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Todo lo que se acuerda con el cliente por WhatsApp —la dirección de entrega,
-- el horario, "me lo llevo cuando vuelva de viaje"— vive únicamente en esa
-- conversación. El pedido no lo sabe. Auditado antes de escribir esto:
--
--   · `create_order` (0018) captura EXACTAMENTE teléfono y nombre. Su firma no
--     tiene ningún parámetro de dirección, y el formulario público solo valida
--     esos dos campos (`lib/checkout/validation.ts`).
--   · `orders.shipping_address jsonb` existe desde la 0011 y NADIE la escribe:
--     cero referencias en todo el repositorio fuera de la propia migración.
--   · `orders.notes` y `customers.notes` son `text` libre SIN autor ni fecha.
--     Usarlas repetiría el problema que esta tabla viene a resolver.
--
-- Rellenar `shipping_address` exigiría decidir qué dirección pedir, con qué
-- formato y con qué comportamiento por mercado — una decisión de negocio, no
-- técnica. Se consultó y se resolvió que la dirección va en una nota interna:
-- texto libre que el administrador pega tal y como el cliente se lo mandó,
-- válido igual para ES y para CO, sin tocar el checkout. `shipping_address`
-- queda como columna sin usar y documentada como tal (DEC-049).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ UNA TABLA PROPIA Y NO `order_events`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `order_events` es el historial de AUDITORÍA de las transiciones de estado, y
-- tiene que seguir siendo fiable. Su policy de INSERT (0011) es literalmente:
--
--     with check (public.is_admin())
--
-- y nada más: no restringe `from_status` ni `to_status`. Es decir, un admin con
-- su sesión puede fabricar por POST directo un evento de transición que nunca
-- ocurrió. Hoy eso no importa porque el único camino que inserta ahí es
-- `admin_update_order_status` (0019). Abrir un segundo camino de escritura
-- desde una Server Action de notas convertiría ese agujero en una puerta.
--
-- Las notas van, por tanto, a su propia tabla. Un evento es un HECHO de la
-- máquina de estados; una nota es lo que una persona escribió. No se mezclan
-- en la base; se mezclan al PINTARLAS, que es donde debe ocurrir.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE UNA NOTA NUNCA HACE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No cambia el estado del pedido, no toca stock, no viaja al checkout, no
-- aparece en el mensaje de WhatsApp al cliente y no es legible por `anon`.
-- Nada de eso se garantiza "porque el código no lo hace": esta tabla no tiene
-- ninguna relación con `product_variants` ni con `orders.status`, y su única
-- policy de lectura exige `is_admin()`.
-- ───────────────────────────────────────────────────────────────────────────

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,

  -- Texto libre: es donde acaba la dirección, el horario acordado y el motivo
  -- de una cancelación. Acotado para que un POST directo no pueda usar la
  -- tabla como almacén: 1-2000 caracteres ya recortados.
  body text not null check (length(btrim(body)) between 1 and 2000),

  -- QUIÉN la escribió, y no es un dato del formulario: el DEFAULT lo pone
  -- PostgreSQL desde la sesión, y la policy de INSERT exige además que
  -- coincida con `auth.uid()`. Un admin no puede firmar una nota como otro
  -- administrador ni siquiera por POST directo a PostgREST.
  actor_id uuid not null default auth.uid() references public.profiles (id),

  created_at timestamptz not null default now()
);

-- El único acceso es "las notas de este pedido, en orden". El índice compuesto
-- sirve al filtro y al orden de una vez, así que el plan no necesita ordenar
-- después. Sin `updated_at`: la tabla es append-only y no hay nada que sellar.
create index idx_order_notes_order_created
  on public.order_notes (order_id, created_at);

alter table public.order_notes enable row level security;

-- APPEND-ONLY, copiando literalmente el patrón que `order_events` ya usa en la
-- migración 0011: solo SELECT + INSERT como policies, y REVOKE explícito de
-- UPDATE y DELETE como segunda barrera. Una nota es constancia de lo que se
-- dijo; poder reescribirla la haría inútil como constancia.
--
-- Sin policy para `anon`: la tabla es invisible fuera de una sesión de admin.
create policy "admin_read_order_notes" on public.order_notes
  for select to authenticated
  using (public.is_admin());

-- La diferencia con `admin_insert_order_events`: aquí el WITH CHECK sí ata el
-- contenido a quien lo escribe. `actor_id = auth.uid()` no es decorativo —
-- es lo que hace que la firma de la nota valga algo.
create policy "admin_insert_order_notes" on public.order_notes
  for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());

revoke update, delete on public.order_notes from authenticated, anon;

comment on table public.order_notes is
  'Fase 9.5 (5A, DEC-049). Notas internas del pedido: append-only, firmadas por auth.uid() via DEFAULT + WITH CHECK. Separada de order_events a proposito para no abrir un segundo camino de escritura al historial de transiciones. Nunca visible para anon ni para el cliente.';
