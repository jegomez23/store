import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Solo `metadataBase`, que es infraestructura: convierte en absolutas las URLs
 * relativas de canonical y Open Graph.
 *
 * EL NOMBRE Y LA FRASE DE LA TIENDA YA NO ESTÁN AQUÍ (incremento 16). Estaban
 * escritos a mano —«YI» y «Vive a tu propio ritmo.»— y eran la razón de que
 * cambiar `store_name` en /admin/ajustes no se notara en ninguna pestaña del
 * navegador. Ahora salen de `settings` en `app/(store)/layout.tsx`, que es el
 * alcance donde la marca significa algo; el panel tiene su propia plantilla en
 * `app/admin/(panel)/layout.tsx`.
 *
 * Poner la consulta en este layout la cobraría también a `/admin`, que es
 * `force-dynamic`, no se indexa y no necesita marca.
 */
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
