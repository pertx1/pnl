import { BrandGlyph } from "./brand-glyph";

/** Logo de la red social (TikTok, Instagram, YouTube). */
export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  return <BrandGlyph brand={platform} className={className} />;
}
