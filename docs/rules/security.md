# Reglas — Seguridad

> Innegociables. Contexto completo: `08-SECURITY.md`.

## Autorización

1. La autoridad final es RLS. Ninguna medida de frontend sustituye políticas de BD.
2. Verificación en capas para /admin, las tres siempre (DEC-031): **proxy.ts mantiene la sesión viva** (refresh + cookies) y redirige por cortesía — *no comprueba el rol y no debe hacerlo*; **el layout comprueba quién eres** (`getUser()` + `is_admin()`); **cada Server Action comprueba qué puedes hacer** (`requireAdmin()` de `lib/admin/auth.ts`). Nunca omitas la tercera "porque el layout ya protege": una Server Function es un POST a su ruta y un cambio de `matcher` puede sacarla del proxy sin que nada falle a la vista.
3. `getUser()` (valida contra servidor Supabase) para decisiones de seguridad; `getSession()` solo para UX no sensible.
4. Nuevos roles o permisos = decisión registrada antes de implementar.

## Secretos

5. `SUPABASE_SERVICE_ROLE_KEY` y cualquier secreto: jamás en componentes client, ni en variables `NEXT_PUBLIC_*`, ni en commits.
6. Service role confinado a `lib/supabase/admin.ts` con `import 'server-only'`.
7. Ante sospecha de fuga de clave: rotarla inmediatamente en Supabase y auditar accesos.

## Entrada

8. Validar y normalizar TODO input de Server Actions (tipos, rangos, longitudes, uuid, slugs) antes de tocar BD.
9. Nunca confiar en nombres de archivo del cliente para Storage: regenerar server-side.
10. Mensajes de error al usuario genéricos; detalle técnico solo en logs de servidor.

## Datos sensibles

11. Teléfonos/emails de clientes: solo visibles en admin; nunca en payloads públicos ni logs completos.
12. Sin `dangerouslySetInnerHTML` salvo justificación documentada y contenido sanitizado.

## Rutas y cabeceras

13. `app/robots.ts` (Fase 9) deniega `/admin`, `/api`, `/carrito`, `/checkout` y `/pedido`; el sitemap nunca incluye rutas privadas ni contenido no publicado. **`robots.txt` no es seguridad**: no sustituye a `proxy.ts`, `requireAdmin()` ni RLS, y nadie debe "arreglar" un fallo de acceso tocándolo.
14. Headers de seguridad en `next.config.ts`: **HECHOS en Fase 9** (DEC-042) los cuatro de `08-SECURITY.md` §9. `Content-Security-Policy` y `Strict-Transport-Security` van en el deploy (Fase 11), no antes: la CSP hay que calibrarla en un navegador real y HSTS necesita el dominio HTTPS.
15. El `blur_data_url` de una imagen lo genera SIEMPRE el servidor con `sharp`; jamás se acepta uno enviado por el navegador. Lo impone además un CHECK en PostgreSQL (migración 0022).

## Revisión

16. Toda PR/tarea que toque auth, RLS, storage o actions debe incluir auto-revisión explícita de seguridad en el reporte final.