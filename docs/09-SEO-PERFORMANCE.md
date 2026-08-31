# 09 — SEO-PERFORMANCE: Visibilidad y velocidad

> Estrategia SEO técnica y presupuesto de rendimiento. Se implementa de forma incremental (Fases 4–8); los cimientos se definen desde Fase 1.

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
- `app/sitemap.ts`: productos activos + categorías activas + infos + home. Regenerado con revalidación del tag `catalog`.
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
- Placeholder blur generado en subida (admin guarda `blurDataURL`) o color dominante.
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
- Auditoría CWV formal: Fase 8.

---

## 3. Checklist por tipo de página

**Producto:** metadata completa · JSON-LD Product · imagen priority · galería lazy · precio en HTML server-rendered · breadcrumb visible.
**Categoría:** metadata · paginación canónica · grid con skeletons · imágenes lazy salvo primera fila.
**Home:** hero priority · secciones streaming-friendly · OG estático.