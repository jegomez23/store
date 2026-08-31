# Reglas — Seguridad

> Innegociables. Contexto completo: `08-SECURITY.md`.

## Autorización

1. La autoridad final es RLS. Ninguna medida de frontend sustituye políticas de BD.
2. Verificación en capas para /admin: proxy.ts (optimista) + layout (getUser + rol) + cada Server Action (re-verifica). Las tres, siempre.
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

13. robots.ts deniega `/admin` y `/api`; sitemap nunca incluye rutas privadas.
14. Headers de seguridad (X-Frame-Options, Referrer-Policy, Permissions-Policy) se configuran en next.config — tarea de Fase 10, no antes sin necesidad.

## Revisión

15. Toda PR/tarea que toque auth, RLS, storage o actions debe incluir auto-revisión explícita de seguridad en el reporte final.