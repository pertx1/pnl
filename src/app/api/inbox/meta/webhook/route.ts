import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/inngest/client";
import { channelConfigured } from "@/lib/inbox/config";
import { verifyMetaSignature, verifySubscription } from "@/lib/inbox/meta-signature";
import { ingestIgEvent, type IgWebhookEvent } from "@/lib/inbox/sync";

/**
 * Webhook de Meta (Instagram Messaging). Configurar en el panel de la app:
 *   URL: https://<dominio>/api/inbox/meta/webhook · Verify token: META_WEBHOOK_VERIFY_TOKEN · Campo: messages
 * - GET: verificación de la suscripción (hub.mode / hub.verify_token / hub.challenge).
 * - POST: firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con META_APP_SECRET) obligatoria.
 * Meta exige 200 en < 5 s y reintenta: la inserción es idempotente (único por hilo + id de mensaje).
 * Logs sin contenido de mensajes.
 */
export async function GET(request: NextRequest) {
  const challenge = verifySubscription(request.nextUrl.searchParams, process.env.META_WEBHOOK_VERIFY_TOKEN ?? "");
  if (!challenge) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

type Payload = { object?: string; entry?: { id?: string; time?: number; messaging?: IgWebhookEvent[] }[] };

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET ?? "")) {
    return new NextResponse("bad signature", { status: 401 });
  }
  if (!channelConfigured("instagram")) return NextResponse.json({ received: true });

  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ received: true });
  }
  if (payload.object !== "instagram") return NextResponse.json({ received: true });

  const toEnrich = new Set<string>();
  for (const entry of payload.entry?.slice(0, 50) ?? []) {
    if (!entry.id) continue;
    for (const ev of entry.messaging?.slice(0, 100) ?? []) {
      try {
        const ids = await ingestIgEvent(entry.id, ev);
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
