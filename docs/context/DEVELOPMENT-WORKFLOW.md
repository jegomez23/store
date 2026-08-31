# DEVELOPMENT-WORKFLOW — Flujo de trabajo obligatorio

> Todo agente (Claude Code, Cline, humano) sigue este workflow en cada tarea. No es opcional.

---

## Workflow estándar (12 pasos)

1. **Leer `CLAUDE.md`** — contrato global y mapa de contexto.
2. **Identificar el área afectada** por la tarea (frontend, base de datos, seguridad, UI, admin…).
3. **Leer la documentación del área** según el mapa de lectura de CLAUDE.md + las reglas en `/docs/rules/<area>.md`.
4. **Leer `docs/context/CURRENT-STATE.md`** — ¿en qué fase estamos? ¿qué existe realmente?
5. **Revisar `docs/context/DECISIONS.md`** — ¿existe ya una decisión sobre esto? ¿hay decisiones Proposed que afecten la tarea?
6. **Inspeccionar el código existente** relacionado antes de escribir nada.
7. **Formular un plan breve** (qué archivos se crean/modifican y por qué).
8. **Implementar el cambio mínimo necesario.** Preferir `replace_in_file` a reescrituras completas.
9. **Ejecutar validaciones:** `npm run lint`, `npx tsc --noEmit`, tests si existen.
10. **Actualizar la documentación afectada** (ej.: cambio de schema → `03-DATABASE.md`; nueva pantalla → `05-ADMIN.md`).
11. **Actualizar `docs/context/CURRENT-STATE.md`** si la tarea cambia el estado del proyecto (nueva fase, funcionalidad completada, dependencia instalada).
12. **Registrar decisión en `DECISIONS.md`** solo si se tomó una decisión arquitectónica/de producto nueva o se cambió una existente.

---

## Prohibiciones explícitas

Un agente NO debe:

- ❌ Reescribir archivos completos cuando un cambio quirúrgico basta.
- ❌ Introducir dependencias sin justificarlas y registrarlas (regla: primero justifica en el plan; librería nueva = mención explícita al usuario).
- ❌ Cambiar arquitectura sin documentarlo en DECISIONS.md.
- ❌ Duplicar lógica existente (buscar antes con search/grep).
- ❌ Inventar datos comerciales (precios, productos, copy definitivo) — usar placeholders marcados como `[PENDIENTE]`.
- ❌ Ignorar RLS o proponer consultas que la burlen.
- ❌ Ignorar responsive design (todo componente nuevo debe funcionar mobile-first).
- ❌ Romper funcionalidad existente para implementar una nueva.
- ❌ Hardcodear: número de WhatsApp, precios, strings de UI, IDs de mercado.
- ❌ Usar APIs de Next.js < 16 (middleware, params síncronos, `next lint`, `images.domains`).

---

## Regla de sincronización código ↔ documentación

> **CODE IS THE SOURCE OF TRUTH FOR IMPLEMENTED BEHAVIOR.**
> **DOCUMENTATION IS THE SOURCE OF TRUTH FOR INTENDED ARCHITECTURE AND PRODUCT DECISIONS.**

Si detectas contradicción entre código y documentación:

1. Detecta y nombra la contradicción explícitamente.
2. NO asumas cuál es la correcta.
3. Determina cuál está desactualizada (revisa git history, CURRENT-STATE, fase actual).
4. Si es evidente (ej.: doc describe algo nunca implementado), corrige la desactualizada e indícalo en el reporte.
5. Si requiere decisión de producto/arquitectura, detente y propón opciones al usuario. Documenta la cuestión como pendiente.

Prohibido dejar documentación obsoleta deliberadamente ("ya lo arreglaré después").

---

## Definición de "tarea no trivial"

Requiere el workflow completo (incluido plan antes de codificar):

- Crear/eliminar tablas, columnas o políticas RLS.
- Crear rutas/páginas nuevas.
- Crear componentes reutilizables del design system.
- Modificar flujos de compra, carrito o pedidos.
- Añadir dependencias.
- Cambiar configuración (`next.config.ts`, `tsconfig.json`, ESLint).

Tareas triviales (typo en comentario, ajuste de clase Tailwind puntual) pueden saltarse pasos 3–7 pero NUNCA 9–12.

---

## Checklist final de toda tarea

```
[ ] Lint pasa            (npm run lint)
[ ] TypeScript pasa      (npx tsc --noEmit)
[ ] Tests pasan          (si existen)
[ ] Diff revisado        (solo cambios necesarios)
[ ] Docs afectadas actualizadas
[ ] CURRENT-STATE.md actualizado (si aplica)
[ ] DECISIONS.md actualizado (si hubo decisión)
```
