import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Ban, Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { getUser, getWorkspaces, mfaPending } from "@/lib/server/dal";
import { ConsentForm } from "./consent-form";
import { readPendingRequest } from "./pending";

export async function generateMetadata() {
  const t = await getTranslations("mcpOAuth.consent");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Pantalla de consentimiento OAuth del conector MCP. Exige sesión de Kreo y, si el usuario tiene 2FA, haberla verificado.
 * Muestra qué app pide acceso (nombre + host verificable), a dónde volverá, el workspace y lo que podrá y no podrá hacer.
 */
export default async function ConsentPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/oauth/consent");
  if (await mfaPending()) redirect("/login/mfa?next=/oauth/consent");

  const t = await getTranslations("mcpOAuth.consent");
  const tr = await getTranslations("team.roles");
  const pending = await readPendingRequest();
  if (!pending) redirect("/oauth/error?reason=expired");
  const workspaces = await getWorkspaces();
  const name = pending.client.name || pending.redirectHost;
  // Un cliente registrado dinámicamente que se llama "Claude" pero no vuelve a claude.ai: posible suplantación.
  const verifiedName = pending.client.kind === "cimd";
  const suspicious = pending.client.kind === "dcr" && /claude|anthropic|kreo/i.test(name) && !pending.loopbackOnly && !/(^|\.)claude\.ai$/i.test(pending.redirectHost);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="label-mono">{t("eyebrow")}</p>
        {/* El nombre de un cliente DCR lo escribe quien lo registra (anti-phishing): se presenta como "dice llamarse". */}
        <h1 className="text-[24px] leading-tight font-medium">{verifiedName ? t("title", { client: name }) : t("titleUnverified", { client: name })}</h1>
        {!verifiedName && <p className="text-xs font-medium text-warning">{t("unverifiedBadge")}</p>}
        <p className="text-xs text-muted-foreground">
          {t("signedInAs", { email: user.email ?? "" })} · {t("notYou")}
        </p>
      </div>

      <div className="space-y-2 rounded-md border p-3 text-sm">
        {pending.clientIdHost ? (
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
            <span>{t("verifiedBy", { host: pending.clientIdHost })}</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("unverified")}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">{t("redirectTo")} </span>
          <strong className="font-mono text-foreground">{pending.redirectHost}</strong>
        </p>
        {suspicious && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("impersonationWarning", { client: name, host: pending.redirectHost })}
          </p>
        )}
        {pending.loopbackOnly && (
          <p role="note" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("loopbackWarning")}
          </p>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="label-mono">{t("canTitle")}</p>
        <ul className="space-y-1.5">
          {(["read", "drafts", "ai"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              {t(`can.${k}`)}
            </li>
          ))}
        </ul>
        <p className="label-mono pt-2">{t("cannotTitle")}</p>
        <p className="flex items-start gap-2">
          <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          {t("cannot")}
        </p>
        <p className="pt-1 text-xs text-muted-foreground">{t("dataNotice")}</p>
      </div>

      {workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noWorkspaces")}</p>
      ) : (
        <ConsentForm digest={pending.digest} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: tr(w.role) }))} />
      )}
      <p className="text-xs text-muted-foreground">{t("duration")}</p>
    </div>
  );
}
