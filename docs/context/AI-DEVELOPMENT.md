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

## 9. `npm run build` ya no es un gate libre de contexto (desde Fase 4)

Home y `/producto/[slug]` hacen fetch real a Supabase en build-time (`generateStaticParams`, SSG+ISR — DEC-021). Esto significa:

- `npm run build` **requiere** `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` apuntando a un proyecto real y alcanzable con las migraciones/seed de `supabase/` aplicadas. Sin eso, el build falla — es el comportamiento correcto, no un bug a "arreglar" cambiando la estrategia de renderizado.
- Antes de reportar `npm run build` como passing, verificar que esas credenciales existen y son reales. Si no las hay, ejecutar igualmente `npm run lint` + `npx tsc --noEmit` (sí son libres de contexto) y documentar honestamente que el build no se pudo validar — nunca reportar un build en verde sin haberlo ejecutado de verdad.
- Un error de build que mencione `cookies()`, `fetch failed` o `supabaseUrl is required` casi siempre es esta limitación de entorno, no un defecto de código — pero verificarlo intentando avanzar (como se hizo en Fase 4: primero se encontró y corrigió un bug real de `cookies()` en `generateStaticParams`, y solo después de corregirlo se confirmó que lo único que faltaba era la red) en vez de asumirlo a la primera.