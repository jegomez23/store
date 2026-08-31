# 06 — WHATSAPP: Flujo de compra por WhatsApp

> Especificación completa del canal de checkout v1. Se implementa en Fase 6. La abstracción que lo hace sustituible está decidida en DEC-007 (`CheckoutChannel`).

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
- Si hay descuento por promoción, se muestra el precio final aplicado y una línea opcional `Descuento: -10%` *(formato exacto se fija en Fase 6)*.
- Se añade al final una línea con el número de pedido para referencia cruzada:
  `Pedido: YI-CO-000123` *(formato definitivo pendiente)*.
- Mensaje construido por función pura `buildOrderMessage(items, totals, market)` — testeable sin red ni BD.
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
  sourceUrl?: string;
  customer?: { name?: string; phone?: string };
}

interface CheckoutResult {
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  redirectUrl?: string;   // WhatsAppChannel → wa.me URL
  error?: 'EMPTY_CART' | 'VARIANT_UNAVAILABLE' | 'INSUFFICIENT_STOCK' | 'SERVER_ERROR';
}

interface CheckoutChannel {
  submitOrder(input: CheckoutInput): Promise<CheckoutResult>;
}
```

- `WhatsAppChannel.submitOrder()`: transacción servidor → Order(pending) + items snapshot + customer upsert + decremento de stock con guard → construye mensaje → devuelve `redirectUrl`.
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