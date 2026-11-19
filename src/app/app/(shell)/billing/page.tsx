import { getFormatter, getTranslations } from "next-intl/server";
import { Coins, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CREDIT_PACKS } from "@/lib/billing/packs";
import { PLANS, PRICES_ARE_PROVISIONAL } from "@/lib/billing/plans";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { isActiveStatus } from "@/lib/billing/stripe-mapping";
import { getWorkspaceUsage } from "@/lib/billing/usage";
import { getCreditBalance, getCurrentWorkspace, roleAtLeast } from "@/lib/server/dal";
import { createClient } from "@/lib/supabase/server";
import { BuyPackForm } from "./buy-form";
import { LimitNotice, UsageMeter } from "./limit-notice";
import { ManageSubscriptionButton, PlansGrid } from "./plans-section";

export async function generateMetadata() {
  const t = await getTranslations("plans");
  return { title: t("pageTitle") };
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const t = await getTranslations("billing");
  const tp = await getTranslations("plans");
  const format = await getFormatter();
  const workspace = await getCurrentWorkspace();
  const isAdmin = roleAtLeast(workspace.role, "admin");
  const supabase = await createClient();
  const [balance, { data: purchases }, { data: ledger }, usage, { data: subscription }] = await Promise.all([
    getCreditBalance(workspace.id),
    supabase.from("credit_purchases").select("id, credits, amount_total, currency, status, invoice_url, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("credit_ledger").select("id, delta, balance_after, reason, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(30),
    getWorkspaceUsage(workspace.id),
    supabase.from("workspace_subscriptions").select("status, plan_id, current_period_end, cancel_at_period_end, customer_id, subscription_id").eq("workspace_id", workspace.id).maybeSingle(),
  ]);
  const hasActiveSubscription = Boolean(subscription?.subscription_id && isActiveStatus(subscription.status));
  const currentPlan = PLANS.find((p) => p.id === workspace.planId);
  const eur = (cents: number, currency = "eur") => format.number(cents / 100, { style: "currency", currency: currency.toUpperCase() });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="label-mono">{workspace.name}</p>
        <h1 className="text-[28px] leading-tight font-medium">{tp("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{tp("pageSubtitle")}</p>
      </div>

      {status === "success" && <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{t("success")}</p>}
      {status === "subscribed" && <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{tp("subscribed")}</p>}
      {status === "cancelled" && <p role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{t("cancelled")}</p>}

      <section id="plans" className="scroll-mt-24 space-y-3" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="label-mono">{tp("yourPlan")}</h2>
        <Card>
          <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="space-y-2">
              <p className="text-[28px] leading-tight font-medium">{usage?.planName ?? currentPlan?.name ?? workspace.planId}</p>
              {subscription?.status && subscription.subscription_id ? (
                <p className="text-sm text-muted-foreground">
                  {tp.has(`subStatus.${subscription.status}`) ? tp(`subStatus.${subscription.status}`) : subscription.status}
                  {subscription.current_period_end &&
                    " · " +
                      tp(subscription.cancel_at_period_end ? "endsOn" : "renewsOn", {
                        date: format.dateTime(new Date(subscription.current_period_end), { dateStyle: "medium" }),
                      })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{tp("freeIntro")}</p>
              )}
              {subscription?.status === "past_due" && <p className="text-sm text-warning">{tp("pastDue")}</p>}
              {isAdmin && subscription?.customer_id && <ManageSubscriptionButton disabled={!isStripeConfigured()} />}
            </div>
            {usage && (
              <div className="space-y-3">
                <UsageMeter label={tp("limitKinds.projects")} status={usage.limits.projects} />
                <UsageMeter label={tp("limitKinds.socialAccounts")} status={usage.limits.socialAccounts} />
                <UsageMeter label={tp("limitKinds.members")} status={usage.limits.members} />
                <p className="font-mono text-xs text-muted-foreground">{tp("monthlyCreditsLine", { n: usage.monthlyCredits })}</p>
              </div>
            )}
          </CardContent>
        </Card>
        {usage && (["projects", "socialAccounts", "members"] as const).map((k) => <LimitNotice key={k} status={usage.limits[k]} />)}
        {!isStripeConfigured() && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">{tp("errors.not_configured")}</p>}
        {!isAdmin && <p className="text-sm text-muted-foreground">{tp("onlyAdmins")}</p>}
        <PlansGrid
          plans={PLANS.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.priceCents === 0 ? tp("free") : eur(p.priceCents),
            isFree: p.priceCents === 0,
            highlight: Boolean(p.highlight),
            limits: p.limits,
          }))}
          currentPlanId={workspace.planId}
          canManage={isAdmin}
          configured={isStripeConfigured()}
          hasActiveSubscription={hasActiveSubscription}
        />
        <p className="text-xs text-muted-foreground">
          {tp("vatNote")} {PRICES_ARE_PROVISIONAL && tp("provisional")}
        </p>
      </section>

      <div className="space-y-1 pt-2">
        <h2 className="label-mono">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardContent className="flex items-center gap-4">
          <Coins className="size-8 text-brand-amber-ink" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="label-mono">{t("balance")}</p>
            <p className="font-mono text-4xl font-semibold tabular-nums">{format.number(balance)}</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="label-mono">{t("packs")}</h2>
        {!isStripeConfigured() && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">{t("errors.not_configured")}</p>}
        {!isAdmin && <p className="text-sm text-muted-foreground">{t("onlyAdmins")}</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {CREDIT_PACKS.map((p) => (
            <BuyPackForm
              key={p.id}
              packId={p.id}
              credits={p.credits}
              price={eur(p.priceCents)}
              perCredit={format.number(p.priceCents / 100 / p.credits, { style: "currency", currency: "EUR", maximumFractionDigits: 3 })}
              highlight={Boolean(p.highlight)}
              disabled={!isAdmin || !isStripeConfigured()}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("vatIncluded")}</p>
      </section>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("history")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(purchases ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPurchases")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {purchases!.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="w-32 font-mono text-xs text-muted-foreground">{format.dateTime(new Date(p.created_at), { dateStyle: "medium" })}</span>
                    <span className="flex-1">{t("credits", { n: p.credits })}</span>
                    <span className="font-mono">{eur(p.amount_total, p.currency)}</span>
                    <span className="text-xs text-muted-foreground">{t.has(`status.${p.status}`) ? t(`status.${p.status}`) : p.status}</span>
                    {p.invoice_url && (
                      <a href={p.invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-ink hover:underline">
                        {t("invoice")} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("movements")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(ledger ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMovements")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {ledger!.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <span className="w-32 font-mono text-xs text-muted-foreground">{format.dateTime(new Date(l.created_at), { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="flex-1">{t.has(`reasons.${l.reason}`) ? t(`reasons.${l.reason}`) : l.reason}</span>
                  <span className={`font-mono tabular-nums ${l.delta > 0 ? "text-success" : "text-muted-foreground"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
                  <span className="w-16 text-right font-mono text-xs text-muted-foreground tabular-nums">{l.balance_after}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
