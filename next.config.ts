import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Los textos legales y el blog se leen del disco en cada petición (dependen del idioma): incluirlos en el despliegue.
  outputFileTracingIncludes: {
    "/legal/[slug]": ["./content/legal/**/*"],
    "/blog": ["./content/blog/**/*"],
    "/blog/[slug]": ["./content/blog/**/*"],
  },
  // Pantalla de consentimiento OAuth del MCP: nunca dentro de un iframe (anti-clickjacking).
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  // Cache Components desactivado: casi toda la app es por usuario (sesión) y simplifica el desarrollo.
  // Las páginas sin datos dinámicos (landing, legales) siguen generándose estáticas.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
