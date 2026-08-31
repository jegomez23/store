# 07 — MULTI-MARKET: Estrategia Colombia / España

> Cómo una sola base de código sirve a dos mercados con reglas comerciales distintas. Decisión marco: DEC-008.

---

## 1. Principio rector

**Una aplicación, un esquema, N mercados.** El mercado es:

1. Una **dimensión de datos**: `market_id` en toda entidad comercial (productos, categorías, promociones, pedidos, envíos, contenido, settings).
2. Una **configuración de despliegue**: cada entorno (Vercel) apunta a un mercado vía variables de entorno.

Prohibido: duplicar apps (`/colombia-app`, `/espana-app`), duplicar componentes por mercado, o ramas separadas por país.

---

## 2. Qué puede variar por mercado

| Dimensión | Dónde vive | Ejemplo CO | Ejemplo ES |
|---|---|---|---|
| Moneda | `markets.currency_code` | COP | EUR |
| Locale/formato | `markets.locale` | es-CO | es-ES |
| Precios | `product_variants.price` (por ficha de mercado) | $ 89.900 | 34,90 € |
| Disponibilidad/productos | Filas de producto por market_id | Catálogo propio | Catálogo propio |
| WhatsApp | `settings.whatsapp_number` | +57… | +34… |
| Métodos de pago | Futuro: config por mercado | Efectivo/transferencia | Tarjeta/Bizum (Fase 11) |
| Envíos | `shipping_methods` por market | Nacionales | Península/Baleares |
| Promociones | `promotions.market_id` | Independientes | Independientes |
| Contenido home | `home_content.market_id` | Hero propio | Hero propio |
| Políticas legales | `settings.policies` | Normativa CO | Normativa UE/ES |

Lo que NO varía: código, componentes, design system, lógica de dominio, estructura de BD.

---

## 3. Modelo de despliegue

```
Repositorio único (esta app)
   │
   ├── Deploy "YI Colombia" → Vercel project A
   │     NEXT_PUBLIC_MARKET=CO
   │     NEXT_PUBLIC_SITE_URL=https://yi.co [dominio pendiente]
   │     → Supabase project CO (mismo esquema)
   │
   └── Deploy "YI España" → Vercel project B
         NEXT_PUBLIC_MARKET=ES
         NEXT_PUBLIC_SITE_URL=https://yistore.es [dominio pendiente]
         → Supabase project ES (mismo esquema)
```

- **Un proyecto Supabase por mercado** (datos aislados, RLS simple, precios naturales por ficha). Migraciones idénticas aplicadas a ambos.
- La app resuelve el mercado activo al arranque desde `NEXT_PUBLIC_MARKET` y lo valida contra la tabla `markets`.
- Alternativa futura documentada (no v1): BD compartida multi-tenant + selector de mercado en admin. El esquema actual lo permite sin migración destructiva.

---

## 4. Resolución del mercado en runtime

```ts
// lib/markets.ts (Fase 1)
const MARKET = process.env.NEXT_PUBLIC_MARKET; // 'CO' | 'ES'
// getActiveMarket(): valida contra BD y cachea por request
```

- Toda query de `lib/data/` filtra implícitamente por el mercado activo.
- URLs sin prefijo de mercado (cada deploy ES su mercado): `/producto/[slug]`, no `/co/producto/...`. SEO limpio por dominio.
- Sitemap/robots generados con el dominio del deploy (`NEXT_PUBLIC_SITE_URL`).

---

## 5. Adaptaciones de contenido

- Español común con módulo de textos centralizado (`lib/i18n/messages.ts`) que admite overrides por locale (DEC-013).
- Formato monetario y de fecha SIEMPRE vía `lib/money/` y `Intl` con el locale del mercado.
- Copy comercial (hero, banners) es contenido de BD por mercado, no texto en código.

---

## 6. Checklist para lanzar un nuevo mercado

1. Crear proyecto Supabase + aplicar migraciones + seed (`markets`, colores, tallas).
2. Configurar Storage buckets + policies.
3. Variables de entorno en nuevo project Vercel.
4. Cargar categorías, productos, envíos y settings (WhatsApp real) desde admin.
5. Dominio + verificación SEO (`09-SEO-PERFORMANCE.md`).

---

## 7. Pendientes de decisión humana

- [x] Mercado inicial: **España** (DEC-014, resuelta 2026-08-31).
- [ ] Dominios definitivos por mercado.
- [ ] Métodos de pago preferidos por mercado (Fase 11).

---

## 8. Estado real (Fase 3)

- `markets` seedeado con **ES** (`is_active = true`) y **CO** (`is_active = false`) en el mismo proyecto Supabase de desarrollo — no dos proyectos separados todavía (ese modelo de despliegue de §3 aplica a producción, cuando existan Vercel projects por mercado).
- Seed operativo (categorías, productos, variantes, settings, shipping) **solo para ES**. CO tiene su fila en `markets` (soporta el esquema/FKs) pero sin datos comerciales — evita "llenar la base" con contenido ficticio (instrucción explícita de Fase 3).
- `lib/markets.ts` (resolución de mercado activo en runtime) **sigue sin existir** — Fase 4 lo conecta a `NEXT_PUBLIC_MARKET` + la tabla `markets`.