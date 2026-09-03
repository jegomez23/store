# 09 — SEO-PERFORMANCE: Visibilidad y velocidad

> Estrategia SEO técnica y presupuesto de rendimiento. Se implementa de forma incremental; los cimientos se definen desde Fase 1.
>
> **Estado real (tras la Fase 9, 2026-09-02).** Lo marcado ⬜ NO está hecho.
>
> | Punto | Estado |
> |---|---|
> | §1 URLs | 🟡 Existen `/` y `/producto/[slug]`. **`/categoria/[slug]` e `/info/[slug]` NO existen** (DEC-039) |
> | §1 Metadata global | ✅ `metadataBase`, template `%s · YI`, description |
> | §1 Metadata por página | ✅ Producto: `meta_title`/`meta_description` con fallback, canonical, OG con foto real, Twitter. Home: canonical + OG |
> | §1 Open Graph | ✅ OG por producto con imagen del catálogo · ✅ `app/opengraph-image.tsx` para la home (`next/og`, sin dependencias nuevas) · ⬜ OG dinámica por producto: **diferida a propósito**, como dice esta misma sección |
> | §1 Sitemap | ✅ `app/sitemap.ts`: home + fichas publicadas. Sin categorías ni infos porque esas rutas no existen (DEC-039). Invalidado en cada mutación de producto (DEC-041) |
> | §1 Robots | ✅ `app/robots.ts`: deniega `/admin`, `/api`, `/carrito`, `/checkout`, `/pedido`. **No es control de acceso** |
> | §1 JSON-LD | ✅ `Product` + `BreadcrumbList` en la ficha, desde Server Component. El breadcrumb es Inicio → producto: no hay página de categoría a la que enlazar |
> | §1 Redirect 301 al cambiar slug | ⬜ NO implementado. Hoy el slug antiguo pasa a dar 404 (sí se invalida, DEC-041) |
> | §1 404 personalizada | ✅ desde Fase 4 |
> | §2 Imágenes | ✅ `next/image` con `sizes` por contexto · ✅ `priority` solo en la foto principal de la ficha · ✅ placeholder blur generado en servidor (DEC-040) · ✅ `remotePatterns` |
> | §2 Caché | ✅ ISR 5 min + matriz de invalidación (DEC-041) |
> | §2 Medición Lighthouse / CWV | ⬜ **NO hecho: no hay navegador en este entorno.** Los presupuestos de LCP/INP/CLS no están medidos |
> | Headers de seguridad | ✅ los cuatro de `08-SECURITY.md` §9 (DEC-042). ⬜ CSP y HSTS en el deploy |

---

## 1. SEO técnico

### URLs
| Página | URL | Notas |
|---|---|---|
| Home | `/` | |
| Categoría | `/categoria/[slug]` | slug por mercado, estable |
| Producto | `/producto/[slug]` | slug único por mercado |
| Info | `/info/[slug]` | envíos, devoluciones, contacto |

Sin prefijos de idioma/mercado: cada deploy ES su mercado con su dominio (`07-MULTI-MARKET.md`).

### Metadata (Metadata API de Next.js)

- `app/layout.tsx`: `metadataBase` desde `NEXT_PUBLIC_SITE_URL`, template de título `%s · YI`, Open Graph base.
- Por página: `generateMetadata()` server-side leyendo BD:
  - Producto: `meta_title || name` + `meta_description || short_description`; OG image = imagen principal; canonical propio.
  - Categoría: nombre + descripción; paginación vía `searchParams` async.
- Fallbacks automáticos documentados en `03-DATABASE.md` §2.6.

### Open Graph / redes
- OG por producto/categoría con imagen real del catálogo (1200×630 recortada por next/image si hace falta).
- Archivos estáticos `opengraph-image` para home (Fase 8). Generación dinámica por producto: diferida hasta justificarla.

### Sitemap y robots
- `app/sitemap.ts`: home + productos activos. **Categorías e infos NO** — esas rutas no existen en `app/` y listarlas sería anunciar 404 (DEC-039). No se regenera por tag (no hay tags): se invalida con `revalidatePath('/sitemap.xml')` en cada mutación de producto (DEC-041).
- `app/robots.ts`: permite todo público; **deniega `/admin`, `/api`**.
- JSON-LD: `Product` (name, image, offers con precio/moneda/disponibilidad) y `BreadcrumbList` en ficha — inyectado en Server Component.

### Buenas prácticas continuas
- Slugs estables: cambiar slug genera redirect 301 (mapa en admin futuro; v1: evitar cambios).
- 404 personalizada con navegación de salida.
- Sin páginas duplicadas: filtros de listado viajan por `searchParams` con canonical a la URL limpia.

---

## 2. Performance

### Presupuestos objetivo (móvil 4G, página de producto)
| Métrica | Objetivo |
|---|---|
| LCP | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |
| JS inicial de tienda | mínimo indispensable (Server Components) |

### Imágenes (el peso real de una tienda de moda)
- SIEMPRE `next/image` con `sizes` correctos por contexto.
- Formato: Supabase Storage sirve original; el optimizador de Next entrega WebP/AVIF.
- `priority` SOLO en imagen principal above-the-fold (hero, primera foto de ficha).
- Placeholder blur generado en subida (admin guarda `blurDataURL`) o color dominante. **HECHO (DEC-040):** `sharp` genera un WebP de 16 px (~66 bytes) durante la subida y se guarda en `product_images.blur_data_url` (migración `0022`, con CHECK). Nunca se acepta del cliente. Las 4 imágenes anteriores a Fase 9 tienen `NULL` y se pintan sin placeholder: el backfill está PENDIENTE.
- Config obligatoria en `next.config.ts` (Fase 1):
```ts
images: {
  remotePatterns: [{ protocol: 'https', hostname: '<project-ref>.supabase.co' }],
  // qualities por defecto [75] es suficiente (Next 16)
}
```

### Renderizado y JS
- Server Components por defecto; `'use client'` solo en: carrito, selectores de variante, drawers/menú, steppers.
- Fuentes Geist ya optimizadas con `next/font` (self-hosted, sin layout shift).
- Iconos inline SVG (sin librería).
- Navegación: `<Link>` prefetch por defecto de Next 16 (mejorado: dedup de layouts).

### Caché (modelo clásico — DEC-004)
| Recurso | Estrategia |
|---|---|
| HTML home/listados/fichas | ISR `revalidate = 300` |
| Imágenes optimizadas | Cache TTL por defecto Next 16 (4h mínimo) |
| Datos admin | Sin caché (`force-dynamic`) |
| Invalidación | `revalidateTag('catalog'|'home'|'settings', 'max')` desde actions del admin |

### Medición
- Lighthouse CI local en cada fase de UI (umbral ≥ 90 móvil).
- Vercel Analytics opcional en Fase 10 (decisión de Juan).
- Auditoría CWV formal: ⬜ **PENDIENTE**. En este entorno no hay navegador automatizado, así que ni Lighthouse ni las métricas de campo se han medido. No se declara ningún presupuesto como cumplido.

---

## 3. Checklist por tipo de página

**Producto:** metadata completa · JSON-LD Product · imagen priority · galería lazy · precio en HTML server-rendered · breadcrumb visible.
**Categoría:** metadata · paginación canónica · grid con skeletons · imágenes lazy salvo primera fila.
**Home:** hero priority · secciones streaming-friendly · OG estático.