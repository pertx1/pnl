import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/inngest/client";
import { channelConfigured } from "@/lib/inbox/config";
import { parseIgWebhookPayload } from "@/lib/inbox/ig-webhook";
import { verifyMetaSignatureAny, verifySubscription } from "@/lib/inbox/meta-signature";
import { ingestIgEvent } from "@/lib/inbox/sync";

/**
 * Webhook de Instagram (mensajes). Sirve para las dos variantes oficiales:
 *  - Instagram API with Instagram Login (producto «Instagram» → webhooks) y
 *  - Instagram API con Facebook Login (producto «Webhooks», objeto Instagram).
 * Configurar en el panel de la app (mismos valores en ambos):
 *   URL: https://<dominio>/api/inbox/meta/webhook · Verify token: META_WEBHOOK_VERIFY_TOKEN · Campo: messages
 * - GET: verificación de la suscripción (hub.mode / hub.verify_token / hub.challenge).
 * - POST: firma X-Hub-Signature-256 obligatoria (HMAC-SHA256 del cuerpo crudo) con META_APP_SECRET o con
 *   INSTAGRAM_APP_SECRET (Instagram Login): se acepta si coincide con cualquiera de los dos.
 * Meta exige 200 rápido y reintenta: la inserción es idempotente (único por hilo + id de mensaje).
 * Logs sin contenido de mensajes.
 */
export async function GET(request: NextRequest) {
  const challenge = verifySubscription(request.nextUrl.searchParams, process.env.META_WEBHOOK_VERIFY_TOKEN ?? "");
  if (!challenge) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secrets = [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET];
  if (!verifyMetaSignatureAny(raw, request.headers.get("x-hub-signature-256"), secrets)) {
    return new NextResponse("bad signature", { status: 401 });
  }
  if (!channelConfigured("instagram")) return NextResponse.json({ received: true });

  const toEnrich = new Set<string>();
  for (const batch of parseIgWebhookPayload(raw)) {
    for (const ev of batch.events) {
      try {
        const ids = await ingestIgEvent(batch.accountId, ev);
        if (!ev.message?.is_echo) ids.forEach((id) => toEnrich.add(id));
      } catch {
        console.error("[inbox-webhook] no se pudo guardar un evento");
      }
    }
  }
  if (toEnrich.size) {
    // Completar el @usuario en segundo plano (el evento solo lleva IDs).
    await inngest
      .send([...toEnrich].map((threadId) => ({ id: `ig-enrich-${threadId}`, name: "inbox/thread.enrich", data: { threadId } })))
      .catch(() => undefined);
  }
  return NextResponse.json({ received: true });
}
