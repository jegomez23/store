# 04 — UX-UI: Design System y experiencia de usuario

> Dirección artística y reglas de interfaz. La identidad vive en `docs/context/PROJECT-CONTEXT.md`. Los tokens de esta sección están **implementados** en `app/globals.css` desde Fase 1 (ajustables si la dirección de arte cambia); los componentes de `components/ui/` (§3) se completan en Fase 2.

---

## 1. Principios de diseño

1. **Claridad ante todo** — entender la tienda en < 5 segundos.
2. **Mobile-first real** — diseñar en 375px primero; desktop adapta.
3. **La foto vende** — imagen protagonista, texto mínimo.
4. **Un CTA primario por pantalla** — el rojo marca dónde mirar.
5. **Silencio visual** — sin popups, sin banners apilados, sin ruido.

---

## 2. Design Tokens (propuesta para `@theme`)

### Color

| Token | Valor propuesto | Uso |
|---|---|---|
| `--color-cream` | `#F7F3EC` | Fondo principal |
| `--color-cream-dark` | `#EFE9DE` | Superficies alternas, cards |
| `--color-black` | `#111111` | Texto principal, header, footer |
| `--color-gray-700` | `#4A4A48` | Texto secundario |
| `--color-gray-400` | `#9C9890` | Placeholders, bordes suaves |
| `--color-line` | `#E3DDD2` | Bordes, divisores |
| `--color-red` | `#D92B1F` | **Acento único**: CTAs, precios, badges, activos |
| `--color-red-dark` | `#B01F15` | Hover del acento |
| `--color-white` | `#FFFFFF` | Cards sobre crema, inputs |

Regla del rojo: máx. ~5% de la superficie visible. Prohibido como fondo de secciones completas o texto largo.

### Tipografía

| Token | Fuente | Uso |
|---|---|---|
| Display | Geist Sans (ya instalada) peso 600–800, tracking tight | H1–H3, precios, logo |
| Body | Geist Sans 400–500 | Párrafos, labels |
| Mono | Geist Mono | SKU, códigos (admin) |

**Decisión (Fase 2, ver DEC-016):** se evaluó y se decidió **mantener Geist Sans**, sin instalar tipografía externa. Geist es neutra, geométrica y con rango de pesos suficiente (400–800) para dar peso editorial a headlines (`font-bold tracking-tight`) sin caer en estética corporativa ni en exceso gráfico tipo graffiti (riesgo explícito a evitar). La "actitud" de marca se expresa vía peso/tracking/espaciado y no vía cambio de tipografía — más simple, cero dependencia nueva, cero riesgo de red en build (`next/font/google` la autohospeda).

Escalas móviles: H1 28–32px · H2 22–24px · H3 18px · body 15–16px · caption 13px. Desktop +2–4px por nivel.

### Espaciado / radios / sombras

- Escala 4px: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- Radios: `sm 6px` (inputs) · `md 10px` (cards) · `full` (pills, botones).
- Sombras: mínimas; jerarquía por fondo/borde, no por blur.

### Iconografía

- Set inline SVG propio (stroke 1.5–2px, esquinas redondeadas) — sin dependencia de librerías.
- Iconos requeridos v1: menú, carrito, búsqueda (futuro), cerrar, chevron, WhatsApp, envío, más/menos cantidad.

---

## 3. Componentes del Design System

> Estado real por componente — no confundir con lo planeado. `components/ui/` = primitivos puros; `components/store/` = compuestos de dominio (props tipadas, sin fetch de datos).

| Componente | Carpeta | Estado | Notas |
|---|---|---|---|
| Button | `ui/` | ✅ Implementado | variantes `primary` (rojo) / `secondary` (negro outline) / `ghost` / `whatsapp` (verde `#25D366`, token `--color-whatsapp`); h-12 móvil / h-11 desktop |
| Badge | `ui/` | ✅ Implementado | prop `tone`: `neutral` / `accent` (rojo) — genérico, sin variantes de negocio (new/discount/sold-out se expresan componiendo `tone="accent"` + texto) |
| Container | `ui/` | ✅ Implementado | max-width 1200px, padding responsive |
| Divider | `ui/` | ✅ Implementado | `<hr>` con `border-line` |
| SectionHeading | `ui/` | ✅ Implementado | título (h2) + subtítulo opcional |
| MockImage | `ui/` | ✅ Implementado (temporal) | placeholder visual (gradiente) para huecos de imagen — sustituir por `next/image` real en Fase 4 |
| icons (Menu/Close/Cart/Chevron/Home/Grid) | `ui/icons.tsx` | ✅ Implementado | SVG inline propios, sin librería |
| ProductCard | `store/` | ✅ Implementado (con mocks) | imagen 3:4, nombre, precio (vía `lib/money/format.ts`), badge "Nuevo" |
| VariantPicker | `store/` | ✅ Implementado (visual, sin carrito) | swatches de color + pills de talla, estado local (`useState`), `aria-pressed`, tallas agotadas deshabilitadas |
| Header / BottomNav / Footer | `store/` | ✅ Implementado | shell de tienda — ver §4 |
| PriceTag | — | ❌ No creado | absorbido por el precio inline en `ProductCard`/ficha; crear como componente propio si se repite más lógica |
| QuantityStepper | — | ❌ No creado | Fase 5 (carrito) |
| Input / Select / Textarea | — | ❌ No creado | sin formularios reales todavía |
| Sheet/Drawer genérico | — | ⚠️ Parcial | el drawer de menú vive inline en `Header.tsx`; no es un primitivo reutilizable todavía — extraer si aparece un segundo caso de uso (carrito, Fase 5) |
| Skeleton / Toast / EmptyState | — | ❌ No creado | sin datos async ni acciones que fallen todavía (Fase 3+) |

Regla: todo componente nuevo entra primero aquí si es reutilizable; los específicos van a `components/store/` o `components/admin/`.

---

## 4. Navegación

### Móvil (< 768px)

```
┌─────────────────────────────┐
│ ☰          YI           🛍(2)│  ← Header fijo: menú, logo centrado, carrito
├─────────────────────────────┤
│                             │
│         CONTENIDO           │
│                             │
├─────────────────────────────┤
│  Inicio   Categorías  Carrito│  ← Bottom nav fijo (safe-area iOS)
└─────────────────────────────┘
```

- Menú hamburguesa → drawer lateral. **Implementado (Fase 2) con alcance reducido:** Inicio + Categorías (ancla a `#categorias` en home); promociones/redes/info legal se añaden cuando existan páginas reales que enlazar.
- Bottom nav: 3 items v1 (Inicio / Categorías / Carrito). **Implementado.** Categorías enlaza a `#categorias`; Carrito es un botón visual `disabled` (sin carrito real — Fase 5). Sin "Buscar" hasta que haya volumen de catálogo que lo justifique.

### Tablet y Desktop (≥ 768px)

**Implementado con un único breakpoint `md:` (768px)** en vez de tablet/desktop separados — simplificación deliberada de Fase 2 (grids ya se ven bien a 768px con 4 columnas; no había contenido que justificara un estado intermedio). Revisar si hace falta un breakpoint `lg:` adicional cuando exista catálogo real con volumen (Fase 4).

- Header horizontal desde 768px: logo izquierda, nav de categorías centro, carrito derecha; bottom nav desaparece.
- Home: hero centrado + secciones en grids (categorías 5 columnas, destacados 4 columnas) desde `md:`.
- Ficha de producto: `md:grid-cols-2` (galería izquierda / info derecha), sin sticky todavía.
- Footer con políticas/redes como texto (sin páginas reales que enlazar aún).
- Contenido max-width 1200px centrado (`Container`).

---

## 5. Flujos clave (happy path)

> Estado real Fase 2: la navegación Home → ficha de producto **funciona** con datos mock. Selección de color/talla es visual (estado local). Los CTA de compra (`COMPRAR POR WHATSAPP`, `Añadir al carrito`) están **deshabilitados a propósito** — sin carrito ni WhatsApp funcional todavía (Fases 5–6).

### F1 — Compra directa desde producto (parcial — navegación real, CTA deshabilitado)
```
Home → tap producto → ficha → elegir color → elegir talla
     → [COMPRAR POR WHATSAPP] (deshabilitado, Fase 6 lo activa)
```

### F2 — Compra desde carrito (no implementado)
```
Ficha → [Añadir al carrito] (deshabilitado, Fase 5 lo activa)
```

### F3 — Exploración por categoría (simplificado en Fase 2)
```
Header/Bottom nav "Categorías" → ancla a sección Categorías de Home
```
No existe todavía `/categoria/[slug]` como listado real (Fase 4); los chips de categoría en Home son visuales, no enlazan a una página propia.

### Estados de variante en ficha (implementado)
- Talla disponible: pill outline → activo: relleno negro + borde rojo. ✅
- Talla agotada: pill atenuada + tachada, no seleccionable (`disabled`). ✅
- Sin talla elegida: micro-mensaje inline "Elige tu talla". ✅ (el CTA ya está deshabilitado por no-funcional, no por validación de talla — eso se activa en Fase 6)

---

## 6. Pantallas v1 (inventario)

| Pantalla | Ruta | Prioridad | Estado |
|---|---|---|---|
| Home | `/` | Alta | ✅ Implementada (Fase 2, datos mock: hero, categorías, destacados, sección conceptual, CTA) |
| Ficha producto | `/producto/[slug]` | Alta | ✅ Implementada (Fase 2, datos mock, `generateStaticParams`, CTA deshabilitados) |
| Listado categoría | `/categoria/[slug]` | Alta | ❌ No creada — Fase 4 |
| Carrito | `/carrito` (+ drawer) | Alta | ❌ No creada — Fase 5 |
| Confirmación pedido generado | `/pedido/[numero]` | Alta | ❌ No creada — Fase 6 |
| Info estáticas (envíos, devoluciones, contacto) | `/info/[slug]` | Media | ❌ No creada |
| Admin login | `/admin/login` | Alta (Fase 7) | ❌ No creada |
| Admin dashboard/productos/categorías/promos/pedidos/home/ajustes | `/admin/**` | Fase 7 | ❌ No creada |

Wireframes detallados se validarán visualmente en Fase 2 con datos mock.

---

## 7. Microcopy (tono YI)

| Contexto | Texto |
|---|---|
| CTA principal ficha | `COMPRAR POR WHATSAPP` |
| CTA secundario | `Añadir al carrito` |
| Carrito vacío | `Tu carrito está vacío.` + CTA `Ver productos` |
| Sin talla elegida | `Elige tu talla` |
| Últimas unidades | `¡Últimas unidades!` |
| Agotado | `Agotado` |
| Envío | `Envíos a todo {país}` *(copy final pendiente)* |

Español neutro; adaptaciones léxicas por mercado documentadas en `07-MULTI-MARKET.md`.

---

## 8. Accesibilidad mínima (obligatoria)

- Contraste AA en textos (el rojo sobre crema solo para elementos grandes/bold).
- Targets táctiles ≥ 44×44px.
- `alt` obligatorio en toda imagen de producto.
- Focus visible en navegación por teclado.
- Selectores de talla/color como botones reales con `aria-pressed`, no divs.