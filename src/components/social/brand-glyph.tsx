import { Mail } from "lucide-react";
import { siGmail, siInstagram, siShopify, siTiktok, siYoutube } from "simple-icons";
import { cn } from "@/lib/utils";

/**
 * Logos oficiales de las plataformas (trazados de Simple Icons, CC0). Se muestran sin modificar, en sus colores,
 * solo para identificar la red conectada (uso nominativo, permitido por las guías de marca de TikTok, Meta y YouTube).
 * Microsoft no permite su logo en Simple Icons: Outlook usa un sobre genérico en su azul.
 */
type Brand = { path?: string; bg: string; fg: string; title: string };

const BRANDS: Record<string, Brand> = {
  tiktok: { path: siTiktok.path, bg: "#000000", fg: "#ffffff", title: "TikTok" },
  instagram: { path: siInstagram.path, bg: "linear-gradient(45deg,#FEDA75 0%,#FA7E1E 25%,#D62976 50%,#962FBF 75%,#4F5BD5 100%)", fg: "#ffffff", title: "Instagram" },
  youtube: { path: siYoutube.path, bg: "#ffffff", fg: "#FF0000", title: "YouTube" },
  gmail: { path: siGmail.path, bg: "#ffffff", fg: "#EA4335", title: "Gmail" },
  shopify: { path: siShopify.path, bg: "#ffffff", fg: "#7AB55C", title: "Shopify" },
  outlook: { bg: "#0F6CBD", fg: "#ffffff", title: "Outlook" },
};

export function BrandGlyph({ brand, className, label }: { brand: string; className?: string; label?: boolean }) {
  const b = BRANDS[brand];
  if (!b) return <span aria-hidden className={cn("inline-block size-8 shrink-0 rounded-md bg-muted", className)} />;
  const light = b.bg === "#ffffff";
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ? b.title : undefined}
      aria-hidden={label ? undefined : true}
      title={b.title}
      className={cn("inline-grid size-8 shrink-0 place-items-center overflow-hidden rounded-md", light && "ring-1 ring-border ring-inset", className)}
      style={{ background: b.bg }}
    >
      {b.path ? (
        <svg viewBox="0 0 24 24" className="size-[58%]" fill={b.fg} aria-hidden focusable="false">
          <path d={b.path} />
        </svg>
      ) : (
        <Mail className="size-[58%]" color={b.fg} strokeWidth={2} aria-hidden />
      )}
    </span>
  );
}
