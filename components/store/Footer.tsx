import { Container } from "@/components/ui/Container";
import { Divider } from "@/components/ui/Divider";
import type { StorefrontSettings } from "@/lib/data/settings";

/**
 * Footer de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INCREMENTO 15: EL CONTACTO Y LAS REDES SALEN DE `settings`
 * ─────────────────────────────────────────────────────────────────────────
 * `contact_email`, `instagram_url`, `tiktok_url` y `facebook_url` llevaban
 * desde la Fase 8 siendo editables en `/admin/ajustes` **sin que nada los
 * pintara**: el administrador los guardaba y no pasaba nada en ningún sitio.
 * Configuración fantasma, y encima con el peor final posible — que alguien
 * escriba el email de contacto real y crea que ya está publicado.
 *
 * Ahora se consumen aquí. Cada enlace aparece SOLO si tiene valor: sin email
 * no se pinta un "Contacto" que no lleva a ninguna parte.
 *
 * Las políticas siguen sin ser páginas reales, así que se mantienen como texto
 * y no como enlace roto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INCREMENTO 16: LA FRASE TAMBIÉN SALE DE `settings`
 * ─────────────────────────────────────────────────────────────────────────
 * «Vive a tu propio ritmo.» estaba escrita a mano aquí y en otros cuatro
 * sitios. Ahora es `settings.tagline`, y si el administrador la borra NO se
 * pinta un texto por defecto: la tienda simplemente no publica frase.
 */
export function Footer({ settings }: { settings: StorefrontSettings | null }) {
  const socials = [
    { label: "Instagram", href: settings?.instagramUrl ?? null },
    { label: "TikTok", href: settings?.tiktokUrl ?? null },
    { label: "Facebook", href: settings?.facebookUrl ?? null },
  ].filter((social): social is { label: string; href: string } => Boolean(social.href));

  return (
    <footer className="border-t border-line bg-cream pb-20 pt-10 md:pb-10">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          {settings?.storeName ? (
            <span className="text-lg font-bold tracking-tight text-black">
              {settings.storeName}
            </span>
          ) : null}
          {settings?.tagline ? (
            <p className="text-sm text-gray-700">{settings.tagline}</p>
          ) : null}
        </div>

        {settings?.contactEmail || socials.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {settings?.contactEmail ? (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="text-black underline-offset-4 hover:underline"
              >
                {settings.contactEmail}
              </a>
            ) : null}
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-black underline-offset-4 hover:underline"
              >
                {social.label}
              </a>
            ))}
          </div>
        ) : null}

        <Divider />
        <div className="flex flex-col gap-2 text-sm text-gray-400 md:flex-row md:justify-between">
          {/* Políticas: siguen sin existir como páginas (Fase 4+). */}
          <span>Envíos · Devoluciones (próximamente)</span>
          <span>
            © {new Date().getFullYear()}
            {settings?.storeName ? ` ${settings.storeName}` : ""}
          </span>
        </div>
      </Container>
    </footer>
  );
}
