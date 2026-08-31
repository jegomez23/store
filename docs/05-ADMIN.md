# 05 — ADMIN: Panel de administración

> Especificación funcional del panel privado. En Fase 0 solo se documenta; se implementa en Fase 7. Seguridad técnica en `08-SECURITY.md`; esquema en `03-DATABASE.md`.

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
| Guard optimista | `proxy.ts`: sin cookie de sesión → redirect a login |
| Guard real | `app/admin/layout.tsx`: `getUser()` + rol `admin` en `profiles`; si no → redirect login |
| Recuperación | Reset por email Supabase |
| Alta de admins | Solo por invitación manual (panel Supabase o SQL) en v1 |

---

## 3. Mapa de pantallas

```
/admin                     Dashboard: pedidos pendientes, stock bajo, resumen
/admin/productos           Lista: búsqueda, filtro estado/categoría, paginación
/admin/productos/nuevo     Crear producto
/admin/productos/[id]      Editar producto (tabs: General / Variantes / Imágenes / SEO)
/admin/categorias          Lista jerárquica drag&drop orden
/admin/promociones         Lista + crear/editar promoción
/admin/pedidos             Lista con filtros por estado
/admin/pedidos/[id]        Detalle + cambio de estado + timeline eventos
/admin/home                Editor de bloques HomeContent
/admin/ajustes             Configuración del mercado activo
```

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
- Transiciones válidas UI-enforced:
```
pending → contacted → confirmed → paid → preparing → shipped → delivered
cualquiera (excepto delivered) → cancelled
```
- Regla crítica: pasar a `paid` exige confirmación explícita del admin (checkbox "Pago recibido") — jamás automático.

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