import "server-only";
import { isCryptoConfigured } from "@/lib/crypto/tokens";
import type { InboxChannel } from "@/lib/supabase/types/inbox";

/**
 * ¿Está configurado cada canal? Sin claves → la UI muestra "pendiente de configurar" (nunca rompe).
 * - Instagram: META_WEBHOOK_VERIFY_TOKEN + (INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET → Instagram Login, por defecto;
 *   o META_APP_ID + META_APP_SECRET → Facebook Login, alternativa).
 * - Gmail: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (mismo proyecto de Google Cloud que YouTube).
 * - Outlook: MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET (Microsoft Entra, multi-tenant + cuentas personales).
 */
export function channelConfigured(channel: InboxChannel): boolean {
  const base = isCryptoConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY);
  if (!base) return false;
  switch (channel) {
    case "instagram":
      return Boolean(
        process.env.META_WEBHOOK_VERIFY_TOKEN &&
          ((process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) || (process.env.META_APP_ID && process.env.META_APP_SECRET)),
      );
    case "gmail":
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case "outlook":
      return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }
}

/** Etiqueta HUMAN_AGENT: SOLO cuando Meta la haya aprobado en App Review. */
export function humanAgentEnabled() {
  return process.env.META_HUMAN_AGENT_ENABLED === "true";
}

export const INBOX_CHANNELS: InboxChannel[] = ["instagram", "gmail", "outlook"];

export class InboxError extends Error {
  constructor(
    public code: string,
    public status?: number,
  ) {
    super(`inbox:${code}`);
  }
}
