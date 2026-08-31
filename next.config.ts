import type { NextConfig } from "next";

// Hostname derivado de NEXT_PUBLIC_SUPABASE_URL (sin hardcodear un
// project-ref real). Si la variable no está configurada, remotePatterns
// queda vacío y next/image simplemente no permite imágenes remotas todavía.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
