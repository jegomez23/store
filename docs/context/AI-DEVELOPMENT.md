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

