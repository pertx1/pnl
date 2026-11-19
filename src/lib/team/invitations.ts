import "server-only";
import { getTranslations } from "next-intl/server";
import { layoutEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import type { Role } from "./roles";

export const INVITE_DAYS = 7;

export function invitationUrl(token: string) {
  return `${appUrl()}/invite/${token}`;
}

/** Email de invitación (transaccional: lo pide un admin del workspace, sin fines comerciales). */
export async function sendInvitationEmail(opts: { to: string; token: string; workspaceName: string; inviterName: string; role: Role }) {
  const t = await getTranslations("team.email");
  const tr = await getTranslations("team.roles");
  const { html, text } = layoutEmail({
    title: t("title", { workspace: opts.workspaceName }),
    paragraphs: [
      t("body", { inviter: opts.inviterName, workspace: opts.workspaceName, role: tr(opts.role) }),
      t("expires", { days: INVITE_DAYS }),
      t("ignore"),
    ],
    cta: { label: t("cta"), url: invitationUrl(opts.token) },
    footer: t("footer"),
  });
  return sendEmail({ to: opts.to, subject: t("subject", { workspace: opts.workspaceName }), html, text });
}
