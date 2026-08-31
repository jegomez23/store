# Reglas — Frontend (React / Next.js 16)

> Obligatorias al escribir componentes o páginas. Contexto: `02-ARCHITECTURE.md`, `04-UX-UI.md`.

## Next.js 16 (crítico)

1. APIs de request SIEMPRE async: `const { slug } = await props.params` · `await props.searchParams` · `(await cookies()).get(...)`.
2. Usar type helpers generados: `PageProps<'/producto/[slug]'>`, `LayoutProps<"/">`. Ejecutar `npx next typegen` si no existen.
3. Prohibido: `middleware.ts` (usar `proxy.ts`), `next lint`, `images.domains`, acceso síncrono a params/cookies.
4. Ante duda de API: consultar `node_modules/next/dist/docs/` — nunca tutoriales de versiones antiguas.

## Componentes

5. Server Component por defecto. `'use client'` solo para: carrito, selectores variante, drawers, steppers, inputs interactivos.
6. `'use client'` lo más abajo posible en el árbol (hoja), nunca en layouts ni páginas completas.
7. Props explícitas con tipos; sin `any`. Componentes UI puros: datos entran por props.
8. Un componente = un archivo en su carpeta correspondiente (`ui/`, `store/`, `admin/`). Reutilizable → `ui/`.
9. Estados obligatorios en todo componente con datos: loading (skeleton), vacío (EmptyState), error.

## Estilos

10. Solo tokens del design system (`@theme` de globals.css). Prohibido hex arbitrario en clases (`bg-[#ff0000]` ❌).
11. Mobile-first: estilos base = móvil; breakpoints `md:`/`lg:` adaptan hacia arriba.
12. El rojo (`text-red`, `bg-red`) solo para: CTA primario, precio/descuento, badge, estado activo. Nunca fondos de sección ni textos largos.
13. Animaciones sutiles (150–250ms ease-out); prohibidas las que bloquean lectura o interacción.

## Imágenes y assets

14. Siempre `next/image` con `width/height` o `fill` + `sizes`; `priority` solo above-the-fold.
15. Iconos: SVG inline propios en `components/ui/icons/`. Sin librerías de iconos.

## Textos e i18n

16. Strings de UI desde el módulo centralizado (`lib/i18n/`) — prohibido hardcodear texto visible (DEC-013). Excepción temporal permitida durante Fase 2 marcando `// TODO(i18n)`.

## Dependencias

17. Nueva dependencia requiere: justificación escrita en el plan + aprobación + registro en CURRENT-STATE. Por defecto la respuesta es "no".
18. Prohibidas salvo decisión contraria: state managers externos (Zustand/Redux), animación (framer-motion), iconos (lucide/heroicons), UI kits (shadcn/MUI), zod (validar manual hasta justificar).

## Accesibilidad

19. Targets ≥ 44px · alt obligatorio · focus visible · selectores como `<button>` con `aria-pressed` · jerarquía h1→h3 sin saltos.