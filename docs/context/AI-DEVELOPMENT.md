# AI-DEVELOPMENT — Cómo trabajan los agentes sobre este repositorio

> Este documento define el protocolo para Claude Code, Cline u otros agentes. El objetivo: que ningún agente dependa de recordar conversaciones anteriores; todo contexto necesario vive en el repositorio.

---

## 1. Jerarquía de memoria del proyecto

```
CLAUDE.md                      → instrucciones globales + mapa de contexto (SIEMPRE se carga)
AGENTS.md                      → aviso de versión Next.js gestionado por sus herramientas
   ↓
CURRENT-STATE.md               → ¿dónde estamos? (fase, qué existe)
DECISIONS.md                   → ¿qué decidimos y por qué?
PROJECT-CONTEXT.md             → ¿qué es YI? identidad y visión
DOMAIN-MODEL.md                → ¿qué significa cada cosa? reglas de negocio
DEVELOPMENT-WORKFLOW.md        → ¿cómo se trabaja? workflow obligatorio
KNOWN-CONSTRAINTS.md           → ¿qué NO se puede hacer?
CHANGELOG.md                   → historial de cambios relevantes
   ↓
DOCUMENTOS ESPECÍFICOS (/docs) → conocimiento profundo por área
REGLAS POR ÁREA (/docs/rules)  → convenciones obligatorias al codificar
   ↓
CÓDIGO                         → implementación real (fuente de verdad del comportamiento)
```

---

## 2. Protocolo antes / durante / después

### ANTES DE CODIFICAR

1. Leer `CLAUDE.md`.
2. Leer `docs/context/CURRENT-STATE.md`.
3. Identificar el área afectada.
4. Leer la documentación correspondiente (`/docs/XX-*.md`) y las reglas del área (`/docs/rules/<area>.md`).
5. Revisar `docs/context/DECISIONS.md` (¿hay decisión aplicable o Proposed pendiente?).
6. Inspeccionar el código existente relacionado.
7. Formular plan breve y confirmarlo si la tarea es grande o irreversible.

### DURANTE

- Cambios pequeños e incrementales; commits enfocados.
- Respetar patrones existentes (buscar antes de crear).
- Evitar duplicación: reutilizar componentes de `components/ui/` y queries de `lib/data/`.
- Validar tipos en cada paso (TypeScript strict).
- Validar seguridad: ninguna consulta sin RLS, ningún secreto en cliente.

### DESPUÉS

- `npm run lint`
- `npx tsc --noEmit`
- Tests correspondientes (cuando existan).
- Revisar el diff completo: solo cambios necesarios.
- Actualizar documentación afectada + `CURRENT-STATE.md` (+ `DECISIONS.md` si hubo decisión).

---

## 3. Regla de parada ante decisiones no documentadas

> **Si la tarea requiere una decisión arquitectónica o de producto que no está documentada en DECISIONS.md, el agente debe detenerse antes de implementar una solución irreversible y proponer opciones con recomendación.**

Irreversible = migraciones destructivas, cambios de modelo de datos, elección de dependencias clave, cambios de estrategia comercial/UX global.

---

## 4. Sobre AGENTS.md y CLAUDE.md (importante)

### AGENTS.md

Contiene un bloque entre los marcadores:

```
<!-- BEGIN:nextjs-agent-rules -->
...
<!-- END:nextjs-agent-rules -->
```

**Origen verificado:** este bloque lo gestiona automáticamente el tooling de Next.js 16 (verificado en `node_modules/next/dist/server/lib/generate-agent-files.js`). Cuando `next dev` detecta un agente de IA y el bloque falta o difiere del actual, lo inserta/repara. Su función es forzar la lectura de la documentación versionada de Next.js incluida en `node_modules/next/dist/docs/`.

**Reglas:**
- ❌ NUNCA editar ni eliminar el contenido ENTRE los marcadores.
- ✅ SÍ se puede añadir contenido propio a AGENTS.md FUERA de los marcadores (la herramienta lo preserva).
- Si aparece como cambio no commiteado tras ejecutar `next dev`, es comportamiento normal: commítalo junto a tu trabajo.

### CLAUDE.md

Es el punto de entrada de Claude Code. Debe permanecer **breve**: índice + contrato. El detalle vive en `/docs`. Si CLAUDE.md empieza a crecer, mover contenido a documentos especializados y dejar referencia.

---

## 5. Convenciones específicas de Next.js 16 (resumen operativo)

| Situación | Correcto | Incorrecto |
|---|---|---|
| Params en página | `const { slug } = await props.params` con `PageProps<'/producto/[slug]'>` | `params.slug` síncrono |
| searchParams | `await props.searchParams` | acceso síncrono |
| Cookies/sesión | `(await cookies()).get(...)` | `cookies().get(...)` |
| Protección rutas admin | `proxy.ts` (check optimista) + verificación real con `getUser()` en layout server | solo ocultar links |
| Imágenes remotas | `images.remotePatterns` en next.config.ts | `images.domains` |
| Invalidación caché admin | `revalidateTag('products', 'max')` / `updateTag(...)` en Server Actions | `revalidateTag(tag)` a un argumento |
| Lint | `npm run lint` (ESLint CLI) | `next lint` |

Ante cualquier duda de API: consultar primero `node_modules/next/dist/docs/` (documentación versionada), nunca tutoriales antiguos.

---

## 6. Qué hacer al iniciar una sesión nueva

1. Leer `CLAUDE.md` (se carga automáticamente en Claude Code).
2. Leer `docs/context/CURRENT-STATE.md` → saber fase y estado real.
3. Leer `docs/context/DECISIONS.md` → conocer decisiones vigentes y abiertas.
4. Solo entonces, abordar la tarea siguiendo el workflow.

**Nunca asumas que recuerdas conversaciones anteriores. Consulta el repositorio.**

---

## 7. Principio de verdad (desde Fase 1)

> **CODE IS THE SOURCE OF TRUTH FOR IMPLEMENTED BEHAVIOR. DOCUMENTATION IS THE SOURCE OF TRUTH FOR INTENDED ARCHITECTURE.**

`CURRENT-STATE.md` distingue explícitamente **IMPLEMENTADO** (existe y compila/funciona) · **PREPARADO** (código listo, sin datos/uso real aún — p. ej. clientes Supabase sin proyecto conectado) · **PENDIENTE** (documentado, no iniciado) · **NO IMPLEMENTADO** (fuera de alcance deliberado). Ante duda sobre si algo "existe", confiar en el código y en esta distinción, no en que un doc lo describa.

CI (`.github/workflows/ci.yml`, desde Fase 1) ejecuta `npm run lint`, `npx tsc --noEmit` y `npm run build` en cada push/PR a `main` — no sustituye la verificación local del protocolo "DESPUÉS" (§2), la complementa. **No valida el esquema de base de datos** (`supabase/migrations/`, `supabase/seed/`): eso requiere Docker o un proyecto Supabase real, ninguno disponible en CI todavía.

## 8. Sobre herramientas no disponibles en el entorno del agente (desde Fase 3)

Este repositorio se ha trabajado en un entorno **sin Docker/Podman ni proyecto Supabase real provisionado**. Cuando una tarea requiera validar algo que depende de esas herramientas (`supabase start`, `db reset`, `db lint`, `db:types`, cualquier aplicación real de migraciones):

1. Intentar la herramienta igualmente — puede que el entorno del agente sí la tenga disponible.
2. Si falla por herramienta ausente: **no inventar un resultado de validación.** Documentar la limitación explícitamente (dónde y por qué) en `CURRENT-STATE.md`, no silenciarla ni asumir que "probablemente funciona".
3. El código (SQL, config) se entrega igualmente, revisado manualmente, dejando claro que su corrección definitiva depende de una validación real pendiente.

Ver precedente: `docs/context/CURRENT-STATE.md` §"Limitación conocida" (Fase 3, Fase 4).

**Actualización (Fase 4.5): Docker ya no es imprescindible.** Existe un proyecto Supabase real y el flujo remoto del CLI está validado (`supabase link` + `db push` + `db query --linked` + `gen types --linked`), sin contenedores ni contraseña de BD. Antes de declarar que "no se puede validar contra Postgres real", prueba ese camino. Lo único que sigue sin poder probarse aquí es el **stack local** (`supabase start`/`db reset`).

## 8.1. Cómo validar contra la instancia real sin fingir resultados (desde Fase 4.5)

Lecciones concretas de la Fase 4.5, aplicables a cualquier validación futura:

- **Comprobar la seguridad ejecutándola, no leyendo el SQL.** Las dos debilidades reales (DEC-022, DEC-023) no se veían leyendo las migraciones: aparecieron al consultar con la anon key y al inspeccionar `information_schema.role_table_grants`. Para probar el rol admin, crea un usuario temporal vía Auth Admin API, concédele `profiles.role='admin'` con la service role, prueba, y **elimínalo al terminar** (verificando después que no quedó nada).
- **Usa fixtures adversariales, no solo el camino feliz.** Un producto `draft`, uno con `deleted_at`, uno `archived`, uno de otro mercado y una variante inactiva más barata que la activa revelan más que cualquier consulta correcta. Bórralos al acabar y comprueba los recuentos.
- **Cuidado con los falsos verdes del propio arnés de pruebas.** Un `PATCH` con cuerpo vacío devolvía 204 y parecía "denegado" cuando en realidad no probaba nada; PostgREST exige `apikey` = anon key con el JWT del usuario en `Authorization`, no el JWT en ambos. Si un test de seguridad pasa, confirma que también sabe fallar (control negativo).
- **Confirma que un puerto ocupado es tuyo.** Un `curl` con 200 puede venir del `next dev` que ya tenía el usuario, no de tu build. Comprueba qué proceso escucha antes de dar por buena la respuesta, y no mates procesos del usuario.
- **Verifica los tipos generados con aserciones de tipo**, no a ojo: comprobar que nada degrada a `any`, que un embed nullable se infiere nullable y que **una columna inexistente rompe la compilación** (control negativo) es lo que demuestra que los tipos están realmente conectados.
- **Distingue "no verificado" de "verificado y correcto".** Si falta una herramienta (aquí, navegador automatizado para confirmar el render del 404), dilo en el reporte y en `CURRENT-STATE.md` en vez de deducir el resultado.

## 8.2. Tests ejecutables sin dependencias nuevas (desde Fase 5)

`npm test` existe y usa el runner nativo de Node (`node --test --experimental-strip-types`), sin Vitest ni ninguna dependencia añadida (DEC-025). Consecuencias prácticas al escribir lógica en `lib/`:

- Los tests viven en `lib/<modulo>/__tests__/*.test.ts` y **importan con extensión explícita** (`../reducer.ts`): el runner resuelve ESM real, sin bundler ni alias `@/`.
- Un módulo solo es testeable así si sus imports en runtime no necesitan resolverse. La técnica: que los módulos de lógica pura se importen entre sí con `import type` (esos imports se borran al ejecutar) y definan sus constantes en su propio archivo. `lib/cart/reducer.ts` es el ejemplo a copiar.
- Corolario de diseño: si necesitas validar datos que vienen del navegador (localStorage, query params), pon la validación en la **lógica pura** y deja el módulo de I/O como una cáscara fina. En el carrito, `HYDRATE` sanea y `storage.ts` solo parsea — así hay una sola autoridad y ambas piezas se prueban por separado.
- La regla de `docs/rules/testing.md` sigue vigente y ahora es ejecutable: **la lógica crítica se testea en la fase que la introduce**, no en Fase 9.

## 8.3. Validar UI sin navegador (desde Fase 5)

No hay navegador automatizado en este entorno. Lo que sí funciona, en orden de valor:

1. **Simular el flujo con la lógica real.** Un test que encadena reducer + persistencia y crea una "sesión nueva" sobre el mismo storage reproduce el "recargar la página" sin DOM. Cubre casi todo lo que un E2E comprobaría del estado.
2. **Servir el build y comprobar el HTML** (`npx next start -p <puerto libre>` + `fetch`). Detecta lo que el servidor emite de verdad: qué se renderiza en SSR, si un CTA sigue `disabled`, si existen los `aria-label`, si aparece un `0` que no debería.
3. **Tests estructurales.** Un test que recorre los archivos de un módulo y falla si aparece un import prohibido protege una decisión arquitectónica (DEC-007) mejor que un comentario.

Lo que **no** se puede afirmar sin navegador: que un clic produce el efecto esperado, que el badge se repinta o que no hay hydration mismatch visible. Decláralo como no verificado.

## 9. `npm run build` ya no es un gate libre de contexto (desde Fase 4)

Home y `/producto/[slug]` hacen fetch real a Supabase en build-time (`generateStaticParams`, SSG+ISR — DEC-021). Esto significa:

- `npm run build` **requiere** `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` apuntando a un proyecto real y alcanzable con las migraciones/seed de `supabase/` aplicadas. Sin eso, el build falla — es el comportamiento correcto, no un bug a "arreglar" cambiando la estrategia de renderizado.
- Antes de reportar `npm run build` como passing, verificar que esas credenciales existen y son reales. Si no las hay, ejecutar igualmente `npm run lint` + `npx tsc --noEmit` (sí son libres de contexto) y documentar honestamente que el build no se pudo validar — nunca reportar un build en verde sin haberlo ejecutado de verdad.
- Un error de build que mencione `cookies()`, `fetch failed` o `supabaseUrl is required` casi siempre es esta limitación de entorno, no un defecto de código — pero verificarlo intentando avanzar (como se hizo en Fase 4: primero se encontró y corrigió un bug real de `cookies()` en `generateStaticParams`, y solo después de corregirlo se confirmó que lo único que faltaba era la red) en vez de asumirlo a la primera.
- **Desde Fase 4.5 el build SÍ pasa** con `.env.local` real. Si vuelve a fallar, es un defecto de verdad: investígalo, no lo atribuyas al entorno.
- `npm run build` verde tampoco basta: valida el resultado sirviéndolo (`npx next start -p <puerto libre>`) y comprobando el HTML real. Bugs como los precios redondeados a «90 €», la sección de destacados vacía o el 404 en blanco pasaban `lint`, `tsc` y `build` sin una sola queja.

## 10. Cómo funciona el checkout (desde Fase 6) — LEER ANTES DE TOCARLO

El checkout mueve dinero y stock. Esta sección existe para que un agente futuro
no rompa el modelo de confianza sin darse cuenta.

### El contrato de confianza, en una frase

**El cliente solo puede decir QUÉ variante y CUÁNTAS unidades quiere, más sus
datos de contacto. Todo lo demás lo resuelve PostgreSQL.**

| Dato | Origen | ¿Confiable? |
|---|---|---|
| `variantId`, `quantity` | cliente | Solo como *intención*. Se valida contra BD |
| Nombre, teléfono | cliente | Se normalizan y validan; son datos suyos |
| `clientRequestId` | cliente | Solo como clave de idempotencia |
| **Precio, stock, nombre de producto, color, talla, SKU, subtotal, total** | **PostgreSQL** | **Sí — única autoridad** |
| `unitPrice`/`stockSnapshot` del carrito | localStorage | **NO.** Solo pintan la UI |

El precio no se puede falsificar porque **`create_order` no lo recibe**. No hay
parámetro por el que entre: inyectar `p_total` hace que PostgREST devuelva 404.

### Dónde ocurre cada cosa

| Qué | Dónde |
|---|---|
| Validación de forma (rápida, para la UI) | `lib/checkout/validation.ts` (pura) |
| **Validación real y precio** | `supabase/migrations/0018` → `public.create_order()` |
| Descuento de stock atómico | Dentro de `create_order`, `update ... where stock >= qty` |
| Creación de pedido, líneas y evento | Dentro de `create_order` (una transacción) |
| Idempotencia | `orders.client_request_id` (UNIQUE) + fingerprint md5 |
| Elección del canal | `lib/checkout/channel.ts` → `getCheckoutChannel()` |
| Mensaje de WhatsApp | `lib/whatsapp/message.ts` (pura) |
| Enlace `wa.me` | `lib/whatsapp/phone.ts` (**único sitio**) |
| Número de WhatsApp | `settings.whatsapp_number` vía `lib/data/settings.ts` |
| Punto de entrada de la UI | `app/(store)/checkout/actions.ts` (Server Action) |

### Lo que un agente futuro NO debe hacer

1. **No aceptar precio, total ni stock del cliente.** Si alguna vez hace falta
   un importe nuevo (envío, impuestos), se calcula en `create_order`, no en TS.
2. **No crear pedidos con `service_role`** (DEC-026). Si algo "solo funciona"
   con service role, la respuesta correcta es arreglar la función SQL.
3. **No añadir policies públicas de INSERT** a `orders`, `order_items`,
   `order_events` ni `customers`. Siguen siendo privadas a propósito.
4. **No exponer un endpoint que devuelva un pedido por su número.** Los
   `order_number` son correlativos y adivinables (DEC-027); por eso
   `/pedido/[numero]` lee `sessionStorage` y no la BD.
5. **No marcar un pedido como `paid` automáticamente.** WhatsApp significa
   "pedido iniciado", nunca "pagado" (`KNOWN-CONSTRAINTS.md`).
6. **No importar `WhatsAppChannel` desde un componente.** La UI usa
   `getCheckoutChannel()` (regla 13 de `rules/backend.md`).
7. **No hacer que `lib/cart/` conozca el checkout.** Hay un test estructural que
   falla si aparece ese import.
8. **No recalcular totales en JavaScript.** `numeric(12,2)` de PostgreSQL es
   exacto; en JS `89.9*2 + 34.9*2` da `249.60000000000002`. Mostrar siempre el
   total que devuelve el servidor.

### Qué se sustituye cuando llegue el pago online (Fase 11)

`OnlinePaymentChannel` implementa la misma interfaz `CheckoutChannel` y
`getCheckoutChannel()` decide cuál devolver. **Se reutiliza tal cual:**
`create_order`, el modelo de pedido, el carrito, la validación y toda la UI.
**Cambia solo:** qué `redirectUrl` se devuelve (pasarela en vez de `wa.me`) y
un webhook firmado que marque `paid` — que seguirá siendo el único camino
legítimo a ese estado.

### Errores: nunca se filtra el detalle técnico

`create_order` señala los fallos con `RAISE EXCEPTION 'CODIGO'`; `mapPostgresError`
los traduce a `CheckoutErrorCode` y `checkoutErrorMessage` a copy para el
usuario. Un código desconocido degrada a `SERVER_ERROR`: preferimos un mensaje
genérico antes que enseñar un error de Supabase.


## 11. Cómo se protege el panel admin (desde Fase 7) — LEER ANTES DE TOCARLO

Igual que §10 protege el checkout, esta sección protege el acceso. La trampa
aquí es sutil: todo "parece" seguro porque hay un `proxy.ts`.

### La frase que hay que retener

**Proxy = mantener la sesión viva. Layout = comprobar quién eres. Server Action
= comprobar qué puedes hacer. RLS = impedirlo aunque todo lo anterior falle.**

| Capa | Archivo | Qué hace | ¿Es autoridad? |
|---|---|---|---|
| 1 | `proxy.ts` + `lib/supabase/proxy.ts` | Refresca el token y persiste las cookies; redirige al login si no hay sesión | **NO** |
| 2 | `app/admin/(panel)/layout.tsx` | `getUser()` + `is_admin()` | Sí |
| 3 | `requireAdmin()` en cada Server Action | Re-verifica antes de mutar | Sí |
| 4 | RLS en PostgreSQL | Filtra fila a fila | **Definitiva** |

### Por qué `proxy.ts` existe (no es por seguridad)

Un Server Component **no puede escribir cookies**. Si el access token caduca, el
refresh que hace `@supabase/ssr` dentro del layout se pierde y el admin acaba
expulsado. El proxy es el único punto del request donde esa cookie renovada
puede persistirse. Que además redirija es cortesía de UX.

Corolario: **borrar `proxy.ts` no debe dar acceso a nada.** Si algún día un
cambio hace que sí lo dé, el bug está en las capas 2–4, no en el proxy.

### Lo que un agente futuro NO debe hacer

1. **No meter `is_admin()` en `proxy.ts`.** Convertiría una capa de UX en una
   falsa barrera de seguridad y tentaría a relajar las capas reales.
2. **No omitir `requireAdmin()` en una Server Action** "porque el layout ya
   protege". Los docs de Next 16 son explícitos: una Server Function es un POST
   a la ruta donde se usa, y un cambio de `matcher` o mover la action de archivo
   puede sacarla del proxy **sin que nada falle a la vista**.
3. **No usar `getSession()` para decidir nada.** Solo decodifica la cookie.
   `getUser()` valida contra Supabase (`rules/security.md` #3).
4. **No mover el guard a `app/admin/layout.tsx`.** Envolvería `/admin/login` y
   el guard se redirigiría a sí mismo en bucle. Por eso existen los route groups
   `(auth)` y `(panel)` — no cambian ninguna URL.
5. **No redirigir al login a un usuario con sesión pero sin rol.** Ping-pong
   infinito. Se le muestra "Acceso denegado" con logout.
6. **No quitar `httpOnly` de `lib/supabase/cookies.ts`** para que un componente
   cliente pueda leer la sesión. La respuesta correcta es mover esa lectura al
   servidor. (`@supabase/ssr` trae `httpOnly: false` por defecto; lo forzamos
   nosotros — DEC-031.)
7. **No usar `?next=` sin `safeAdminRedirect()`.** Sería un open redirect.
8. **No crear ningún camino que otorgue `role='admin'`.** El alta es manual y
   fuera de banda (DEC-020). No hay signup, y el login cierra la sesión de una
   cuenta sin rol en vez de dejarla abierta.

### Cómo se verificó (no se dedujo)

Sirviendo el build de producción y hablando con el Supabase real: anónimo
redirigido; login accesible; `?next=` preservado; usuario autenticado sin rol
atraviesa el proxy pero recibe "Acceso denegado", lee **0 filas** de
`orders`/`order_items`/`order_events`/`customers`/`order_counters` y no puede
auto-insertarse en `profiles`; admin entra; **token marcado como caducado →
la respuesta trae `Set-Cookie` con un `access_token` distinto y la siguiente
request mantiene la sesión**; la tienda pública no recibe ni una `Set-Cookie`.

## 12. Cómo funciona el panel de pedidos (desde Fase 7) — LEER ANTES DE TOCARLO

Complemento de §10 (checkout) y §11 (acceso). Aquí se mueve stock y se cierra
el ciclo de venta.

### El contrato, en una frase

**El admin solo puede proponer un `order_id`, un estado destino y una nota.
Qué transición es legal, si hay que devolver stock y cuánto, lo decide
PostgreSQL leyendo el pedido real con la fila bloqueada.**

| Qué | Dónde |
|---|---|
| **Máquina de estados AUTORITATIVA** | `supabase/migrations/0019` → `admin_update_order_status` |
| Espejo para pintar botones | `lib/admin/orders.ts` (**no protege nada**) |
| Guard de la mutación | `requireAdmin()` en `app/admin/(panel)/pedidos/actions.ts` |
| Lectura de pedidos | `lib/data/admin/orders.ts` (sesión del admin, RLS activa) |
| Devolución de stock | Dentro de `admin_update_order_status`, misma transacción |
| Identidad del admin | `lib/admin/auth.ts` → `getAdminAccess()` / `requireAdmin()` |

### Lo que un agente futuro NO debe hacer

1. **No cambiar las transiciones solo en `lib/admin/orders.ts`.** La autoridad es
   el `case` de la migración 0019. Hay un test que compara ambas tablas y falla
   si divergen — está ahí justamente para impedir ese error.
2. **No hacer el cambio de estado desde TypeScript con varias llamadas.** Estado,
   evento y stock tienen que ir en la misma transacción (DEC-032).
3. **No pasar `admin_update_order_status` a `SECURITY DEFINER`.** Es `INVOKER` a
   propósito: así RLS sigue aplicándose dentro de la función. `create_order` es
   `DEFINER` porque su llamante es anónimo; este no lo es.
4. **No devolver stock fuera de la cancelación**, ni "por si acaso" al abrir o
   editar un pedido. Se descuenta al crear y se devuelve al cancelar, punto.
5. **No quitar `p_payment_confirmed`.** Es lo que impide que `paid` se ponga de
   pasada desde una llamada directa a la RPC.
6. **No reconstruir un pedido histórico desde el catálogo actual.** El detalle
   se pinta con los snapshots de `order_items`. Sigue sin guardarse la imagen
   (deuda conocida de Fase 6).
7. **No omitir `requireAdmin()` en las funciones de `lib/data/admin/`** — ver el
   punto siguiente, que es la razón por la que están ahí.

### Hallazgo de Fase 7 que hay que recordar: el layout NO frena a la página

**En RSC el layout y la página se renderizan en paralelo.** Que
`app/admin/(panel)/layout.tsx` devuelva "Acceso denegado" sin pintar sus
`children` **no impide que la página hermana se haya renderizado**, y su payload
viaja igualmente en el HTML. Se comprobó sirviendo el build: el HTML que recibía
un usuario autenticado sin rol contenía el árbol de la página de pedidos. No
filtraba ni un dato porque RLS devolvía 0 filas — pero eso es una sola barrera.

Por eso **cada función de `lib/data/admin/` empieza por `requireAdmin()`** y
devuelve vacío si falla (DEC-034). Si añades una pantalla de admin nueva, su
función de datos lleva ese guard: no basta con que esté bajo el layout.

### Otro hallazgo: `loading.tsx` rompe el 404 del detalle

Un `loading.tsx` en `(panel)/` cubre también las rutas hijas y hace que Next
envíe el shell —con su código **200**— antes de que la página se resuelva. Con
él, `/admin/pedidos/YI-ES-999999` devolvía 200 pese a llamar a `notFound()`; sin
él, devuelve 404. Por eso el panel usa `<Suspense>` + `AdminSkeleton` dentro de
cada página que quiere skeleton, y **no** hay `loading.tsx` en `(panel)/`.

### Sobre los tests: la suite corre en serie

`npm test` lleva `--test-concurrency=1` desde Fase 7. Los archivos de
integración hablan con **la misma** instancia real de Supabase y hacen `DELETE`
globales en su limpieza; en paralelo se pisaban entre sí y producían fallos
fantasma (un cliente duplicado, un stock leído a mitad de otra compra). Si
añades otra suite de integración, mantén la serialización y limpia lo que crees.

### Cómo se verificó (no se dedujo)

Sirviendo el build de producción contra el Supabase real: **78 comprobaciones**
end-to-end del panel (listado, filtros, búsqueda, paginación, detalle con
snapshots, ciclo completo `pending→delivered`, cancelación con devolución de
stock, 404, no-admin, anónimo, catálogo, ajustes, tienda pública intacta),
**39 de auditoría RLS** con controles positivos de admin, **38** de sesión y
refresh, y **28 tests de integración** de la máquina de estados (incluidas 10
cancelaciones simultáneas). La base quedó en el baseline del seed.

**Lo único que sigue sin verificarse: nada de esto se ha visto en un navegador
real.** No hay navegador automatizado en este entorno (limitación heredada desde
Fase 4.5). Los clics, el repintado y posibles *hydration mismatch* no están
comprobados.

## 13. Cómo funciona el CMS de catálogo (desde Fase 8) — LEER ANTES DE TOCARLO

Complemento de §10 (checkout), §11 (acceso) y §12 (pedidos). Aquí se crea el
contenido que vende la tienda y se suben archivos.

### Lo que hay que retener

| Qué | Dónde | Autoridad |
|---|---|---|
| Validación de forma del producto | `lib/admin/products.ts` (pura) | No |
| Slug | `lib/admin/slug.ts` (puro) | La unicidad la impone `unique(market_id, slug)` |
| Combinaciones color × talla | `lib/admin/variants.ts` (puro) | **La RPC `admin_create_variant_matrix` (0021)** |
| Formato real de una imagen | `lib/admin/images.ts` — **magic bytes** | Sí, junto con `sharp` |
| Subida a Storage | `lib/storage/product-images.ts` (solo servidor) | — |
| Mercado en el que se escribe | **RLS** (migración 0020, DEC-035) | **Sí** |
| Invalidación de la tienda | `lib/admin/revalidate.ts` | — |

### Lo que un agente futuro NO debe hacer

1. **No aceptar `market_id` del formulario.** En un INSERT lo pone el servidor
   desde `getActiveMarket()`; en un UPDATE ni siquiera viaja en el payload, solo
   aparece como filtro `.eq("market_id", …)`. Y RLS lo vuelve a comprobar
   (DEC-035): un admin no puede escribir en un mercado inactivo.
2. **No fiarse de `File.type` ni de `allowed_mime_types`.** Los dos confían en lo
   que declara quien sube. La verdad son los magic bytes, y encima `sharp`
   re-codifica: el objeto del bucket lo genera el servidor (DEC-036).
3. **No componer la ruta del objeto con datos del formulario.** El slug se lee de
   la BD (`getProductSlugForAdmin`). Si viniera del cliente se podrían escribir
   objetos bajo la carpeta de otro producto.
4. **No guardar derivados por tamaño en Storage.** Un objeto por foto; las
   variantes responsive las hace `next/image` (DEC-036 y `09-SEO` §55).
5. **No crear variantes con N llamadas desde TypeScript.** La matriz es atómica
   en SQL (0021). Y no comprobar duplicados solo con el `unique`: Postgres trata
   dos NULL como distintos, así que no impide dos variantes "sin color ni talla".
6. **No inventar tipos de bloque de home.** Son los tres del CHECK de la 0014.
   Esto no es un page builder.
7. **No inventar una política de borrado de categorías.** `products.category_id`
   es `NOT NULL` sin cascada: PostgreSQL rechaza borrar una categoría con
   productos. El panel hace borrado lógico y bloquea antes con un mensaje claro.
8. **No invalidar con el patrón `'/producto/[slug]'`.** No funciona (ver abajo).

### Hallazgo de Fase 8: la invalidación por patrón NO invalida

Medido sobre el build servido: tras despublicar un producto, su ficha seguía
respondiendo **200 con `x-nextjs-cache: HIT`**. Un producto retirado seguía
comprándose. Publicar sí "funcionaba", pero solo porque el producto era nuevo y
no estaba en caché — **un falso verde**.

Lo que sí invalida es la **ruta literal**: `revalidatePath('/producto/<slug>')`
→ la siguiente petición da 404 con `MISS`. Por eso toda action que cambie un
producto necesita su `slug`, y la edición invalida también el slug ANTERIOR
porque el slug puede cambiar (DEC-037).

### Sobre el espacio en Supabase

1 GB en el plan gratuito. Con el JPEG original: ~50 productos de 5 fotos. Con la
recompresión a WebP de DEC-036: **~570**. Medido con un JPEG de 4032×3024 →
ahorro **×13,2**. Si alguien desactiva la conversión "para no perder calidad",
está multiplicando por diez la factura de almacenamiento y el peso que descarga
cada visitante.

### Cómo se verificó (no se dedujo)

**53 tests de integración** contra Supabase real (RLS, triggers, constraints,
RPC de la matriz y policies de Storage, con JWT de admin / no-admin / anónimo y
controles positivos) y **78 comprobaciones end-to-end** sobre el build servido,
incluidas **subidas reales de imagen** y **Server Actions invocadas
directamente sin UI y sin JavaScript**, siempre con control positivo. La base y
el bucket quedaron en su baseline.

**No verificado:** nada se ha visto en un navegador real (sigue sin haber
navegador automatizado).

> **Actualización de Fase 9:** la nota que aquí decía que la invalidación del
> *chrome* "dio resultados inconsistentes" quedó resuelta. Se reprodujo el
> escenario sobre el build de Fase 8 y se midió tres veces:
> `revalidatePath('/', 'layout')` **sí** invalida la home y las fichas ya
> generadas. La referencia vigente es DEC-041 y el §14 de este documento.

---

## 14. SEO, caché e imágenes (desde Fase 9) — LEER ANTES DE TOCARLO

### 14.1 La invalidación tiene una matriz, y está en un solo sitio

La cabecera de **`lib/admin/revalidate.ts`** contiene la tabla completa
`MUTACIÓN → QUÉ QUEDA OBSOLETO → QUÉ SE INVALIDA` (DEC-041). Antes de añadir una
Server Action que escriba en el catálogo, mírala y usa la primitiva que
corresponda. No inventes una llamada nueva.

Tres reglas que no se negocian:

1. **Ruta LITERAL, nunca patrón.** `revalidatePath('/producto/[slug]', 'page')`
   **no** invalida lo que `generateStaticParams` prerenderizó. Está medido dos
   veces (Fase 8 y Fase 9) y hay un test —
   `lib/seo/__tests__/revalidate-usage.test.ts` — que recorre `app/`, `lib/` y
   `components/` y falla si alguien lo reintroduce. Si ese test falla, el
   arreglo es quitar el patrón, no relajar el test.
2. **Lo global se invalida con `revalidatePath('/', 'layout')`.** Invalida el
   layout, todos los anidados y todas las páginas por debajo. Es lo correcto
   para categorías y ajustes, porque el menú de categorías vive en el layout de
   `(store)` y lo pintan la home y todas las fichas.
3. **Toda mutación de producto invalida `/sitemap.xml`.** Es un Route Handler
   cacheado por Next: sin eso, un producto retirado sigue anunciado a Google
   aunque su ficha ya devuelva 404.

**No conviertas nada en `force-dynamic` para "arreglar" un problema de caché.**
DEC-021 lo prohíbe explícitamente: es tapar una limitación destruyendo la
estrategia de render.

**La deuda de Fase 8 sobre el chrome NO era real.** Fase 9 la reprodujo antes de
tocar nada y midió tres veces lo contrario. Si vuelves a leerla en un documento
antiguo, la referencia buena es DEC-041.

### 14.2 Cómo medir una invalidación sin fingir el resultado

El único método fiable en este entorno:

1. `npm run build` y `npx next start -p <puerto ≠ 3000>`. **Nunca toques el
   :3000 del usuario.**
2. Pide la ruta varias veces hasta que `x-nextjs-cache` diga `HIT` (con
   `revalidate = 300` puede aparecer `STALE` si pasaron 5 minutos).
3. Ejecuta la mutación **por la Server Action real**, con POST directo del
   formulario (multipart, con los `$ACTION_*` copiados del HTML). No la
   simules escribiendo en la BD: no ejercitaría la invalidación.
4. Vuelve a pedir la ruta y mira **el contenido**, no solo la cabecera. Un
   `MISS` sin comprobar el HTML no demuestra nada.
5. Repite la medición. Si sale distinto entre ejecuciones, **dilo**; no elijas
   la ejecución que te conviene.

Trampa real que costó una fase: comprobar un dato que la página **no pinta**.
`settings.store_name` no aparece en ninguna página pública (el Footer y el logo
son texto fijo), y el número de WhatsApp tampoco (lo lee `getCheckoutChannel()`
dentro de la Server Action). Medir sobre ellos da ruido, no señal.

### 14.3 Formularios que no existen sin JavaScript

Varios formularios del panel se montan tras un clic (estado de cliente) y por
tanto **no están en el HTML servido**: alta y edición de categorías, y el
formulario de estado de un pedido. Sin navegador no se pueden ejercitar por POST
directo. Los que sí están: borrado de categoría, toggle de estado de producto,
edición de variantes, subida/orden/principal/borrado de imagen, y ajustes.

Cuando planifiques una verificación, mira primero qué `<form>` hay realmente en
el HTML. Y si un camino no se puede probar, **decláralo sin probar** en vez de
buscarle un sustituto que parezca equivalente.

### 14.4 SEO: no inventes rutas ni campos

- El sitemap y el breadcrumb solo describen rutas que **existen** en `app/`
  (DEC-039). Hoy: `/` y `/producto/[slug]`. `/categoria/[slug]` e
  `/info/[slug]` están en `09-SEO-PERFORMANCE.md` pero **no implementadas**.
  Meterlas en el sitemap sería anunciar 404.
- La metadata sale de `meta_title`/`meta_description`, que ya existían en
  `products`. **No se añaden columnas SEO nuevas.**
- El JSON-LD no rellena huecos: un producto sin descripción **omite la clave**,
  no publica una descripción fabricada. Y `availability` sale del stock real.
- `serializeJsonLd()` escapa `<`: el contenido lo edita el admin, y eso no lo
  hace confiable como HTML dentro de un `<script>`.

### 14.5 Imágenes: el blur lo genera el servidor, punto

`product_images.blur_data_url` (migración `0022`, DEC-040) guarda un data URI de
un WebP de 16 px que produce `sharp` durante la subida. **Nunca se acepta un
blur enviado por el navegador**, y no es solo una regla de TypeScript: hay un
CHECK en PostgreSQL que exige el prefijo `data:image/webp;base64,` y una
longitud de 32 a 4000 caracteres.

Las 4 imágenes anteriores a Fase 9 tienen `NULL` y se pintan sin placeholder.
El backfill **está pendiente** y requiere descargar y reprocesar cada objeto: es
una operación externa, no una migración. No lo des por hecho.

`priority` va **solo** en la foto principal de la ficha: es la que decide el
LCP. Poner `priority` en varias imágenes es equivalente a no ponerlo en ninguna.

### 14.6 `robots.txt` no es un control de acceso

Deniega `/admin`, pero cualquiera puede leerlo e ir justo ahí. Lo que protege el
panel sigue siendo la cadena de Fase 7: `proxy.ts` → layout con `is_admin()` →
`requireAdmin()` en cada action y cada función de `lib/data/admin/` → RLS.
Si algún día alguien "arregla" un fallo de acceso tocando `robots.ts`, está
arreglando lo que no es.

---

## 15. La auditoría del catálogo (desde Fase 9.5, 5C) — LEER ANTES DE TOCARLA

`admin_change_log` (migraciones `0032` + `0033`) responde una sola pregunta:
**quién cambió el precio, el stock, el estado o el borrado de un producto,
cuándo, y de qué valor a qué valor**. Cuatro campos. Nada más.

### 15.1 Lo escribe un trigger, no una Server Action

`log_admin_change` es `AFTER UPDATE FOR EACH ROW` sobre `products` y
`product_variants`. Por eso un `PATCH` directo a PostgREST con la sesión del
admin —sin pasar por el panel— deja exactamente el mismo registro, y por eso la
concurrencia sale bien sola: se registra `OLD`/`NEW`, es decir lo que quedó en
la fila, no lo que la interfaz creía escribir.

**No añadas escritura de auditoría desde TypeScript.** No hay policy de INSERT
en esa tabla precisamente para que un admin no pueda fabricar un registro
(DEC-056); si tu código necesita insertar ahí, el diseño está mal.

### 15.2 La trampa que ya se rompió una vez: "hay sesión" ≠ "hay un admin"

La versión inicial abría la puerta con `auth.uid() is not null`. Consecuencia
**medida**, no imaginada: un usuario autenticado sin fila en `profiles` que
llama a `create_order` hacía saltar la FK de `actor_id` **dentro de la
transacción del pedido**, y el pedido no se creaba. La auditoría podía **denegar
una venta**.

La puerta es `is_admin()`, y eso hace la FK inalcanzable por construcción: si el
trigger escribe, el actor tiene perfil (DEC-059).

### 15.3 Las operaciones de pedido NO se auditan aquí

`order_events` ya es la autoridad de todo lo que le pasa a un pedido, con actor,
fecha y unidades; el detalle por variante sale de `order_items`. Duplicarlo daría
dos historiales contando lo mismo.

El trigger excluye por `request.path` **dos** funciones: `create_order` y
`admin_update_order_status`. Se comprobó que en todo el esquema solo tres
funciones escriben en `product_variants`; la tercera, `admin_restock_variants`,
sí se audita y se etiqueta como `reposicion`.

> **Si añades una función que mueva stock por causa de un pedido, añádela a esa
> lista.** Si te olvidas, el cambio se registra como `source='rpc'` y se ve en
> la ficha: falla hacia el lado ruidoso, no hacia el lado silencioso.

`request.path` no es un dato del cliente: es la ruta con la que PostgREST ya
eligió qué ejecutar (DEC-057).

### 15.4 Consecuencia honesta: el historial de stock tiene huecos

El stock puede pasar de 24 a 20 sin una entrada, porque se vendieron cuatro
unidades. **No es un libro mayor de existencias**, y la ficha lo dice con esas
palabras. Si algún día hace falta el libro mayor completo, es otra tabla y otra
decisión.

### 15.5 El mercado se hereda del producto

La policy de SELECT lleva el `exists` contra `products` con
`is_active_market(p.market_id)` (DEC-060), igual que `admin_all_product_variants`.
`market_id` **no** se guarda en la tabla: duplicarlo solo abriría la puerta a que
las dos copias dejaran de coincidir.

### 15.6 La ficha enseña 20 cambios y lo admite

`listProductChanges` pide una fila de más de las que pinta, solo para saber si
hay historial anterior y decirlo. No hay paginación, y por eso mismo no se
promete una lista completa que no se sirve.

---

## 16. Colores y tallas (desde Fase 9.5, inc. 6) — LEER ANTES DE TOCARLOS

Se administran en `/admin/atributos`. Tres cosas que no son obvias y que ya
costaron una corrección:

### 16.1 Son GLOBALES: no tienen `market_id`

Verificado contra el proyecto real, no leído de la migración. Por eso
`atributos/actions.ts` **no llama a `getActiveMarket()`** y sus policies son
`is_admin()` sin `is_active_market`. No es un olvido de DEC-035: no hay
columna de mercado que decidir (DEC-062). Copiar ahí la defensa del resto del
panel sería ruido, no seguridad.

Hay un test de integración que **afirma** que `market_id` no existe. Si alguien
lo añade, ese test falla a propósito.

### 16.2 `sizes` no tiene `slug`, y `colors.name` no es único

La identidad de una talla es `(label, size_group)`, que ya es UNIQUE. No añadas
un slug: nadie lo consume.

`colors.slug` sí es único, pero `colors.name` **no**: dos colores «Azul» con
distinto slug son legales. La única defensa contra eso es que la acción
**deriva el slug del nombre** cuando el admin lo deja vacío, así que dos
nombres iguales chocan en `colors_slug_key`. No se añadió constraint sobre
`name`; si algún día hace falta, es una decisión, no un descuido.

### 16.3 Retirar un valor lo impone PostgreSQL, no `listColors()`

`listColors()`/`listSizes()` filtran `is_active` porque alimentan la MATRIZ.
`listColorsForAdmin()`/`listSizesForAdmin()` **no** filtran, porque alimentan la
pantalla de mantenimiento —si filtraran, un valor retirado no se podría
reactivar—. Son dos funciones y no un booleano a propósito.

Pero el filtro de la capa de datos **no es la garantía**. La garantía es que
`admin_create_variant_matrix` exige `is_active` desde la 0034 (DEC-061). Antes,
un POST directo a la RPC creaba variantes con atributos retirados; está medido.

> **La comprobación va en la TRANSICIÓN, no en la fila.** No pongas un CHECK ni
> un trigger sobre `product_variants` que exija atributos activos: congelaría
> las variantes existentes y no se podría ni corregir su stock. Es exactamente
> el error de la 0030 que la 0031 tuvo que deshacer.

### 16.4 Renombrar es seguro; borrar en uso, imposible

`order_items` guarda `color_name` y `size_label` como snapshot del momento de la
compra, así que renombrar **no reescribe pedidos** (verificado con un pedido
real). Y las FK `product_variants_color_id_fkey` / `_size_id_fkey` no llevan
`ON DELETE`, así que borrar un valor en uso devuelve 23503. **No añadas
`ON DELETE CASCADE` ni `SET NULL`**: perderías la variante o su identidad.

### 16.5 Los desplegables son `<details>`, no `useState`

Con estado de cliente, los formularios de edición y borrado **no existen en el
HTML** hasta que alguien hace clic, y entonces no se pueden ejercitar sin
navegador. Con `<details>` van servidos y el E2E hace POST contra ellos. Si
tocas esos componentes, no los conviertas en estado de cliente.

Aviso aparte: las casillas de color y talla de `VariantMatrix` **sí** son
`<button onClick>` de Fase 8, así que seleccionarlas necesita JavaScript. Lo
que se puede verificar sin navegador es qué se OFRECE, leyendo el payload RSC
servido — el nombre no sirve como testigo porque el payload lo repite.

---

## 17. El detector de publicados sin foto (P2) — LEER ANTES DE TOCARLO

### 17.1 Es administrativo, NO una regla de publicación

Un producto sin foto **se publica, se vende y su ficha responde 200**. Este
detector solo lo hace encontrable. `enforce_publishable_product` **no se tocó**
y no debe tocarse por esto: convertir "sin foto" en condición de publicación
sería una decisión de negocio que nadie ha tomado.

### 17.2 La cadena vacía cuenta como "sin foto", y no es criterio propio

`product_images.url` es NOT NULL pero **admite `''`** (comprobado: 201). El
código que renderiza la tienda hace `if (!path) return null` y cae a
`MockImage`, así que una fila con url vacía pinta exactamente el mismo recuadro
gris que no tener ninguna. El detector se alinea con eso porque **lo contrario
escondería productos que el cliente ve rotos**.

Consecuencia asumida: una url de solo espacios (`' '`) sí contaría como imagen,
porque también contaría para el renderizador —produciría una imagen rota, no un
placeholder—. No es alcanzable por la aplicación y no existe ninguna hoy.

### 17.3 PostgREST SÍ sabe expresar un NOT EXISTS

```
product_images!left(id)  +  product_images=is.null
```

Un comentario del repositorio afirmaba lo contrario y era falso; está corregido
en `lib/data/admin/catalog.ts`. Por eso este incremento **no tiene migración ni
función SQL**: si necesitas "padres sin hijos", empieza por aquí antes de
escribir una RPC. Lo que sí necesita SQL es un predicado sobre columnas de los
hijos con agregación —como `product_is_sellable`—, no la mera ausencia.

### 17.4 El recuento y la lista salen del mismo sitio

`withoutImageQuery` construye las dos consultas. Es la lección de 5B —donde el
número del aviso y la lista que abría podían discrepar— aplicada sin RPC. Si
cambias el predicado, cámbialo ahí y solo ahí.

El recuento usa `count: "exact"` con `head: true`: **no viaja ninguna fila**.

### 17.5 No se mezcla con `unsellable_products`

Son dos problemas distintos y tienen dos avisos distintos: aquel es rojo porque
el producto **no se puede comprar**; este es neutro porque sí se puede. Sumarlos
haría que el rojo dejara de significar algo concreto. No los unifiques.

---

## 18. El buscador de pedidos (P3) — LEER ANTES DE TOCARLO

### 18.1 PostgREST no admite columnas embebidas dentro de un `or`

```
or=(order_number.ilike.*x*,customer.name.ilike.*x*)
  → 400 · PGRST100 · failed to parse logic tree
```

El `.` de `customer.name` se lee como el separador del operador. **Está medido**,
no supuesto. Por eso la búsqueda son DOS consultas y no una:

1. `customers` → `or=(name.ilike.*texto*,phone.ilike.*dígitos*)` — columnas
   reales de esa tabla, acotado al mercado, tope 200 ids.
2. `orders` → `or=(order_number.ilike.*NÚMERO*,customer_id.in.(…))` — también
   columnas reales.

Si vuelves a intentar unificarlo en una sola consulta, esto es lo que te vas a
encontrar. Un filtro embebido **fuera** de un `or` sí funciona
(`.eq("product.market_id", …)` con `!inner`); lo que no se puede es meterlo
dentro del `or`.

### 18.2 No hay heurística, y es deliberado

No se adivina si lo escrito "parece un teléfono". Se buscan los tres caminos a
la vez y se devuelve la unión, porque adivinar falla justo en el caso ambiguo:
`000003` es a la vez la cola de un número de pedido y un trozo de teléfono
plausible. Si añades un cuarto campo buscable, añádelo a la unión, no a un
`if`.

### 18.3 Los dígitos van aparte porque el teléfono se guarda sin formato

`create_order` hace `regexp_replace(p_customer_phone, '[^0-9]', '', 'g')`, así
que `customers.phone` son solo dígitos. Del texto escrito se extraen los suyos
para que pegar "+34 600 111 222" del chat funcione. **No normalices el teléfono
en otro sitio con otra regla**: la fuente es esa línea de la 0018.

### 18.4 `normalizeOrderQuery` sigue existiendo y NO es el buscador

Pasa a mayúsculas y borra todo lo que no sea `[A-Z0-9-]`: correcto para un
número de pedido, destructivo para un nombre («Ana Pérez» → «ANAPREZ»). La usan
el detalle y la action de estado, donde lo que llega ES un número. El buscador
usa `sanitizeOrderSearch`. No las mezcles.

### 18.5 Buscar algo inservible no es lo mismo que no buscar

Escribir `%` se sanea a nada. Antes eso equivalía a "sin búsqueda" y la pantalla
devolvía **el listado entero**, que se lee como «tu búsqueda lo ha encontrado
todo» — medido sobre el build servido. Por eso existe `unusableQuery`: cero
resultados y un mensaje. Si tocas el saneado, mantén esa distinción.

### 18.6 Límites que la interfaz declara, y que no debes esconder

- **Los acentos cuentan**: «Perez» no encuentra «Pérez». Arreglarlo pide
  `unaccent` + índice, que es otro incremento y otra decisión.
- Más de 200 clientes coincidentes ⇒ resultado posiblemente incompleto, y se
  avisa (`partial`). El tope existe porque los ids viajan en la URL de la
  segunda consulta.

---

## 19. Subida de imágenes (incremento 7) — LEER ANTES DE TOCARLA

### 19.1 El límite del cuerpo de las Server Actions es real y estaba mal

Next lo pone en **1 MB por defecto**. Este proyecto no lo configuraba, y por
eso una foto de móvil **no se podía subir**: medido sobre el build servido,
1,20 MB devolvía `500 · Body exceeded 1 MB limit` mientras la validación de la
app y el bucket decían admitir 5 MB.

`next.config.ts` **importa** `ACTION_BODY_LIMIT_BYTES` de `lib/admin/images.ts`
en vez de repetir un número. Hay un test que lee `next.config.ts` y falla si
alguien escribe un literal: si los dos valores se separan, el fallo vuelve y es
silencioso hasta que alguien intente subir una foto.

### 19.2 En SERIE, nunca en paralelo

Cada archivo lee la galería para calcular su `sort_order` y si le toca ser
principal. En paralelo, dos archivos de un producto vacío piden los dos
`is_primary = true` y el índice UNIQUE parcial de la 0020 rechaza al segundo.
Si algún día te tienta un `Promise.all` aquí, esto es lo que va a pasar.

### 19.3 La carrera ENTRE peticiones sí existe, y se resuelve reintentando

El orden en serie solo protege dentro de un lote. Con dos administradores
subiendo a la vez **se perdía una imagen** (reproducido: 2 → 1). La corrección
es mínima y no lleva migración: si el INSERT devuelve `23505` habiendo pedido
`is_primary`, otro se llevó la principal, así que se reintenta una vez como
no-principal. **El índice es la autoridad; el código solo le hace caso.**

### 19.4 Éxito parcial: se informa, no se deshace

De tres fotos pueden entrar dos. Las buenas se quedan y el estado devuelve un
resultado **por archivo**. No añadas un rollback: tiraría trabajo ya hecho y
ninguna invariante pide que un lote sea atómico.

### 19.5 Storage y BD no comparten transacción

Subir: objeto primero, fila después; si la fila falla, se borra el objeto.
Borrar: fila primero, objeto después; si el objeto falla queda un huérfano —
molesto pero inofensivo— en vez de una ficha rota. Lo que **no** se puede
compensar es que el proceso muera entre ambos pasos. No lo tapes: está
declarado como riesgo residual.

### 19.6 El alt es automático, y eso tiene un coste

Se genera del nombre del producto y su posición (decisión de producto de Juan).
Identifica la foto, **no la describe**: para un lector de pantalla es bastante
menos útil que un texto escrito a mano. Si algún día se añade un editor de alt,
este es el hueco que cubre.

---

## 20. Envío y total del pedido (incremento 8) — LEER ANTES DE TOCARLO

### 20.1 La autoridad del total es `create_order`, y solo esa

El navegador manda **un uuid de método** y nada más. Precio, umbral, coste y
total los resuelve PostgreSQL contra `shipping_methods` del mercado del pedido,
dentro de la misma transacción que descuenta stock y crea las líneas.

Ningún importe de envío existe como parámetro de entrada. No es que se ignore:
es que **no se puede enviar**. Probarlo devuelve `PGRST202`.

### 20.2 La regla del umbral está DUPLICADA a propósito, y vigilada

`resolveShippingCost` (TypeScript) existe para que el cliente vea el total antes
de confirmar; el `case` de la migración 0035 es la verdad. Están escritas dos
veces porque el navegador no puede ir a la BD por cada pulsación.

**El seguro es `shipping.integration.test.ts`**: ejecuta las dos sobre los
mismos casos y falla si difieren en un céntimo. Si cambias la regla, cámbiala en
los dos sitios o ese test te para.

Se compara contra el **subtotal de productos**, nunca contra el total: el total
incluye el envío y compararlo consigo mismo no tiene definición coherente.

### 20.3 El método va dentro del fingerprint de idempotencia

`variante:cantidad|…#teléfono#método`. Sin el método, reintentar con la misma
clave y otro envío habría devuelto el pedido viejo con el total viejo y el
cliente habría visto un importe que no pidió. Ahora salta
`IDEMPOTENCY_KEY_REUSED`, que es la verdad.

### 20.4 La firma vieja de `create_order` se eliminó, y no vuelve

La versión de 6 parámetros no sabía de envío: dejarla viva era dejar publicado
un camino que crea pedidos con `shipping_total = 0`. Si algún día añades otro
parámetro, **elimina la firma anterior en la misma migración** y vuelve a dar el
`grant` sobre la nueva.

### 20.5 `/checkout` es `force-dynamic` por una razón medida

Antes salía como `○ (Static)` en el build. Al empezar a leer `shipping_methods`,
seguir estática habría horneado los precios EN EL BUILD: cambiar 4,90 € en la BD
no se vería hasta el siguiente despliegue y el cliente vería un importe distinto
del que se le va a cobrar. No la vuelvas a hacer estática.

### 20.6 Lo que NO hay, y no debes inventar

No hay zonas, ni peso, ni impuestos, ni dirección. El checkout captura teléfono
y nombre (DEC-049), así que **el sistema no sabe dónde vive el cliente**: quien
elige «Envío a Península» paga su precio aunque esté en Canarias. Si eso importa
comercialmente, primero hay que capturar dirección — y eso es otra decisión, de
Juan, no tuya.

---

## 21. Los métodos de entrega (incremento 9) — LEER ANTES DE TOCARLOS

`shipping_methods` **no es una tabla de catálogo: es la tabla que decide lo que cobra la tienda.** `create_order` lee de ahí el precio y el umbral y los mete en el total del pedido (§20, DEC-063). Todo lo de abajo existe por eso.

### 21.1 Dónde vive cada cosa

| Pieza | Fichero | Qué hace |
|---|---|---|
| Validación de formulario | `lib/admin/shipping.ts` | `validateShippingMethodInput`, `shippingErrorMessage`, `SHIPPING_LIMITS` |
| Lectura del panel | `lib/data/shipping.ts` → `listShippingMethodsForAdmin` | Todos los métodos del mercado, activos o no, con `orders(count)` embebido |
| Lectura del checkout | `lib/data/shipping.ts` → `listShippingMethods` | Cliente anónimo, **solo activos** |
| Escritura | `app/admin/(panel)/ajustes/actions.ts` | `create` / `update` / `deleteShippingMethodAction` |
| Pantalla | `components/admin/ShippingMethodForms.tsx` + `app/admin/(panel)/ajustes/page.tsx` | Sección «Métodos de entrega» |
| Barrera definitiva | `supabase/migrations/0036_shipping_methods_integrity.sql` | Dos CHECK y un índice UNIQUE |

### 21.2 Las cuatro cosas que se rompen si no las sabes

1. **Umbral vacío ≠ umbral cero.** Vacío → `null` → el método **nunca** sale gratis. `0` → gratis **siempre**. `Number("")` vale `0`, así que cualquier atajo que convierta el campo a número sin comprobar antes si está vacío regala el envío de toda la tienda. Hay tests unitarios y E2E de los dos casos; si los ves fallar, el fallo es tuyo, no del test.
2. **Un umbral negativo regala el envío en silencio.** `subtotal >= -50` es siempre cierto. Antes de la 0036 la BD lo aceptaba con un 201. No quites ese CHECK.
3. **`market_id` no viene del formulario, nunca.** Sale de `getActiveMarket()` dentro de la action. RLS solo deja escribir en mercados ACTIVOS (DEC-035); un `market_id` inyectado en el POST se ignora, y hay un E2E que lo comprueba.
4. **Borrar un método NO borra el importe cobrado.** La FK es `on delete set null` y `orders` guarda `shipping_method_name`, `shipping_total` y `total` como snapshot. Por eso se permite borrar. **No añadas `ON DELETE CASCADE` ni una FK restrictiva**: lo primero destruiría pedidos, lo segundo obligaría a mentir en la interfaz diciendo que un método en uso es imborrable cuando no lo es.

### 21.3 Lo que NO hay que hacer

- **No revalides el escaparate al guardar.** `/checkout` es `force-dynamic` (DEC-063): lee los métodos en cada petición y el cambio se ve sin redeploy. Un `revalidatePath` aquí no arregla nada y sugiere una dependencia de caché que no existe.
- **No uses `service_role`.** Las tres actions van sobre el cliente de sesión, con `requireAdmin()` delante y RLS detrás. Verificado: `anon` y autenticado-sin-rol reciben `42501`.
- **No escondas el precio ni el umbral detrás del desplegable.** La fila los enseña sin abrir nada a propósito: `free_shipping_threshold = 60` estuvo meses sin aplicarse porque no se veía en ningún sitio.
- **No conviertas «no hay métodos» en un aviso amable.** Sin métodos activos nadie puede completar un pedido, porque `create_order` exige uno. Los dos avisos de la pantalla van en rojo.
- **El desplegable es `<details>`, no `useState`.** Así el formulario de edición viaja SERVIDO en el HTML y el E2E puede hacerle POST sin navegador (misma lección que colores y tallas, §16).

### 21.4 Cómo se comporta la BD, verificado contra Supabase real

| Intento | Antes de 0036 | Ahora |
|---|---|---|
| `anon` crea método | 42501 | 42501 |
| autenticado sin rol crea método | 42501 | 42501 |
| admin de ES crea/mueve a un mercado inactivo | 42501 | 42501 |
| `price = -1` | 23514 | 23514 |
| `free_shipping_threshold = -50` | **201 ACEPTADO** | **23514** |
| `name = ''` | **201 ACEPTADO** | **23514** |
| nombre duplicado en el mismo mercado | **201 ACEPTADO** | **23505** |
| DELETE de un método con pedidos | 204 | 204, y el pedido conserva nombre, envío y total |

---

## 22. Número de WhatsApp y fotos rotas (incremento 10) — LEER ANTES DE TOCARLO

Dos cosas distintas que compartían una misma causa: **el seed dejaba la tienda en un estado roto que ninguna pantalla contaba.**

### 22.1 «Válido» no es «configurado» (DEC-065)

`normalizePhone('34600000000')` devuelve el número: son 11 dígitos y la forma es correcta. Y sin embargo es el placeholder que siembra `05_settings_and_shipping_es.sql`, archivo que dice de sí mismo *«número de prueba, NO real»*. Con el guard anterior —`buildWhatsAppUrl(...) !== null`— el checkout **creaba el pedido** y mandaba al cliente a `wa.me/34600000000`.

| Pieza | Dónde |
|---|---|
| Los predicados | `lib/whatsapp/phone.ts`: `PLACEHOLDER_WHATSAPP_NUMBERS`, `isPlaceholderWhatsAppNumber`, `isWhatsAppConfigured` |
| El bloqueo de venta | `lib/whatsapp/channel.ts`, ANTES de `createOrder` |
| El rechazo al guardar | `parseWhatsAppNumber` en `lib/admin/catalog.ts` |
| Los avisos | `StoreReadiness` en `app/admin/(panel)/page.tsx` y el bloque de `app/admin/(panel)/ajustes/page.tsx` |

**Lo que no hay que hacer:**

1. **No amplíes la lista con números que «parecen falsos».** Contiene el valor que siembra el repositorio y nada más. `34600000001` es real y válido; hay un test que lo comprueba. Adivinar sería inventar una regla de negocio.
2. **No dupliques el literal.** `phone.test.ts` lee el archivo de seed y falla si el valor sembrado deja de estar en la lista. Si cambias el seed, actualiza la lista: el test te obliga.
3. **No uses dos predicados.** El panel y el checkout llaman al MISMO `isWhatsAppConfigured`. Si el panel dijera «listo» mientras el checkout rechaza, el aviso sería peor que no tenerlo.
4. **No conviertas el bloqueo en un aviso.** Fue decisión explícita de Juan: más vale no vender que registrar un pedido que no le llega a nadie. Mientras el número sea el del seed, **la tienda no vende, y es el efecto buscado**.
5. **`lib/admin/catalog.ts` corre bajo `node --test`**: importa `../whatsapp/phone.ts` con ruta RELATIVA y extensión. Poner `@/lib/...` ahí rompe dos suites enteras con `ERR_MODULE_NOT_FOUND` (ocurrió; el alias no lo resuelve Node).

### 22.2 La fila existe, el objeto no (DEC-066)

Medido antes de tocar nada: `/_next/image` devolvía **400** para las cuatro imágenes del seed, `og:image` y el JSON-LD servían esa URL, y P2 informaba de que todos los productos tenían foto **porque la fila existía**.

| Pieza | Dónde |
|---|---|
| Limpieza + detector | `supabase/migrations/0037_broken_product_images.sql` |
| Data layer | `listBrokenProductImages` / `countProductsWithBrokenImages` en `lib/data/admin/catalog.ts` |
| Pantalla | `/admin/catalogo?ver=foto-rota` y el aviso del panel de inicio |

**Lo que no hay que hacer:**

1. **No lo mezcles con P2.** «Sin foto» y «foto rota» son problemas distintos con arreglos distintos, y P2 los separó a propósito. El detector excluye `url = ''` por eso.
2. **No quites el `SECURITY DEFINER` ni saques `is_admin()` del WHERE.** El dato vive en `storage.objects`, que PostgREST no expone y tiene RLS propia. Con la puerta dentro del WHERE, un no-admin recibe **cero filas**, no un error.
3. **No lo resuelvas desde TypeScript.** Sería una llamada a Storage por producto (N+1) y exigiría `service_role`.
4. **No lo pintes en rojo.** El producto se compra igual. El rojo de ese panel significa «no se puede comprar» y diluirlo lo deja sin significado.
5. **No devuelvas los inserts de `product_images` al seed.** Creaban filas para objetos que el seed nunca sube. Hay un test que falla si vuelven.

### 22.3 Lo que este incremento NO arregla, y hay que decir en voz alta

- **Las fotos reales siguen sin existir.** Los cuatro productos del seed están publicados y sin foto: el cliente ve el hueco honesto en vez de una imagen rota, que es mejor, pero sigue sin ver el producto. Se suben desde `/admin/catalogo`.
- **`og:image` y el `image` del JSON-LD ya no existen en esas fichas.** Es correcto —no se puede inventar una imagen— pero `image` es propiedad REQUERIDA del rich result de producto de Google: **ese rich result seguirá incompleto hasta que haya fotos**. Verificado que en cuanto se sube una foto real la ficha vuelve a anunciar `og:image` con respuesta 200 y el JSON-LD recupera `image`.
- **El fallback de `RemoteImage` sigue siendo de cliente.** Si en el futuro una imagen vuelve a romperse, el HTML servido llevará otra vez el `<img>` roto hasta que hidrate. El servidor no puede saber que un objeto devuelve 400 sin ir a buscarlo; la respuesta a eso es el detector, no un `fetch` por imagen en cada render.

---

## 23. Stock: «Dejar en X» y «Agotar» (incremento 12) — LEER ANTES DE TOCARLO

### 23.1 La regla que resume todo

**El stock se ESTABLECE, y establecer exige un testigo. Agotar es el cero, y el cero no necesita testigo porque converge.**

La tienda no tiene almacén: una fuente externa dicta «negra M 4, negra L 0, blanca M 7» y el trabajo del panel es copiarlo sin romper nada.

### 23.2 Dónde vive

| Pieza | Archivo |
|---|---|
| La transacción | `supabase/migrations/0038_admin_set_variant_stock.sql` |
| Validación pura | `lib/admin/stock.ts` |
| Data layer (agrupado + búsqueda) | `lib/data/admin/inventory.ts` |
| Server Action | `app/admin/(panel)/inventario/actions.ts` |
| Pantalla | `components/admin/InventoryTable.tsx` |

### 23.3 Lo que no hay que hacer

1. **No hagas opcional `expected_updated_at` en `mode='set'`.** La ausencia de un dato pasaría a ser un permiso para escribir sin control de concurrencia. Está medido: una venta simultánea desaparece sin que nadie se entere. Si falta, la función lanza `EXPECTED_UPDATED_AT_REQUIRED`.
2. **No conviertas `exhaust` en «escribir sin testigo».** Solo escribe 0 y rechaza `stock` o `expected_updated_at` en el payload. Poner a cero converge; cualquier otro valor, no.
3. **No apliques el lote a medias.** Un conflicto en una variante deshace las tres. Un guardado parcial parece correcto y no lo es, que es justo lo peligroso.
4. **No hagas que Agotar toque `is_active`, `status` ni `deleted_at`.** Agotado NO es despublicado (DEC-052/DEC-067): la ficha sigue en 200 y dice «Agotado». Desactivar la última variante activa además deja la ficha en 404 y choca con `enforce_publishable_product`.
5. **No inventes una categoría de auditoría.** `admin_set_variant_stock` se etiqueta `correccion` dentro de `log_admin_change`; si añades otra RPC que mueva stock, **añádela a ese `case`** o entrará como `rpc`, que es el cajón del ruido.
6. **No devuelvas el delta al panel.** `admin_restock_variants` sigue viva y probada, pero fuera del flujo de edición rápida (DEC-068). Hay un test que falla si alguna pantalla vuelve a llamarla.
7. **No metas una columna embebida dentro de un `or` de PostgREST.** Es un `400 PGRST100` y tumba la pantalla entera. La búsqueda del inventario resuelve primero los ids por SKU y luego filtra `products` con `id.in.()`. Hay un test de integración que AFIRMA el límite de PostgREST y otro que comprueba que la capa de datos no reconstruye el `or` roto.
8. **No quites el `key={variantId-updatedAt}` de los campos.** Es lo que hace que, tras guardar o agotar, el input muestre el valor nuevo: un input no controlado no se repinta solo.
9. **No pongas el botón de guardar en rojo.** Hay uno por producto, y cuatro CTA rojos en una pantalla dejan el rojo sin significado (CLAUDE.md #10). El rojo aquí es el borde de la variante agotada o bajo umbral.

### 23.4 Lo que NO hace este incremento

- **No hay tope superior de stock en la base de datos.** `stock` es `int` con `check (stock >= 0)`; el 100000 es defensa de aplicación en los dos caminos absolutos.
- **No hay edición masiva entre productos.** El lote es de UN producto, que es lo que el administrador entiende por una operación.
- **No se mide el rendimiento con catálogo grande.** Con 4 productos y 9 variantes, «va rápido» no significa nada y no se afirma.

---

## 24. Proveedor y referencia externa (incremento 13) — LEER ANTES DE TOCARLO

### 24.1 La regla que resume todo

**Son dos textos que SEÑALAN un artículo ajeno, no lo identifican. Por eso no son únicos y no se normalizan.**

### 24.2 Dónde vive

| Pieza | Archivo |
|---|---|
| Columnas + CHECK | `supabase/migrations/0039_supplier_and_reference.sql` |
| Validación pura | `parseSupplierRef` y `SUPPLIER_TEXT_LIMIT` en `lib/admin/products.ts` |
| Producto | `components/admin/ProductForm.tsx` (campo Proveedor) |
| Variante | `components/admin/VariantRow.tsx` (campo Ref. proveedor) |
| Búsqueda + lectura | `lib/data/admin/inventory.ts`, `lib/data/admin/cms.ts` |

### 24.3 Lo que no hay que hacer

1. **No añadas `UNIQUE` ni un índice único parcial.** Dos productos pueden ser dos publicaciones del mismo artículo externo, y dos variantes pueden compartir referencia. Está probado contra Supabase real que se permite, y hay un test que falla si aparece un UNIQUE en la 0039.
2. **No normalices la referencia.** Ni mayúsculas, ni quitar guiones, ni regex de formato. Es la cadena de otro; el día que su catálogo distinga la caja, el dato deja de servir para buscar.
3. **No crees una tabla de proveedores.** Ni CRUD, ni normalización, ni `market_id` propio: el mercado ya lo pone el producto y una segunda copia puede divergir.
4. **No crees un campo `replica`.** La condición de réplica es interna y se deduce de proveedor + referencia. Un campo así termina filtrándose a una etiqueta visible.
5. **No lo metas en `order_items` ni en `admin_change_log`.** El pedido guarda lo que el cliente compró; la auditoría, las cuatro decisiones de DEC-055. Ninguna de las dos es el sitio de un dato de aprovisionamiento.
6. **No lo pintes en la tienda.** `lib/data/products.ts` no pide estas columnas, y hay un E2E que comprueba que la ficha pública no las contiene.
7. **No añadas un índice para la búsqueda sin medir.** Es `ilike '%x%'`: un btree no sirve y `pg_trgm` es una extensión nueva. Cuando el catálogo lo justifique, se mide primero.

### 24.4 Límite conocido, no tapado

`products.supplier` se edita desde el formulario del producto, que **no tiene bloqueo optimista** (nunca lo tuvo: es «gana el último», igual que el nombre o la descripción). `supplier_ref` sí lo hereda, porque vive en `VariantRow`, que sí manda su testigo. Añadir testigo al formulario del producto es un cambio de comportamiento para todos sus campos y no se ha hecho aquí.

---

## 25. Atribución de marketing (incremento 14) — LEER ANTES DE TOCARLO

### 25.1 La regla que resume todo

**La atribución es un dato del pedido, la sanea PostgreSQL y NUNCA puede impedir una venta.**

### 25.2 Dónde vive

| Pieza | Archivo |
|---|---|
| Columna + saneado + firma nueva | `supabase/migrations/0040_order_attribution.sql` |
| Módulo puro | `lib/attribution/attribution.ts` |
| Captura en la landing | `components/store/AttributionCapture.tsx` (montado en `app/(store)/layout.tsx`) |
| Envío | `components/store/checkout/CheckoutForm.tsx` → `lib/checkout/validation.ts` → `lib/checkout/create-order.ts` |
| Lectura del panel | `describeAttribution` en `lib/data/admin/orders.ts`, pintado en `/admin/pedidos/[numero]` |
| Documentación de negocio | `docs/12-ATTRIBUTION.md` |

### 25.3 Lo que no hay que hacer

1. **No uses `useSearchParams()` para leer los UTM.** Marca el árbol como dependiente de la petición y convierte la landing en dinámica: adiós SSG + ISR (DEC-004, DEC-021). Se lee `window.location.search` dentro de un `useEffect`, y por eso el HTML servido es idéntico con y sin campaña.
2. **No amplíes la lista blanca sin ampliarla EN LOS DOS SITIOS.** `ATTRIBUTION_KEYS` y el `array[...]` de la 0040 tienen que decir lo mismo; hay un test que compara las dos listas y falla si se separan.
3. **No metas PII.** Ni email, ni teléfono, ni IP, ni user-agent, ni nada que identifique a una persona. La lista blanca lo impide; ampliarla con un campo así sería saltarse la única defensa que hay.
4. **No hagas que la atribución lance.** Ni en SQL, ni en la Server Action, ni en el componente. Todo va en `try/catch` o devuelve `null`. Un fallo de marketing no puede costar una venta.
5. **No la metas en el fingerprint de idempotencia.** Dos envíos del mismo carrito son el mismo pedido aunque la URL haya cambiado; meterla ahí crearía pedidos duplicados.
6. **No la reescribas después.** Se escribe en el INSERT y ya. Un `UPDATE` posterior convertiría un dato histórico en uno mutable, y entonces no sirve para comparar campañas.
7. **No la enseñes en la tienda ni en el JSON-LD.** Hay tests que lo comprueban. Es información interna del negocio.
8. **No conviertas el panel en un visor de campos.** El administrador ve una línea («instagram · paid · lanzamiento» o «— directo»); el JSON crudo no sale del data layer.
9. **No instales Meta Pixel aquí.** Los puntos de integración están escritos en `12-ATTRIBUTION.md` §8, pero el consentimiento **no está decidido** y hoy la tienda no pone cookies de terceros.

### 25.4 Lo que este incremento NO hace

- No hay Pixel, ni Conversions API, ni banner de consentimiento, ni dashboard.
- No se calcula ROAS: falta el coste publicitario y no se va a inventar.
- La atribución **no sobrevive al cierre de la pestaña**: es una sesión, no un perfil. Es la contrapartida de no usar cookies.

---

## 26. Configuración operativa y estado de venta (incremento 15) — LEER ANTES DE TOCARLO

### 26.1 La regla que resume todo

**«¿Puede vender la tienda?» se pregunta a `resolveSaleBlockers`, y a nadie más.**

### 26.2 Dónde vive

| Pieza | Archivo |
|---|---|
| El criterio | `lib/store/sale-status.ts` |
| Cómo se pinta | `components/admin/SaleStatus.tsx` |
| Quién lo consume | `app/admin/(panel)/page.tsx` y `app/admin/(panel)/ajustes/page.tsx` |
| Recuento de métodos activos | `countActiveShippingMethods` en `lib/data/shipping.ts` |
| Lectura pública de `settings` | `getSettings` y `getFooterSettings` en `lib/data/settings.ts` |
| Permisos por columna | `supabase/migrations/0041_settings_public_columns.sql` |

### 26.3 Lo que no hay que hacer

1. **No llames a `isWhatsAppConfigured()` desde una pantalla.** Pregunta por los bloqueos; si el criterio crece, crece en un sitio. Hay un test que falla si una pantalla del panel vuelve a evaluarlo por su cuenta.
2. **No metas en los bloqueos cosas que no impiden comprar.** Un catálogo vacío, un producto sin foto o el stock a cero no son «venta bloqueada»: ya tienen sus propios avisos, y mezclarlos deja el rojo sin significado.
3. **No devuelvas la fila entera de `settings` al escaparate.** Selecciona columnas. Desde la 0041, además, `anon` no puede leer las que no estén concedidas: pedir una columna nueva desde la tienda daría **401** en producción.
4. **Una columna de configuración PRIVADA no se concede a `anon`.** Ese es el valor de la 0041: lo nuevo nace privado. Si algo tiene que ser público, se dice a propósito en una migración.
5. **No conviertas `settings` en un key/value.** Campos explícitos y tipados; el esquema tiene que poder leerse.
6. **No recalcules pedidos con la configuración de hoy.** El pedido es un snapshot: guarda `shipping_total`, `total` y `shipping_method_name`. Cambiar el precio del envío **no** puede reescribir lo que se cobró (hay test de integración y E2E).
7. **No audites la configuración en `admin_change_log`.** Esa tabla tiene `product_id NOT NULL`: es el historial del CATÁLOGO. Meter ahí los ajustes exige cambiar el esquema y romper su semántica; queda fuera a propósito.

### 26.4 Lo que NO hace este incremento

- No hay logo subible, ni editor de políticas, ni Meta Pixel ID, ni historial de cambios de configuración.
- El aviso del panel de inicio sigue apareciendo **solo cuando hay algo que arreglar**: «todo bien» no es una tarea.

---

## 27. Identidad de la tienda, estado de venta y columnas privadas (Incremento 16)

**Lee esto antes de tocar la metadata de la tienda, `/checkout`, `/admin/ajustes` o los GRANTs de `products`, `product_variants` y `settings`.**

### 27.1 La marca sale de `settings`. No la vuelvas a escribir en el código

`store_name` y `tagline` (columna nueva de la 0042) alimentan:

| Consumidor | Dónde |
|---|---|
| `<title>` y su plantilla `%s · nombre` | `generateMetadata` de `app/(store)/layout.tsx` |
| `<meta name="description">` | el mismo |
| Logo del Header | prop `storeName`, desde el layout de `(store)` |
| Footer (nombre, frase, copyright) | prop `settings` |
| `og:site_name`, `og:title`, `twitter:title` de la home | `generateMetadata` de `app/(store)/page.tsx` |
| `og:site_name` de **cada ficha** | `generateMetadata` de `app/(store)/producto/[slug]/page.tsx` |
| La imagen que se ve al compartir | `app/opengraph-image.tsx` |
| *Fallback* del hero sin bloque editorial | `app/(store)/page.tsx` |

**Reglas que no se rompen:**

1. **La metadata de la tienda va en `app/(store)/layout.tsx`, NO en el layout raíz.** El raíz envuelve también `/admin`, que es `force-dynamic`: una consulta allí se paga en cada render del panel. El raíz solo conserva `metadataBase`, que es infraestructura.
2. **No añadas un valor por defecto cuando `tagline` sea `null`.** `null` significa «la tienda no publica descripción», y entonces no se pinta ninguna. Poner «Vive a tu propio ritmo.» de vuelta en el código deshace el incremento entero.
3. **No conviertas `getStorefrontSettings` en una consulta por consumidor.** Es `cache()` de React: `generateMetadata` y el render del layout comparten el resultado dentro de la misma petición. Ese es el motivo de que esto no cueste ni una consulta más, y de que `/` siga saliendo `○ (Static)` en el build.
4. **Si tocas `app/opengraph-image.tsx`, no le quites el `export const revalidate = 300`.** Sin él vuelve a hornearse en el build y la imagen compartida se queda con la marca vieja. Y **`alt` tiene que seguir siendo una constante**: `generateImageMetadata` sirve para generar varias imágenes por ruta y añade un `?id=` a la URL (`node_modules/next/dist/docs/.../generate-image-metadata.md`).
5. **Guardar en Ajustes invalida la tienda entera** con `revalidateStorefront()`, y ahora **no es preventivo**: lo que cambia es el chrome de todas las páginas. No lo estreches a una ruta literal.

### 27.2 «¿Puede vender la tienda?» — un criterio, dos formas de cargarlo

- **El criterio** es `resolveSaleBlockers` (`lib/store/sale-status.ts`), puro y sin I/O. **Nadie más define qué bloquea una venta**, y hay un test que recorre `app/admin/(panel)/page.tsx`, `app/admin/(panel)/ajustes/page.tsx` y `app/(store)/checkout/page.tsx` y falla si alguna llama a `isWhatsAppConfigured` por su cuenta.
- **La carga** tiene dos formas y no es incoherencia:
  - `getSaleBlockers` (`lib/store/sale-status-data.ts`) hace las dos consultas. Lo usa quien **no** tiene los datos: el panel de inicio.
  - `/checkout` y `/admin/ajustes` llaman al criterio **directamente**, porque ya han cargado el número de WhatsApp y los métodos para pintarlos. **Medido**: un round-trip a Supabase cuesta ~85 ms, y usar `getSaleBlockers` en `/checkout` lo llevaba de 195 ms a 231 ms por contar algo que la página ya sabía.
- **En `/checkout` la lista de métodos ya viene filtrada por `is_active`**, así que su longitud *es* el número de métodos activos. No añadas un contador aparte.

### 27.3 Al cliente no se le cuenta cómo está configurada la tienda

`blocker.title` y `blocker.fix` son instrucciones **para el administrador**: dicen que falta el WhatsApp o que no hay métodos de entrega. En `/checkout` el cliente recibe un mensaje neutro y una salida al carrito, y **el carrito no se toca**. Hay un test que falla si `blocker.title`, `blocker.fix`, `blockers.map`, `SaleStatus` o el nombre de un código de bloqueo aparecen en esa página.

### 27.4 `/admin/ajustes` está ordenado por urgencia operativa, no por afinidad temática

Estado de venta → WhatsApp → Entrega → Identidad → solo lectura. El motivo es un móvil: lo que impide vender no puede estar al final del scroll, y al guardarlo hay que poder ver que se ha arreglado. Cada bloqueo del estado enlaza a `#whatsapp` o `#entrega` (`blocker.anchor`), y **un test comprueba que esas anclas existen** en la página — un ancla rota es invisible leyendo un solo archivo.

Si añades una sección, dale un `id`, `scroll-mt-20` y colócala por lo que cuesta que esté mal, no por dónde encaje mejor.

**Objetivos táctiles ≥ 44 px, y se mide el objetivo real.** Una casilla nativa mide 20 px por diseño del navegador: el objetivo es su `<label>` envolvente. Lo que sí era un fallo real y se corrigió aquí: el `<summary>` de «Editar» de cada método de entrega medía **20 px** —el interlineado de su texto— siendo el único gesto para cambiar lo que cobra la tienda.

### 27.5 GRANTs por columna: `settings` (0041), `products` y `product_variants` (0044)

**RLS decide qué FILAS se ven, no qué columnas.** Para esconder una columna del cliente el mecanismo es revocar el SELECT de tabla a `anon` y concedérselo columna a columna.

Consecuencia que hay que tener presente al añadir una columna: **nace PRIVADA en esas tres tablas**. Si el escaparate la necesita, el `GRANT` va en la migración que la crea; si no, no se toca nada. Pedirla desde la tienda sin GRANT da **401 · 42501**, no una fila con `null`.

⚠️ **Las columnas del `WHERE` también necesitan el privilegio.** PostgreSQL lo exige sobre toda columna que aparezca en un filtro, no solo en la lista de salida: si olvidas `market_id`, `status`, `deleted_at`, `slug` o `is_active`, el escaparate entero da 401. Los tests de `supplier.integration.test.ts` llevan un control positivo por cada consulta pública real; mantenlos al día.

`create_order` y las demás RPC son `security definer`: se ejecutan con los privilegios del propietario y **no** dependen de estos GRANTs.

### 27.6 `btrim` no recorta lo que crees

La 0042 escribió `btrim(store_name) <> ''` para «no puede quedarse en blanco». **`btrim(x)` sin segundo argumento recorta SOLO el carácter espacio**, así que un valor hecho de un tabulador y un salto de línea la pasaba — lo cazó su propio test de integración con la migración ya aplicada, y lo corrige la 0043.

El equivalente de `String.prototype.trim()` en PostgreSQL es `x ~ '[^[:space:]]'`: «contiene al menos un carácter que no es espacio en blanco». Úsalo siempre que la validación de TypeScript use `.trim()`, para que las dos barreras digan lo mismo.

### 27.7 Meta Ads: dónde queda enganchado

La cadena `anuncio → landing → producto → carrito → checkout → pedido` ya está completa y **no hace falta tocarla** para añadir el Pixel: la atribución *first touch* se captura en `AttributionCapture` y se persiste en `orders.attribution` (incremento 14, DEC-069). Los puntos exactos de disparo de cada evento están en `docs/12-ATTRIBUTION.md` §8.

Lo que este incremento aporta a eso es la **puerta de la configuración**: un `meta_pixel_id` o un token de la Conversions API van en `settings`, y desde la 0041 **nacen privados** — hay que decidir a propósito si algo se abre a `anon`. El consentimiento sigue siendo una decisión de negocio sin tomar: no la inventes.

---

## 28. Logo, estado de venta accionable y los DOS límites de subida (Incremento 17)

**Lee esto antes de tocar el logo, `SaleStatus`, `app/opengraph-image.tsx` o cualquier límite de tamaño de subida.**

### 28.1 El logo: sin migración, y el ORDEN es la garantía

Todo lo que hacía falta existía ya: `settings.logo_url` (0013), el bucket `content` con lectura pública y escritura `is_admin()` (0015), `checkImageUpload` con magic bytes y la recodificación con `sharp` (Fase 8). **Este incremento no añade ni una migración**, y si tocas esta zona no hace falta ninguna.

**El orden de la sustitución no es un detalle de implementación, es la garantía:**

1. Subir el objeto **nuevo** (uuid nuevo; nunca sobrescribe).
2. Escribir `settings.logo_url`.
3. Borrar el **anterior**, best-effort.

Si (2) falla se descarta el objeto nuevo y **el logo anterior sigue publicado**. Si (3) falla queda un huérfano de kilobytes. **No inviertas el orden**: borrar primero abre una ventana con `logo_url` apuntando a un objeto inexistente, es decir, la tienda entera con la imagen rota. `removeLogoAction` sí invierte el orden a propósito, porque ahí el estado final deseado es «sin logo».

⚠️ **Ventana que no se puede cerrar**: si el proceso muere entre (2) y (3), el objeto viejo queda huérfano. No hay transacción entre Storage y PostgreSQL, y un `try/finally` no la crea — solo lo aparenta. Está documentado como riesgo, igual que en las imágenes de catálogo (DEC-036).

**Cada subida escribe una ruta NUEVA, y hay una razón medida:** tras borrar un objeto, **su URL pública sigue devolviendo 200** un rato, porque la sirve un CDN por delante de Storage. Si sustituyeras escribiendo en la misma ruta, el cliente seguiría viendo el logo anterior y el administrador no tendría forma de arreglarlo desde el panel. Por eso `buildLogoPath` mete un uuid. Y por eso, **cuando compruebes que un objeto ha desaparecido, pregúntale a la API de Storage (`object/list`), no a la URL pública** — hay un helper `objectExists` en `logo.integration.test.ts`.

**`isLogoPath` se comprueba antes de borrar.** La RLS de Storage solo mira que seas admin, no de qué es el objeto: sin esa comprobación, un `logo_url` manipulado en la base de datos haría que sustituir el logo borrase una foto del catálogo.

`logo_url` guarda la **ruta**, no la URL, igual que `product_images.url`. `getPublicUrl` es una operación de cadena, sin red: resolverla no cuesta ninguna petición.

**Nada de `service_role`.** Escribe la sesión del admin; autoriza `admin_write_content_bucket`.

### 28.2 `next/og` NO sabe leer WebP

El logo se guarda en WebP. Pasarlo a `ImageResponse` como data URI WebP devuelve **500** con `TypeError: u2 is not iterable` — el detector de formatos de Satori se va por la rama del SVG y revienta. Comprobado en su código compilado (`node_modules/next/dist/compiled/@vercel/og/index.node.js`).

Así que **se convierte a PNG con `sharp` antes de dárselo a `ImageResponse`**, y no es opcional. Si tocas esa ruta, no quites la conversión ni el `try/catch`: cualquier fallo tiene que caer al diseño tipográfico. Una tarjeta sin logo es peor que una con logo; **una tarjeta que no carga es peor que las dos**, y es la imagen que se ve al compartir la tienda en WhatsApp o en un anuncio.

### 28.3 Hay DOS límites de tamaño de subida, y los dos importan

`serverActions.bodySizeLimit` **no es el único**. Con `proxy.ts` presente —y lo hay—, Next clona y bufferiza el cuerpo con un tope propio: `proxyClientMaxBodySize`, **10 MB por defecto**.

Medido antes de arreglarlo, en el formulario real del catálogo:

    3 fotos × 4,84 MB = 14,5 MB → "Algo ha fallado", 0 imágenes subidas
    log: "Request body exceeded 10MB" + "Unexpected end of form"

Es decir: el lote de 5 fotos que promete la interfaz **nunca cupo**, y ni siquiera uno de 3 fotos de móvil, aunque cada archivo pasaba su validación de 5 MB. Mismo síntoma que el fallo de 1 MB que el incremento 7 creía haber cerrado.

**Los dos límites se derivan de `ACTION_BODY_LIMIT_BYTES`** y hay un test que lo comprueba. Si algún día subes `MAX_FILES_PER_BATCH` o `MAX_IMAGE_BYTES`, los dos suben solos. **No escribas un literal en ninguno de los dos.**

Y si mides una subida, ten presente cuál de los dos límites estás probando: por encima del de transporte no hay Server Action que valga y el mensaje amable no llega — el archivo ni siquiera se recibe entero.

### 28.4 El estado de venta se DECLARA una vez

`SALE_CHECKS` (`lib/store/sale-status.ts`) es la única declaración, y cada entrada lleva su predicado. De ahí salen las dos vistas:

- `resolveSaleChecklist(input)` → todas las comprobaciones con `passed`.
- `resolveSaleBlockers(input)` → `checklist.filter(no pasa)`.

**No añadas un segundo sitio donde se decida qué bloquea una venta.** Hay tests que comprueban que las dos coinciden exactamente y que `isWhatsAppConfigured` solo se evalúa en un punto del archivo.

⚠️ **No inventes comprobaciones para que la lista quede más llena.** Cada entrada tiene que poder fallar de verdad. «Configuración de envío válida» sería mentira: los importes negativos ya los rechaza PostgreSQL (0036), así que ese check jamás fallaría y solo añadiría un ✓ decorativo. Un test fija la lista en dos.

**Tono:** ni tecnicismos ni alarmismo. Rojo **solo** cuando el cliente no puede comprar. Nada de códigos SQL, nombres de columna ni `null` en pantalla — hay un test que recorre los textos. Y cuando la tienda vende, **cero botones**: «todo bien» no es una tarea.

### 28.5 Objetivos táctiles: se mide el objetivo, no el widget

Al medir los 44 px, distingue:

- un control **envuelto** por un `<label>` (la casilla, el selector de archivo) → el objetivo es el `<label>`;
- un control con un `<label>` **encima** que solo lo rotula (Nombre, Frase, Instagram…) → el objetivo es el control; ese rótulo de 20 px es texto, no un objetivo.

Medir los rótulos da un fallo inventado. El selector de archivo va envuelto en un `<label>` con altura propia justo por esto: el control nativo mide lo que quiere según el navegador.

### 28.6 Dos propiedades que ya se cumplen — compruébalas, no las «arregles»

**Réplicas.** Dos productos públicos distintos pueden apuntar al mismo artículo externo: misma `supplier_ref`, proveedores distintos o iguales. Lo único único sigue siendo el `sku`. Desde la 0044 el cliente no puede leer ninguna de las dos columnas. **No crees una entidad `suppliers` ni un campo `replica`.**

**Precio histórico.** `order_items` es un snapshot completo (`product_name`, `color_name`, `size_label`, `sku`, `unit_price`, `quantity`, `line_total`) y `variant_id` es `on delete set null`. Cambiar el precio o el nombre del producto **no toca** un pedido ya hecho. Esa es la condición que tendrán que cumplir las promociones: **ya se cumple**, así que cuando lleguen, una promoción escribe un `unit_price` rebajado en la línea y no hace falta ninguna columna nueva en `order_items`.

### 28.7 Meta Ads: qué está listo y dónde engancha

La cadena completa está verificada de punta a punta: las siete claves (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`, `landing_path`) llegan de la URL al `sessionStorage` y de ahí a `orders.attribution` (DEC-069). **No hace falta tocar nada de eso para añadir el Pixel**; los puntos exactos de disparo están en `docs/12-ATTRIBUTION.md` §8.

Lo que aporta la configuración: un `meta_pixel_id` o un token de la Conversions API van en `settings`, y desde la 0041 **nacen privados** — hay que decidir a propósito si algo se abre a `anon`. El consentimiento sigue siendo una decisión de negocio sin tomar: no la inventes.

## 29. Creación de producto asistida por IA (Incremento 20) — LEER ANTES DE TOCARLO

**La IA propone. El administrador decide.** Si sales de aquí con una sola frase, que sea esa.

### 29.1 Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `lib/ai/product-assistant.ts` | **El contrato y la lógica pura.** Lista blanca, lista negra, saneado, instrucciones. Sin I/O: corre bajo `node --test`. |
| `lib/ai/anthropic-assistant.ts` | El adaptador sobre la API de Claude. `server-only`. Devuelve fallos tipados; **nunca lanza**. |
| `lib/ai/assist-state.ts` | El estado inicial de la pantalla. Está fuera de la action **a propósito** (ver 29.5). |
| `app/admin/(panel)/catalogo/nuevo/ai-actions.ts` | La Server Action. **No escribe nada y no puede.** |
| `components/admin/NewProductFlow.tsx` | La pantalla: foto, cuatro campos y lo demás plegado. |
| `app/admin/(panel)/catalogo/actions.ts` → `createProductWithPhotoAction` | Crea el producto **en borrador** y sube la foto en el mismo envío. |

### 29.2 Lo que se puede ver en una foto, y lo que no

`SUGGESTABLE_FIELDS` y `FORBIDDEN_FIELDS` no son una preferencia de producto: son la frontera entre observar e inventar.

```
SE VE      nombre, descripción corta, descripción, categoría, color aparente, palabras clave
NO SE VE   composición, materiales, gramaje, cuidados, tallas, precio, stock,
           proveedor, referencia, origen, certificaciones, plazos de entrega
```

Los campos prohibidos **no existen en `ProductSuggestion`**. No es un filtro que se aplica después: es que no hay dónde ponerlos. **Si añades uno a la lista blanca, estás decidiendo que se puede deducir de una fotografía** — y hay un test que comprueba que ningún campo está en las dos listas, que el esquema JSON no declara ninguno prohibido, y que las instrucciones enumeran cada prohibición con su motivo.

### 29.3 Nada se acepta sin comprobarlo contra el catálogo real

`normalizeSuggestion` **no se fía de nada**. La respuesta de un modelo puede venir con tipos absurdos, campos de más o una categoría que no existe:

- `categorySlug` y `colorName` se buscan **en el catálogo de verdad**; si no están, el campo queda `null`. Nunca se crea una categoría fantasma.
- «no determinado», «n/a», «null» y «unknown` escritos como texto **son `null`**: es la misma respuesta.
- Los textos se recortan al límite y se normaliza el espacio.
- Basura entera (`null`, un número, un array) → todo sin determinar, **nunca una excepción**.

`null` **es un resultado correcto y se dice en la pantalla**. Rellenar a ciegas lo que no se ve es el fallo que esto evita.

### 29.4 La IA no escribe. Lo garantiza lo que NO está importado

`ai-actions.ts` no importa ningún cliente de Supabase, no recibe ningún id y no revalida nada. `requireAdmin()` va **antes** de leer la imagen. Hay tests que leen el archivo y fallan si aparece `.insert(`, `.rpc(`, `revalidatePath`, `supabase/server`, `supabase/admin` o cualquiera de las palabras `customer`, `order`, `phone`, `email`, `address`, `supplier`.

**Si necesitas que el asistente haga algo que escriba, no es el asistente: es una Server Action nueva del catálogo, con su `requireAdmin()` y su RLS.** No amplíes esta.

### 29.5 ⚠️ `"use server"` solo exporta funciones async

Exportar `ASSIST_IDLE` (un objeto) desde `ai-actions.ts` rompía el módulo en el servidor:

```
A "use server" file can only export async functions, found object.
```

Con el grafo roto, **el formulario de crear producto no llegaba a enviarse**: sin error en pantalla, sin navegación y sin producto. El síntoma no señalaba a la causa. Por eso el estado inicial vive en `lib/ai/assist-state.ts`. Si añades cualquier constante a un archivo de actions, esto vuelve.

### 29.6 Rellenar un campo controlado desde un E2E

`el.value = x` **no vale** con React: guarda el valor anterior en el nodo y, al no ver un evento suyo, vuelve a pintar el viejo. Hay que llamar al setter nativo del prototipo y disparar `input` (en `<input>`/`<textarea>`) o `change` (en `<select>`). Con el `<select>` mal rellenado, el `required` bloqueaba el envío **en silencio** y el E2E concluía «no se crea el producto» cuando lo que fallaba era el propio E2E.

Y `offsetParent !== null` **no sirve** para saber si algo se ve dentro de un `<details>` cerrado: Chrome lo oculta con `content-visibility` sobre `::details-content` y el elemento conserva `offsetParent`. Usa `checkVisibility()`.

### 29.7 El asistente es un acelerador, nunca una dependencia

Sin `ANTHROPIC_API_KEY`, `isConfigured()` es `false`, el botón sale desactivado y la pantalla lo dice: «Asistente no configurado: rellena la ficha a mano». **Crear un producto funciona exactamente igual.** Con clave inválida, timeout o respuesta ilegible, el adaptador devuelve un fallo tipado y la pantalla enseña qué hacer, sin jerga ni códigos del proveedor. Medido: con una clave que no vale, el proveedor responde 401, el log dice `[ai] fallo del proveedor { name: 'Error', status: 401 }` **sin el prompt**, y el formulario sigue guardando.

### 29.8 Qué NO hay, y es deliberado

Ni chatbot, ni asistente conversacional, ni ventana flotante, ni agente autónomo. Ni columnas `ai_*`, ni tabla de prompts, ni historial de sugerencias. Ni un «AI SDK» genérico: hay **un** puerto (`ProductAssistant`) con dos métodos, y existe porque cambiar de proveedor no debe tocar la pantalla.
