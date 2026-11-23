import { BrandGlyph } from "@/components/social/brand-glyph";

/** Logo del canal de la bandeja (Instagram, TikTok, Gmail, Outlook). */
export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  return <BrandGlyph brand={channel} className={className} />;
}
