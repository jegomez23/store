# 03 — DATABASE: Modelo de datos (PostgreSQL / Supabase)

> **Implementado (Fase 3)** como migraciones versionadas en `supabase/migrations/0001`–`0015`. Este documento describe el diseño; el código SQL es la fuente de verdad del esquema real (principio §16 de la Fase 3 — code is the source of truth). Seed de desarrollo en `supabase/seed/` (solo mercado ES operativo, ver DEC-014). **Limitación conocida:** las migraciones no se han podido aplicar/validar contra una instancia Postgres real en este entorno (sin Docker/Podman disponible para `supabase start`) — revisadas manualmente, sin ejecución. Validar con `npm run db:start && npm run db:reset` (requiere Docker Desktop) o contra un proyecto Supabase real antes de confiar en ellas en producción.
> Convenciones: snake_case · PK `uuid` con `gen_random_uuid()` · timestamps `timestamptz` · dinero `numeric(12,2)` (nunca float) · soft delete con `deleted_at` donde aplique.
> Desviación de nombre respecto a este documento: la columna `sizes.group` se implementó como `sizes.size_group` (evita citar la palabra reservada `group` en cada query). El resto de nombres coincide exactamente con las tablas descritas abajo.

---

## 1. Diagrama de tablas

```
markets ──┬──< categories (self-ref parent_id)
          ├──< products ──< product_images
          │      │
          │      └──< product_variants >── colors (global)
          │                              >── sizes  (global)
          ├──< promotions ──< promotion_products >── products
          │        └──────< promotion_categories >── categories
          ├──1:1 settings
          ├──< shipping_methods
          ├──< home_content
          ├──< customers ──< orders ──< order_items >── product_variants
          │                      └──< order_events
auth.users ──1:1 profiles (rol admin)
```

---

## 2. Tablas

### 2.1 `markets`
| Columna | Tipo | Notas |
|---|---|---|
| id | text PK | `'CO'` \| `'ES'` |
| name | text NOT NULL | "Colombia", "España" |
| currency_code | char(3) NOT NULL | `COP`, `EUR` (ISO 4217) |
| locale | text NOT NULL | `es-CO`, `es-ES` |
| is_active | boolean NOT NULL DEFAULT true | |

Seed inicial: CO y ES.

### 2.2 `profiles` (admins)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` (FK) |
| role | text NOT NULL DEFAULT 'admin' CHECK in ('admin') | extensible a futuro |
| full_name | text | |
| created_at / updated_at | timestamptz | |

Trigger sugerido: crear profile automáticamente al signup (o solo por invitación manual en v1).

### 2.3 `categories`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets | |
| parent_id | uuid FK → categories NULL | NULL = categoría raíz |
| name | text NOT NULL | |
| slug | text NOT NULL | UNIQUE(market_id, slug) |
| description | text | |
| image_url | text | |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

CHECK: profundidad máx. 2 niveles (validar en app + constraint opcional vía trigger).

### 2.4 `colors` (global)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | "Negro" |
| slug | text NOT NULL UNIQUE | |
| hex_code | char(7) NOT NULL | swatch UI |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |

### 2.5 `sizes` (global)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| label | text NOT NULL | "M", "42" |
| size_group | text NOT NULL CHECK in ('apparel','footwear','accessory') | nombrada `size_group` en el esquema real (`group` es palabra reservada SQL) |
| sort_order | int NOT NULL DEFAULT 0 | orden lógico XS→XL, 36→46 |
| is_active | boolean NOT NULL DEFAULT true | |

UNIQUE(label, size_group).

### 2.6 `products`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| category_id | uuid FK → categories NOT NULL | |
| name | text NOT NULL | |
| slug | text NOT NULL | UNIQUE(market_id, slug) |
| short_description | text | tarjetas/listados |
| description | text | ficha completa |
| materials | text | |
| care_instructions | text | |
| shipping_info_override | text | si NULL usa info del mercado |
| status | text NOT NULL DEFAULT 'draft' CHECK in ('draft','active','archived') | |
| is_featured | boolean NOT NULL DEFAULT false | |
| is_new | boolean NOT NULL DEFAULT false | |
| meta_title | text | SEO; fallback = nombre |
| meta_description | text | SEO; fallback = short_description |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

Índices parciales públicos:
```sql
CREATE INDEX idx_products_public ON products (market_id, category_id)
WHERE status='active' AND deleted_at IS NULL;
CREATE INDEX idx_products_featured ON products (market_id)
WHERE is_featured AND status='active' AND deleted_at IS NULL;
CREATE INDEX idx_products_new ON products (market_id)
WHERE is_new AND status='active' AND deleted_at IS NULL;
```

### 2.7 `product_images`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products ON DELETE CASCADE | |
| url | text NOT NULL | ruta Storage bucket `products` |
| alt_text | text NOT NULL | obligatorio (a11y+SEO) |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_primary | boolean NOT NULL DEFAULT false | exactamente una por producto (app lo garantiza) |
| created_at | timestamptz | |

### 2.8 `product_variants`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products ON DELETE CASCADE | |
| color_id | uuid FK → colors | NULL permitido solo si producto sin color (accesorios) |
| size_id | uuid FK → sizes | NULL permitido solo accesorios talla única |
| sku | text NOT NULL UNIQUE | |
| price | numeric(12,2) NOT NULL CHECK (price >= 0) | |
| compare_at_price | numeric(12,2) CHECK (compare_at_price > price) | "antes" |
| stock | int NOT NULL DEFAULT 0 CHECK (stock >= 0) | |
| low_stock_threshold | int NOT NULL DEFAULT 3 | "Últimas unidades" |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

UNIQUE(product_id, color_id, size_id).
> **Resuelto (DEC-019):** `color_id`/`size_id` nullable, tal como implementado. La validación de "cuándo son obligatorias según el grupo del producto" queda para el admin (Fase 7), no como CHECK de esquema.

### 2.9 `promotions`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| name | text NOT NULL | interno |
| type | text NOT NULL CHECK in ('percentage','fixed_amount','special_price','code') | |
| value | numeric(12,2) NOT NULL | % o importe según tipo |
| code | text | UNIQUE(market_id, code) donde no NULL |
| scope | text NOT NULL CHECK in ('all','products','categories') | |
| starts_at / ends_at | timestamptz NULL | vigencia opcional |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

CHECK coherencia tipo/valor: percentage → 0 < value ≤ 100; fixed/special_price → value > 0.

### 2.10 `promotion_products` / `promotion_categories`
Tablas puerto N:M: `(promotion_id FK, product_id FK)` / `(promotion_id FK, category_id FK)`, PK compuesta. Solo relevantes cuando scope lo indique.

### 2.11 `customers`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| phone | text NOT NULL | formato E.164 normalizado |
| name | text | |
| email | text | opcional |
| notes | text | interno admin |
| created_at / updated_at | timestamptz | |

UNIQUE(market_id, phone).

### 2.12 `orders`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_number | text NOT NULL UNIQUE | ej. `YI-CO-000123` (formato final Fase 6) |
| market_id | text FK → markets NOT NULL | |
| customer_id | uuid FK → customers NOT NULL | |
| channel | text NOT NULL CHECK in ('whatsapp','online') | 'online' futuro |
| status | text NOT NULL DEFAULT 'pending' CHECK in ('pending','contacted','confirmed','paid','preparing','shipped','delivered','cancelled') | |
| currency_code | char(3) NOT NULL | snapshot del market |
| subtotal | numeric(12,2) NOT NULL | |
| discount_total | numeric(12,2) NOT NULL DEFAULT 0 | |
| shipping_total | numeric(12,2) NOT NULL DEFAULT 0 | |
| total | numeric(12,2) NOT NULL | |
| shipping_address | jsonb | cuando exista checkout online |
| notes | text | notas del cliente/admin |
| source_url | text | URL desde la que se generó (producto/carrito) |
| created_at / updated_at | timestamptz | |

Índices: `(market_id, status)`, `(customer_id)`, `created_at DESC`.

### 2.13 `order_items` (snapshot inmutable)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders ON DELETE CASCADE | |
| variant_id | uuid FK → product_variants NULL | NULL si variante eliminada después |
| product_name | text NOT NULL | snapshot |
| color_name | text | snapshot |
| size_label | text | snapshot |
| sku | text | snapshot |
| unit_price | numeric(12,2) NOT NULL | snapshot precio aplicado |
| quantity | int NOT NULL CHECK (quantity > 0) | |
| line_total | numeric(12,2) NOT NULL | unit_price × quantity |

### 2.14 `order_events` (append-only)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders ON DELETE CASCADE | |
| from_status | text | NULL en creación |
| to_status | text NOT NULL | |
| note | text | |
| actor_id | uuid FK → profiles NULL | NULL = sistema |
| created_at | timestamptz DEFAULT now() | |

Protección append-only: REVOKE UPDATE/DELETE a roles no-admin; policy admin solo INSERT/SELECT.

### 2.15 `shipping_methods`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| name | text NOT NULL | "Envío nacional" |
| description | text | |
| price | numeric(12,2) NOT NULL CHECK >= 0 | |
| free_shipping_threshold | numeric(12,2) NULL | |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | |

### 2.16 `settings` (1:1 con market)
| Columna | Tipo | Notas |
|---|---|---|
| market_id | text PK FK → markets | |
| store_name | text NOT NULL | |
| logo_url | text | bucket `content` |
| whatsapp_number | text NOT NULL | **fuente única del número** (E.164, sin "+": `573001234567`) |
| contact_email | text | |
| instagram_url / tiktok_url / facebook_url | text | |
| policies | jsonb NOT NULL DEFAULT '{}' | `{shipping, returns, privacy}` estructurados |
| updated_at | timestamptz | |

### 2.17 `home_content`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| market_id | text FK → markets NOT NULL | |
| section | text NOT NULL CHECK in ('hero','banner','strip_promo') | |
| title | text | |
| subtitle | text | |
| cta_label | text | |
| cta_href | text | interno o externo validado |
| image_url | text | |
| sort_order | int NOT NULL DEFAULT 0 | |
| is_active | boolean NOT NULL DEFAULT true | |
| starts_at / ends_at | timestamptz NULL | programación |
| created_at / updated_at | timestamptz | |

---

## 3. Row Level Security (resumen; detalle completo en 08-SECURITY)

Patrón común — helper de rol:

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
```

| Tabla | SELECT público | Escritura |
|---|---|---|
| markets | activos | admin |
| categories / products / images / variants | activos y no borrados (y market activo) | admin |
| promotions + pivotes | activos y vigentes | admin |
| shipping_methods / settings / home_content | activos | admin |
| colors / sizes | activos | admin |
| customers | ❌ nada | admin |
| orders / items / events | ❌ nada | admin (events: insert+select) |
| profiles | propia fila | admin (rol solo editable por service role/SQL) |

Toda tabla: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` en su migración. Sin excepciones (DEC-009).

---

## 4. Supabase Storage

| Bucket | Acceso | Contenido |
|---|---|---|
| `products` | lectura pública; escritura solo admin | imágenes de producto (webp/jpg ≤ 5MB) |
| `content` | lectura pública; escritura solo admin | logos, banners, categorías, hero |

Policies de storage equivalentes a RLS (`is_admin()` para write; `true` para read en buckets públicos). Rutas sugeridas: `products/{product_id}/{uuid}.webp`, `content/{market}/{tipo}/{uuid}`.

---

## 5. Integridad y convenciones

- FKs explícitas con `ON DELETE` adecuado (CASCADE en dependientes huérfanos; RESTRICT en referencias comerciales).
- `updated_at` automático vía trigger genérico.
- Dinero SIEMPRE `numeric`; formateo en app (`lib/money/`), nunca en SQL.
- Stock: decrementos transaccionales con `stock >= cantidad` guard (evitar negativos bajo concurrencia):
```sql
UPDATE product_variants SET stock = stock - $qty
WHERE id = $id AND stock >= $qty;  -- verificar rowcount
```

---

## 6. Pendientes de decisión

1. ~~¿Variantes sin color/talla para accesorios?~~ **Resuelto (DEC-019):** sí, nullable, implementado tal cual en `product_variants`.
2. Formato definitivo de `order_number` — pendiente (Fase 6).
3. Confirmar regla "promoción más favorable gana" — pendiente (se aplicará en la lógica de cálculo de precio, no en el esquema).
4. Estrategia códigos descuento v1 (manual WhatsApp vs automático visible) — pendiente (Fase 6/7).