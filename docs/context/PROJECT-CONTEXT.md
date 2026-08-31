# PROJECT-CONTEXT — Identidad y visión de YI

> Fuente de verdad sobre **qué es YI** como marca y producto. Cualquier agente que trabaje en UI, copy, SEO o decisiones de producto debe leer este archivo primero.

---

## 1. Identidad

| Campo | Valor |
|---|---|
| Nombre | **YI** |
| Tipo | Marca de ropa, calzado y accesorios (e-commerce D2C) |
| Concepto | Naturaleza + ciudad + streetwear + juventud + libertad |
| Filosofía | **"Vive a tu propio ritmo."** / **"Naturaleza + actitud."** |

### Lo que YI transmite

- Actitud, libertad, movimiento, juventud.
- Naturaleza y montaña.
- Ciudad, cultura urbana, streetwear.
- Individualidad e identidad personal.

### Lo que YI NO debe parecer

- Una tienda de montaña/outdoor tradicional.
- Una marca deportiva genérica.
- Una marca excesivamente sofisticada o de lujo distante.
- Una tienda genérica de dropshipping sin identidad.

**Síntesis:** una marca urbana conectada con la naturaleza. Premium pero accesible.

---

## 2. Audiencia

- Público joven, urbano, sensible a la estética streetwear.
- Personas que valoran individualidad y comodidad.
- Compra mayoritariamente desde móvil (mobile-first es obligatorio).
- Mercados iniciales previstos: **Colombia** y **España** (ver `07-MULTI-MARKET.md`).

> ⚠️ No se han definido buyer personas detalladas ni rangos de edad exactos. Pendiente de decisión humana (ver `DECISIONS.md`, decisiones abiertas).

---

## 3. Modelo comercial (v1)

```
CATÁLOGO → PRODUCTO → VARIANTE (color/talla) → CARRITO
   → COMPRAR POR WHATSAPP → CONFIRMACIÓN HUMANA → PAGO → ENVÍO
```

- La primera versión **no tiene checkout automatizado**: el cierre de venta ocurre por WhatsApp.
- El sistema debe estar preparado para sustituir WhatsApp por pago online sin reescribir la app (ver `06-WHATSAPP.md`, abstracción `CheckoutChannel`).
- Los precios, promociones y stock se gestionan desde el administrador (ver `05-ADMIN.md`).

---

## 4. Dirección visual

### Paleta conceptual

| Rol | Color | Uso |
|---|---|---|
| Fondo principal | Crema / blanco roto | Superficies, fondos de página |
| Color principal | Negro | Texto, header, elementos estructurales |
| Neutros | Grises | Texto secundario, bordes, superficies alternas |
| **Acento** | **Rojo** | SOLO estratégico (ver regla abajo) |

### Regla del rojo (crítica)

El rojo **NO domina la interfaz**. Se reserva para:

- CTAs principales ("Comprar por WhatsApp", "Añadir al carrito").
- Precios y descuentos cuando corresponda.
- Badges (Nuevo, -20%, Últimas unidades).
- Estados activos (talla/color seleccionado).
- Elementos que requieren atención inmediata.

### Elementos visuales de marca

- Fotografía de montaña y paisajes naturales.
- Texturas urbanas: concreto, graffiti, detalles gráficos de calle.
- Composición editorial: imagen grande protagonista, texto mínimo.
- Tipografía fuerte y moderna.

### Sensación objetivo

Moderna · Juvenil · Urbana · Limpia · Visual · Premium pero accesible · Sencilla · Rápida de entender.

**Anti-patrones visuales prohibidos:** popups invasivos, animaciones excesivas, información redundante, interfaces saturadas, más de un CTA primario por pantalla.

---

## 5. Tono de comunicación

- Directo, cercano, con actitud. Sin corporate speak.
- Español neutro adaptable por mercado (ver `07-MULTI-MARKET.md`).
- Microcopy corto: botones y etiquetas de 1–3 palabras siempre que sea posible.
- Ejemplos de voz: "Vive a tu propio ritmo", "Nuevos lanzamientos", "Envíos a todo el país" *(texto ilustrativo, pendiente de aprobación de copy final)*.

---

## 6. Experiencia objetivo (contrato de UX)

Una persona debe poder, en el menor número de pasos:

1. Entrar y entender qué vende YI (< 5 segundos).
2. Encontrar una categoría.
3. Encontrar un producto.
4. Ver sus imágenes.
5. Elegir talla y color.
6. Ver precio y disponibilidad claros.
7. Comprar por WhatsApp o añadir al carrito.

Detalle completo de flujos y pantallas: `04-UX-UI.md`.

---

## 7. Referencias cruzadas

| Tema | Documento |
|---|---|
| Arquitectura técnica | `02-ARCHITECTURE.md` |
| Modelo de negocio detallado | `01-PRODUCT.md` |
| Entidades del dominio | `DOMAIN-MODEL.md` |
| Decisiones tomadas | `DECISIONS.md` |
| Estado actual | `CURRENT-STATE.md` |