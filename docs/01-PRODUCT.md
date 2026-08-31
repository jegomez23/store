# 01 — PRODUCT: Definición de producto YI

> Qué construimos, para quién y con qué reglas comerciales. La identidad de marca vive en `docs/context/PROJECT-CONTEXT.md`; este documento añade el detalle funcional y comercial.

---

## 1. Propuesta de valor

YI es una tienda online directa (D2C) de **ropa, calzado y accesorios** con identidad *naturaleza + ciudad + streetwear*. Vende con fricción mínima: catálogo visual claro, selección rápida de variante y cierre por WhatsApp.

**Problema que resuelve:** el cliente quiere prendas urbanas con actitud y comprarlas sin procesos largos; la marca necesita vender desde el día uno sin construir un checkout complejo.

---

## 2. Alcance de la v1

| Incluido | No incluido (futuro) |
|---|---|
| Catálogo navegable (home, categorías, producto) | Checkout automatizado |
| Variantes color/talla con stock real | Cuentas de usuario finales |
| Carrito local persistente | Pagos online |
| Compra por WhatsApp con pedido registrado | Envíos calculados automáticamente |
| Panel de administración completo | Multi-idioma |
| Promociones visibles/automáticas | Programa de fidelidad |

---

## 3. Catálogo: estructura de categorías propuesta

> Estructura inicial sugerida, editable desde admin. Los nombres definitivos los aprueba Juan.

```
Ropa
├── Camisetas
├── Sudaderas / Hoodies
├── Pantalones
├── Chaquetas
└── Camisas
Calzado
├── Zapatillas
└── Botas
Accesorios
├── Gorras
├── Mochilas
├── Medias
└── Otros
```

Reglas de taxonomía: máximo 2 niveles (categoría → subcategoría), slug único por mercado, ver `DOMAIN-MODEL.md` → Category.

---

## 4. Ficha de producto: contenido requerido

Cada producto debe poder gestionar (todo editable desde admin):

- Nombre y slug.
- Descripción corta (tarjetas/listados) y completa (ficha).
- Categoría/subcategoría.
- Galería de imágenes con principal ordenable.
- Variantes color × talla con SKU, precio, precio anterior y stock individual.
- Materiales y cuidados.
- Información de envío (heredada del mercado, sobreescribible por producto).
- Flags: destacado, nuevo, activo/archivado.
- SEO: meta título y descripción (con fallback automático).

**Estados de disponibilidad visibles al cliente:** Disponible · Últimas unidades (umbral configurable) · Agotado (por talla/color).

---

## 5. Reglas comerciales v1

### Precios
- El precio vive en la **variante** (puede diferir por color/talla si el admin lo define).
- `compare_at_price` opcional → muestra "antes" tachado + badge de descuento %.
- Moneda según mercado: COP (CO) / EUR (ES). Formateo centralizado (`lib/money/`).

### Promociones
Tipos soportados: porcentaje, importe fijo, precio especial, código (ver limitación v1 en DOMAIN-MODEL), temporales, por productos o categorías seleccionadas.
- Se aplica siempre la promoción más favorable al cliente *(regla a confirmar por Juan)*.
- El precio final se calcula servidor-side; el carrito guarda snapshot informativo.

### Pedidos vía WhatsApp
- Flujo completo y plantillas de mensaje: `06-WHATSAPP.md`.
- El pedido se registra (`pending`) antes de abrir WhatsApp.
- Estados gestionados por el admin: pendiente → contactado → confirmado → pagado → preparando → enviado → entregado (+ cancelado).

### Envío
- Métodos configurables por mercado (nombre, precio, umbral gratis).
- En v1 el coste final se confirma en la conversación de WhatsApp.

---

## 6. KPIs sugeridos (medibles cuando exista tráfico)

| KPI | Definición | Fuente futura |
|---|---|---|
| Pedidos registrados | Count de orders por día/semana | BD |
| Tasa conversión WhatsApp | Pedidos pending / sesiones | Analytics |
| Ticket medio | Total medio de pedidos confirmados | BD |
| Producto más visto | Views por ficha | Analytics (Fase 12) |
| Stock agotado | Variantes con stock 0 activas | BD |

No se implementará tracking en v1 salvo analytics básico decidido más adelante.

---

## 7. Contenido pendiente de Juan (no inventar)

- [ ] Productos reales del lanzamiento (nombres, precios, fotos).
- [ ] Copy definitivo (hero, categorías, políticas).
- [ ] Logo y assets de marca.
- [ ] Números de WhatsApp reales por mercado.
- [ ] Métodos de envío y tarifas reales por mercado.
- [ ] Confirmación regla "promoción más favorable gana".
- [ ] Estrategia definitiva para códigos de descuento en v1.

---

## Referencias

- Identidad y tono: `docs/context/PROJECT-CONTEXT.md`
- Entidades y reglas: `docs/context/DOMAIN-MODEL.md`
- Experiencia de usuario: `04-UX-UI.md`
- Administración del catálogo: `05-ADMIN.md`