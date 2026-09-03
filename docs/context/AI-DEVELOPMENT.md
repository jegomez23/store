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
