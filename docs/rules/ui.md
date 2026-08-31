# Reglas — UI / Design System

> Obligatorias al crear o modificar interfaz. Contexto: `04-UX-UI.md`, identidad en `docs/context/PROJECT-CONTEXT.md`.

## Tokens

1. Solo tokens definidos en `globals.css` (`@theme`). Prohibido hex/px arbitrarios en clases utilitarias.
2. Nuevos tokens (color, espaciado, radio) = actualización de `04-UX-UI.md` §2 en la misma tarea.
3. Tipografía: escala documentada; sin tamaños sueltos fuera de ella.

## Uso del rojo (regla de marca)

4. Rojo SOLO en: CTA primario, precio/descuento, badges, estado activo/seleccionado.
5. Máx. un CTA primario rojo por pantalla. Acciones secundarias: outline negro o ghost.
6. Verde WhatsApp reservado al botón/icono de WhatsApp.

## Componentes

7. Antes de crear un componente, buscarlo en `components/ui/`. Si no existe y es reutilizable → crearlo ahí con API por props tipadas.
8. Todo componente soporta los tres estados cuando aplica: loading/vacío/error.
9. Variantes vía prop `variant`, no componentes duplicados (`Button` con variants, no `ButtonRed` + `ButtonBlack`).
10. Sin estilos inline salvo valores dinámicos calculados (posiciones, colores de swatch desde datos).

## Layout y responsive

11. Mobile-first: escribir primero las clases base (móvil) y escalar con `sm:`/`md:`/`lg:`.
12. Contenido público max-width 1200px centrado en desktop.
13. Respetar safe-area iOS en bottom nav (`env(safe-area-inset-bottom)`).

## Interacción

14. Feedback inmediato a toda acción (< 100ms): hover/active states, transiciones 150–250ms.
15. Errores de formulario inline junto al campo; nunca solo toast ni popup.
16. Modales/drawers: cierre por backdrop + Escape + botón visible.

## Contenido

17. Imágenes siempre con dimensiones/reserva de espacio (evitar CLS).
18. Textos visibles desde módulo i18n centralizado (DEC-013); copy comercial desde BD.
19. Nada de popups automáticos, banners apilados o elementos que empujen el contenido al cargar.