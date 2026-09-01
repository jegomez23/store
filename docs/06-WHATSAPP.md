# 06 — WHATSAPP: Flujo de compra por WhatsApp

> Especificación del canal de checkout v1. **IMPLEMENTADO en Fase 6** (2026-09-01) y validado contra el Supabase real. La abstracción que lo hace sustituible está decidida en DEC-007 (`CheckoutChannel`).
>
> **Dónde vive el código:** `lib/checkout/` (dominio, sin WhatsApp) · `lib/whatsapp/` (canal: `phone.ts`, `message.ts`, `channel.ts`) · `app/(store)/checkout/` (UI + Server Action) · migración `0018_checkout_create_order.sql` (la función que crea el pedido).

---

## 1. Flujo completo

```
PRODUCTO ──> VARIANTE (color/talla) ──> CARRITO
     │                                      │
     └──────────────┬───────────────────────┘
                    ▼
          GENERACIÓN DEL PEDIDO          ← Server Action: valida stock/precio,
                    │                      crea Order (pending) + OrderItems,
                    ▼                      crea/recupera Customer
              CheckoutChannel              ← interfaz única de checkout
                    │
             WhatsAppChannel            ← implementación v1
                    │
        URL wa.me + mensaje generado
                    │
                 WHATSAPP                ← el usuario envía el mensaje
                    │
           CONFIRMACIÓN HUMANA           ← negocio responde, ajusta detalles
                    │
                  PAGO                   ← transferencia/contraentrega/etc.
                    │
                  ENVÍO                  ← admin marca estados en /admin/pedidos
```

Puntos clave:
- El pedido se registra **antes** de abrir WhatsApp → existe trazabilidad aunque el usuario no envíe el mensaje.
- El número de WhatsApp sale de `settings.whatsapp_number` del mercado activo. **Prohibido hardcodearlo.**
- Re-validación server-side en la generación: precio real de BD, stock disponible, promociones vigentes. El carrito local es solo propuesta.

---

## 2. Plantillas de mensaje

### 2.1 Compra desde ficha de producto (1 ítem)

```
Hola 👋
Quiero realizar el siguiente pedido:

Producto:
Oversize Tee

Color:
Negro

Talla:
M

Cantidad:
1

Precio:
34,90 €

Total:
34,90 €
```

### 2.2 Compra desde carrito (N ítems)

```
Hola 👋
Quiero realizar el siguiente pedido:

1x Oversize Tee
Color: Negro
Talla: M
Precio: 34,90 €

1x Hoodie Essential
Color: Beige
Talla: L
Precio: 59,90 €

Total: 94,80 €
```

### Reglas de generación

- Formato de precio según locale del mercado (`es-CO` → `$ 89.900` COP; `es-ES` → `34,90 €`) vía `lib/money/`.
- **Fase 6 no aplica promociones ni envío** (`discount_total = 0`, `shipping_total = 0`): no están en las tareas de Fase 6 del roadmap y la regla "promoción más favorable gana" sigue pendiente de confirmación humana (`01-PRODUCT.md`). El mensaje solo imprime las líneas `Descuento:` / `Envío:` cuando esos importes son > 0, así que el código ya está preparado sin inventar reglas comerciales.
- Se añade al final una línea con el número de pedido para referencia cruzada:
  `Pedido: YI-ES-000001` (formato fijado en DEC-027).
- Mensaje construido por la función pura `buildOrderMessage(order, market)` — testeable sin red ni BD. Recibe un `TrustedOrder` (datos ya resueltos por PostgreSQL), **nunca el carrito del cliente**: si el usuario manipuló el precio en localStorage, el mensaje sigue diciendo el precio real.
- `Intl` separa el importe del símbolo con un espacio duro (U+00A0): `34,90 €`. Es correcto y llega intacto a WhatsApp.
- Encoding: `encodeURIComponent` sobre el texto; URL final `https://wa.me/<numero>?text=<mensaje>`.

### 2.3 Ejemplo con descuento (propuesta)

```
1x Oversize Tee
Color: Negro
Talla: M
Precio: 39,90 €
Descuento: -10%
Precio final: 35,91 €
```

---

## 3. Abstracción CheckoutChannel

```ts
// lib/checkout/types.ts (Fase 6)
interface CheckoutInput {
  items: { variantId: string; quantity: number }[];
  // Obligatorios: orders.customer_id y customers.phone son NOT NULL (DEC-030).
  customer: { name: string; phone: string };
  // UUID v4 por intento de checkout — idempotencia (DEC-028).
  clientRequestId: string;
  sourceUrl?: string;
}

// Union discriminada: o hay pedido confiable, o hay error (lib/checkout/types.ts).
type CheckoutResult =
  | { ok: true; order: TrustedOrder; redirectUrl: string }
  | { ok: false; error: CheckoutErrorCode; message: string };

// Códigos implementados (lib/checkout/errors.ts):
// EMPTY_CART · INVALID_INPUT · INVALID_CUSTOMER_PHONE · INVALID_CUSTOMER_NAME
// MARKET_UNAVAILABLE · VARIANT_NOT_FOUND · VARIANT_INACTIVE · PRODUCT_UNAVAILABLE
// WRONG_MARKET · OUT_OF_STOCK · IDEMPOTENCY_KEY_REUSED
// CHECKOUT_NOT_CONFIGURED · ORDER_CREATION_FAILED · SERVER_ERROR

interface CheckoutChannel {
  submitOrder(input: CheckoutInput): Promise<CheckoutResult>;
}
```

- `WhatsAppChannel.submitOrder()`: delega en `create_order` (PostgreSQL, una sola transacción → Order(pending) + items snapshot + customer upsert + decremento de stock con guard atómico) y después construye el mensaje y devuelve `redirectUrl`. **El canal no valida ni calcula precios**: solo traduce un pedido confiable a un enlace de WhatsApp.
- UI llama SOLO a `getCheckoutChannel()` (factory). Hoy devuelve `WhatsAppChannel`; mañana `OnlinePaymentChannel` sin tocar componentes.
- Errores tipados → mensajes UX claros ("Alguien compró la última unidad…", etc.).

## 4. Manejo de casos límite

| Caso | Comportamiento |
|---|---|
| Carrito vacío | CTA deshabilitado; no se genera pedido |
| Variante agotada entre visita y compra | Error `INSUFFICIENT_STOCK`; se indica cuál; carrito sugiere ajustar cantidad |
| Precio cambió | Se usa precio BD actual; si difiere del snapshot se avisa antes de generar |
| Usuario no envía el mensaje | Pedido queda `pending`; admin lo ve y puede contactar |
| Número WhatsApp mal configurado | Validación en admin (regex E.164); en runtime error visible en logs |

## 5. Confirmación y cierre (lado negocio)

1. Llega mensaje con pedido numerado.
2. Negocio confirma disponibilidad, pago y envío por chat.
3. Admin registra la evolución en `/admin/pedidos/[id]`: contacted → confirmed → paid → …
4. El stock ya fue decrementado al generar el pedido; cancelación lo restaura (acción explícita).

## 6. Futuro: OnlinePaymentChannel

Misma interfaz. Diferencias: crea Order + sesión de pasarela (Stripe/Wompi), `redirectUrl` apunta al pago; webhook confirma pago → estado `paid` automático SOLO entonces. Sin cambios en UI, carrito ni dominio. Decisión de proveedor: pendiente (ver DECISIONS.md).