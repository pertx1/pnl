"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { layoutEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { keep, type ErrorKey } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lista de espera con DOBLE OPT-IN.
 * FormData: email (obligatorio), ref (código de referido opcional), consent ("on", obligatorio), website (honeypot, debe ir vacío).
 * Por privacidad, la respuesta es la misma exista o no el email (no revelamos quién está apuntado).
 */
export type WaitlistState =
  | { ok: true; email: string }
  | { ok?: false; error?: ErrorKey; fieldErrors?: Record<string, string[] | undefined>; values?: Record<string, string> }
  | undefined;

const schema = z.object({
  email: z.email().max(254),
  ref: z.string().trim().max(16).regex(/^[A-Za-z0-9]*$/).optional(),
  consent: z.literal("on"),
  website: z.string().max(0).optional(),
});

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const values = keep(formData, ["email"]);

  // Honeypot: un bot rellena el campo oculto. Respondemos "ok" sin hacer nada.
  if (String(formData.get("website") ?? "").length > 0) return { ok: true, email: values.email };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const admin = createAdminClient();
  if (!admin) {
    console.error("[waitlist] Falta SUPABASE_SECRET_KEY");
    return { error: "generic", values };
  }

  const locale = await getLocale();
  const { data, error } = await admin.rpc("waitlist_join", {
    p_email: parsed.data.email,
    p_ref: parsed.data.ref ?? "",
    p_locale: locale,
  });
  if (error) {
    console.error("[waitlist] Error al apuntar", error.code);
    return { error: "generic", values };
  }

  const row = data?.[0];
  if (row && !row.already_confirmed && row.confirm_token && row.unsubscribe_token) {
    const t = await getTranslations("waitlistEmail");
    const base = appUrl();
    const confirmUrl = `${base}/waitlist/confirm?token=${row.confirm_token}`;
    const unsubscribeUrl = `${base}/waitlist/unsubscribe?token=${row.unsubscribe_token}`;
    const { html, text } = layoutEmail({
      title: t("title"),
      paragraphs: [t("p1"), t("p2")],
      cta: { label: t("cta"), url: confirmUrl },
      footer: `${t("footer")} <a href="${unsubscribeUrl}" style="color:#8A9480">${t("unsubscribe")}</a>`,
    });
    const sent = await sendEmail({ to: parsed.data.email, subject: t("subject"), html, text, unsubscribeUrl });
    if (!sent.ok) return { error: "generic", values };
  }

  return { ok: true, email: parsed.data.email };
}
