# 12 — ATRIBUCIÓN: de qué anuncio vino el pedido

> Incremento 14. Esquema en `03-DATABASE.md` §2.12 (`orders.attribution`), decisión en `DECISIONS.md` DEC-069, trampas en `AI-DEVELOPMENT.md` §25.
>
> Esto **no es analítica**. Es un campo del pedido que responde a una sola pregunta: *¿qué tráfico pagó esta venta?*

---

## 1. Qué se guarda

Siete claves, ni una más. Cualquier otra cosa que llegue se descarta en PostgreSQL.

| Campo | Qué significa | Ejemplo |
|---|---|---|
| `utm_source` | De dónde vino el clic | `instagram` |
| `utm_medium` | Tipo de tráfico | `paid`, `organic` |
| `utm_campaign` | Campaña | `lanzamiento` |
| `utm_content` | Creatividad concreta | `video1` |
| `utm_term` | Término/segmento | `oversize` |
| `fbclid` | Identificador de clic de Meta. Lo añade Facebook/Instagram solo | `IwAR…` |
| `landing_path` | Ruta —sin query— por la que se entró | `/producto/camiseta-sendero-oversize` |

Cada valor se recorta a **200 caracteres** y se le quitan los caracteres de control. **No se normaliza nada más**: `IG` no se convierte en `ig`, ni `Lanzamiento_Verano` en minúsculas. Cambiar la caja rompería la agrupación por campaña.

## 2. Qué NO se guarda, nunca

Nombre, teléfono, email, dirección, IP y user-agent. **No es una promesa, es la forma en que está construido**: `create_order` recorre una lista blanca de siete claves y tira el resto, así que un POST directo a la RPC —que `anon` puede hacer— tampoco puede meter otra cosa. El teléfono y el nombre del cliente viven en `customers`, que es su sitio.

Tampoco se guarda la URL completa de entrada: solo la ruta. Una query ajena puede traer cualquier cosa.

## 3. Semántica: FIRST TOUCH

Se guarda la **primera** campaña de la sesión y no se toca más.

```
?utm_source=instagram&utm_campaign=lanzamiento   ← se guarda esto
/producto/a  →  /producto/b  →  /checkout        ← navegación interna, no cambia nada
?utm_source=google&utm_campaign=otra             ← NO sobrescribe
```

El motivo: quien pagó la visita fue el primer anuncio. Con last-touch, alguien que llega por Instagram, se va y vuelve buscando la marca en Google le daría el mérito a Google — que no ha pagado nada. Si algún día hay varias campañas activas a la vez y se quiere comparar, esa es otra decisión y hay que medirla antes.

## 4. Cuándo empieza y termina la sesión

La sesión es la de `sessionStorage`: **una pestaña**. Empieza al abrir la tienda y termina al cerrar la pestaña.

- No hay cookies propias de seguimiento.
- No hay identificador persistente entre visitas.
- Otra pestaña es otra sesión y empieza de cero (verificado en Chrome).

Un cliente que vuelve mañana desde el mismo anuncio trae la atribución otra vez, porque viene con los parámetros en la URL.

## 5. Qué ocurre si no hay UTMs

Nada. `attribution` queda `NULL`, que es la forma de decir "directo u orgánico". El panel lo escribe como **«— directo»**. No se inventa un origen ni se guarda un objeto vacío que luego habría que interpretar.

## 6. Qué ocurre si el almacenamiento está bloqueado

El pedido se crea igual, sin atribución. Toda la captura y toda la lectura están dentro de `try/catch`, y la regla del incremento es literal:

> **ATRIBUCIÓN FALLIDA ≠ CHECKOUT FALLIDO.**

Lo mismo si el contenido guardado está corrupto, si alguien lo edita a mano, si llega un objeto de 4 MB o si los valores tienen tipos absurdos: se guarda `null` y la compra sigue. Verificado en Chrome sobre el build servido y contra Supabase real.

## 7. Cómo consultar ventas por campaña

`attribution` es `jsonb`, así que se agrupa con SQL normal. Ningún dashboard hace falta:

```sql
-- Pedidos y facturación por campaña (mercado ES, últimos 30 días)
select attribution ->> 'utm_source'   as source,
       attribution ->> 'utm_medium'   as medium,
       attribution ->> 'utm_campaign' as campaign,
       count(*)                       as pedidos,
       sum(total)                     as ventas,
       round(avg(total), 2)           as ticket_medio
from public.orders
where market_id = 'ES'
  and created_at >= now() - interval '30 days'
  and status <> 'cancelled'
group by 1, 2, 3
order by ventas desc nulls last;
```

Cambiando `utm_campaign` por `utm_content` sale el rendimiento por creatividad. Los pedidos directos aparecen con las tres columnas en `NULL`, que es exactamente lo que son.

**ROAS todavía NO se calcula**, y no se va a inventar: hace falta el coste publicitario real, que hoy no está en el sistema. Lo que hay arriba es el numerador.

## 8. Dónde se integraría Meta Pixel

Cuando se decida (queda FUERA de este incremento), estos son los puntos exactos:

| Evento | Dónde vive el disparo | Nota |
|---|---|---|
| `PageView` | `components/store/AttributionCapture.tsx` — ya se monta en el layout de la tienda en cada carga | Es el único sitio que hoy corre en todas las páginas públicas |
| `ViewContent` | `app/(store)/producto/[slug]/page.tsx` vía un componente cliente | Necesita id de producto y precio, que ya están en la página |
| `AddToCart` | `components/store/cart/AddToCartForm.tsx`, en `addSelectedToCart()` | Ya conoce variante, precio y cantidad |
| `InitiateCheckout` | `components/store/checkout/CheckoutForm.tsx`, al montar con carrito no vacío | — |
| `Purchase` | `CheckoutForm`, **cuando `submitCheckoutAction` devuelve `ok: true`** | ⚠️ El pedido ya EXISTE en ese punto, antes de abrir WhatsApp. Disparar `Purchase` al abrir WhatsApp contaría de menos: hay clientes que cierran la pestaña |

Un pedido `pending` no es un pedido pagado (`KNOWN-CONSTRAINTS`), así que `Purchase` mide **pedidos**, no cobros. Si eso importa, la alternativa es dispararlo desde el panel al marcar `paid` — lo que exige Conversions API (servidor), no Pixel.

## 9. Qué eventos puede soportar la arquitectura hoy

Todos los de la tabla anterior, sin cambios de arquitectura: el checkout ya es una Server Action con resultado tipado y el carrito ya es estado de cliente. Lo que **no** puede hacerse sin trabajo nuevo es la Conversions API: haría falta un endpoint de servidor y un identificador que hoy no se guarda (`fbc`/`fbp` se derivan del `fbclid`, que sí está).

## 10. Qué queda fuera, y es deliberado

- **Meta Pixel y Conversions API**: no se instalan aquí porque arrastran una decisión de privacidad/consentimiento que no está tomada.
- **Banner de consentimiento**: no existe. Hoy la tienda no pone cookies de terceros ni identificadores persistentes; `sessionStorage` es almacenamiento técnico de la propia sesión. **En cuanto entre el Pixel, esa afirmación deja de ser cierta** y hay que revisarlo antes.
- **Google Analytics, CRM, tablas de analítica, colas de eventos, dashboard de marketing**: fuera. La consulta SQL de §7 cubre la pregunta de negocio.
- **Atribución multicanal / multi-touch**: fuera. Es first-touch por decisión (DEC-069).
- **Coste publicitario y ROAS**: fuera hasta que el coste esté en el sistema de forma fiable.
