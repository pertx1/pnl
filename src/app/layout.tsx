import type { Metadata } from "next";
import "./globals.css";

// El nombre definitivo y el design system se fijan al cerrar la Fase 0.
export const metadata: Metadata = {
  title: "Proyecto sin nombre · Fase 0",
  description: "SaaS todo-en-uno para creadores, marcas y agencias (en construcción).",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
