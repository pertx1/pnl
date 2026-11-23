import { BrandGlyph } from "./brand-glyph";

/** Logo de la red social (TikTok, Instagram, YouTube). Con `label`, los lectores de pantalla leen el nombre de la red. */
export function PlatformIcon({ platform, className, label }: { platform: string; className?: string; label?: boolean }) {
  return <BrandGlyph brand={platform} className={className} label={label} />;
}
