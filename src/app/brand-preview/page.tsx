import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono, DM_Sans, Inter, JetBrains_Mono, Sora, Space_Grotesk } from "next/font/google";
import BrandPreview from "./BrandPreview";

// Todas las fuentes son de Google Fonts con licencia SIL Open Font License (uso comercial libre).
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Brand preview · Fase 0",
  description: "Comparativa interna de las 3 direcciones de identidad visual.",
  robots: { index: false, follow: false },
};

export default function Page() {
  const fontVars = [spaceGrotesk, jetbrains, bricolage, dmSans, dmMono, sora, inter].map((f) => f.variable).join(" ");
  return (
    <div className={fontVars}>
      <BrandPreview />
    </div>
  );
}
