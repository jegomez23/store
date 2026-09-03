# 05 — ADMIN: Panel de administración

> Especificación funcional del panel privado. Seguridad técnica en `08-SECURITY.md`; esquema en `03-DATABASE.md`.
>
> **Estado real (tras la Fase 9, 2026-09-02).** Fase 7 entregó el núcleo
> operativo (auth + pedidos) y Fase 8 el CMS de catálogo. Lo que sigue sin
> implementarse está marcado como tal:
>
> | Módulo | Estado |
> |---|---|
> | §2 Acceso y autenticación | ✅ IMPLEMENTADO (Fase 7; desviación de estructura en §2). **Reset de contraseña: ⬜ NO implementado** |
> | §4.4 Pedidos (lista, detalle, estados, timeline) | ✅ IMPLEMENTADO (Fase 7) y verificado contra Supabase real |
> | §4.7 Dashboard | ✅ IMPLEMENTADO (Fase 7): pedidos por estado, recientes, stock bajo |
> | Inventario (`/admin/inventario`) | ✅ IMPLEMENTADO (Fase 9.5): vista transversal de variantes con búsqueda, filtros y **reposición en lote por delta**, atómica y concurrente (DEC-047/048) |
| §4.1 Productos | ✅ IMPLEMENTADO (Fase 8): CRUD, matriz color × talla, imágenes y SEO (`meta_title`/`meta_description`). Desde Fase 9, cada subida de imagen genera además su **placeholder blur en servidor** (DEC-040) y toda mutación invalida la ficha, la home y el sitemap (DEC-041). **Sin** drag&drop: el orden se edita por número. Sin `compare_at_price`, SKU editable ni umbral low-stock. **Sin redirect 301** al cambiar el slug: el antiguo pasa a dar 404 |
> | §4.2 Categorías | ✅ IMPLEMENTADO (Fase 8): jerarquía de 2 niveles, orden, activar/desactivar, borrado bloqueado por la FK real. **Sin** drag&drop ni imagen de categoría |
> | §4.5 Home | ✅ IMPLEMENTADO (Fase 8): CRUD de los tres tipos de bloque que existen. **Sin** vista previa embebida ni imagen del bloque |
> | §4.6 Ajustes | 🟡 PARCIAL (Fase 8): nombre, email de contacto, redes y número de WhatsApp. **Sin** logo, políticas ni métodos de envío |
> | §4.3 Promociones | ⬜ PENDIENTE — fuera del alcance acordado; la regla "promoción más favorable" sigue pendiente de Juan |
> | §5 Textos en `lib/i18n/` | ⬜ PENDIENTE (el panel usa `TODO(i18n)`, como Fase 2) |

---

## 1. Principios del panel

- Gestiona el 100% de la tienda sin tocar código.
- Escrito con los mismos componentes base (`components/ui/`) pero layout propio (sidebar desktop, tabs móvil).
- Toda mutación pasa por Server Actions con validación de sesión + rol + input.
- Feedback inmediato: toasts + actualización optimista donde aporte (`updateTag`/`refresh`).

---

## 2. Acceso y autenticación

| Aspecto | Definición |
|---|---|
| Login | `/admin/login` — email + contraseña (Supabase Auth) |
| Sesión | Cookie httpOnly vía `@supabase/ssr` |
| Guard de sesión | `proxy.ts`: **renueva el token** y escribe las cookies; sin sesión → redirect a login. **No comprueba el rol** (DEC-031) |
| Guard real | `app/admin/(panel)/layout.tsx`: `getUser()` + `is_admin()`. Sesión sin rol → pantalla "Acceso denegado" con logout (redirigir causaría un bucle) |
| Guard de mutaciones | `requireAdmin()` al inicio de **cada** Server Action y de cada función de `lib/data/admin/` (DEC-034) |
| Recuperación | Reset por email Supabase — ⬜ **NO implementado** en Fase 7 |
| Alta de admins | Solo por invitación manual (panel Supabase o SQL) en v1 |

---

## 3. Mapa de pantallas

Rutas **existentes** hoy (tras la Fase 8):

```
/admin/login               Acceso (route group (auth), fuera del guard)
/admin                     Resumen: pedidos por estado, recientes, stock bajo
/admin/pedidos             Lista: filtro por estado, búsqueda por número, paginación (20/pág.)
/admin/pedidos/[numero]    Detalle + contactar + cambio de estado + EXPEDIENTE
                           (notas internas + historial de estados en un solo hilo)
/admin/catalogo            Lista de productos: búsqueda, filtro por estado y filtro
                           "No se pueden comprar" (?ver=no-vendibles, Fase 9.5)
/admin/catalogo/nuevo      Crear producto (nace en borrador)
/admin/catalogo/[id]       Editar: General · SEO · Variantes (matriz) · Imágenes ·
                           Historial de cambios (Fase 9.5) · Eliminar
/admin/categorias          Jerarquía de 2 niveles, orden, activar/desactivar
/admin/home                Bloques hero / banner / strip_promo
/admin/inventario          Todas las variantes: buscar, filtrar por agotadas o bajo umbral,
                           reponer en lote por delta (Fase 9.5)
/admin/ajustes             Nombre, email, redes y número de WhatsApp
```

Desviación deliberada: el producto vive en `/admin/catalogo/[id]` y no en
`/admin/productos/[id]`. Se mantuvo `catalogo` porque es la ruta que ya existía
desde Fase 7; renombrarla habría roto enlaces sin aportar nada.

**Desviación respecto al plan original, deliberada:** el detalle se direcciona
por `order_number` (`/admin/pedidos/YI-ES-000001`), no por `id`. Es el
identificador que el negocio dicta por WhatsApp, y la ruta está detrás del
guard, así que la enumerabilidad de DEC-027 no aplica aquí.

Ruta **prevista y todavía inexistente**: `/admin/promociones`.

---

## 4. Funcionalidad por módulo

### 4.1 Productos
- CRUD completo; campos según `03-DATABASE.md` §2.6.
- Estados: borrador / activo / archivado (+ soft delete).
- Flags: destacado, nuevo.
- **Variantes:** matriz color × talla generable en lote ("crear todas las combinaciones"), edición inline de precio/compare_at/SKU/stock por celda, activar/desactivar variante, umbral low-stock.
- **Imágenes:** subida múltiple a Storage, reordenar drag&drop, marcar principal, eliminar, alt text obligatorio.
- Validaciones: slug único por mercado (autogenerado editable), SKU único, precio ≥ 0, compare_at > precio.

### 4.2 Categorías
- CRUD, jerarquía máx. 2 niveles, imagen, orden drag&drop, activar/desactivar.
- Bloqueo de borrado con productos activos asociados (mensaje claro).

### 4.3 Promociones
- Crear/editar: tipo (% / fijo / precio especial / código), valor, vigencia, alcance (todo / productos / categorías) con selectores.
- Vista previa del efecto sobre productos afectados antes de guardar.
- Activar/desactivar; histórico de promociones pasadas.
- ⚠️ Códigos: en v1 sin canje automático en compra — ver decisión pendiente en DOMAIN-MODEL/DATABASE.

### 4.4 Pedidos
- Lista filtrable por estado/market/fecha; búsqueda por número o teléfono.
- Detalle: items (snapshot), cliente, totales, source_url (desde dónde se generó).
- **Cambio de estado** con confirmación y nota opcional → escribe `order_events`.
- **Cancelar devuelve el stock** del pedido, exactamente una vez (DEC-033).
- Transiciones válidas UI-enforced:
```
pending → contacted → confirmed → paid → preparing → shipped → delivered
cualquiera (excepto delivered) → cancelled
```
- **Estas transiciones las impone PostgreSQL**, no la UI: `admin_update_order_status`
  (migración 0019, DEC-032) las valida con la fila del pedido bloqueada. Ocultar
  un botón no protege nada, y no pretende hacerlo. `delivered` y `cancelled` son
  terminales.
- Regla crítica: pasar a `paid` exige confirmación explícita del admin (checkbox "Pago recibido") — jamás automático. **Lo exige la propia función SQL** mediante el argumento `p_payment_confirmed`, así que ni una llamada directa a la RPC puede saltárselo.

### 4.5 Home
- CRUD de bloques hero/banner/strip_promo por mercado: título, subtítulo, CTA, imagen, orden, vigencia, activación.
- Vista previa embebida del home resultante.

### 4.6 Ajustes (por mercado activo)
- Nombre tienda, logo (subida), **número WhatsApp**, email contacto, redes sociales.
- Políticas (envíos/devoluciones/privacidad) como editor estructurado.
- Métodos de envío: CRUD con precio y umbral gratis.
- Moneda/locale: solo lectura aquí (se cambian en `markets`, operación deliberada).

### 4.7 Dashboard
- Resumen operativo: pedidos por estado (hoy/semana), variantes bajo umbral de stock, pedidos recientes y accesos rápidos a los módulos.

---

## 5. Convenciones UX del panel

- Listados: tabla densa con acciones inline; filtros persistentes en URL (`searchParams` async).
- Formularios: validación en cliente para feedback inmediato + revalidación server-side siempre.
- Destructivos (archivar, desactivar): confirmación inline de 1 clic (no modales pesados).
- Todo texto del panel también centralizado en `lib/i18n/`.

---

## 6. Fuera de alcance v1

Multi-admin con roles granulares · auditoría completa de ediciones · import/export CSV · notificaciones push/email · reportes avanzados. El esquema admite evolucionar hacia ellos sin migración destructiva.