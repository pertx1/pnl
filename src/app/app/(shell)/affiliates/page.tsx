import Link from "next/link";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import { BadgeEuro, HandCoins, Megaphone, MousePointerClick, Repeat, UserPlus, Wallet } from "lucide-react";
import { StatCard } from "@/components/kreo/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { affiliateLink, ATTRIBUTION_DAYS, commissionMonths, commissionRate } from "@/lib/affiliates";
import { isStaffEmail } from "@/lib/affiliates/server";
import { appUrl } from "@/lib/env";
import { getCurrentWorkspace, getUser } from "@/lib/server/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ClaimForm, CopyField, JoinForm, MarkPaidForm } from "./affiliate-client";

export async function generateMetadata() {
  const t = await getTranslations("affiliates");
  return { title: t("title") };
}

export default async function AffiliatesPage() {
  const t = await getTranslations("affiliates");
  const format = await getFormatter();
  const [workspace, user] = await Promise.all([getCurrentWorkspace(), getUser()]);
  const supabase = await createClient();
  const [{ data: affiliate }, { data: stats }, { data: commissions }] = await Promise.all([
    supabase.from("affiliates").select("code, status, created_at").eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.rpc("my_affiliate_stats"),
    supabase
      .from("affiliate_commissions")
      .select("id, net_amount_cents, commission_cents, rate, currency, status, created_at, paid_at")
      .eq("affiliate_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const s = stats?.[0];
  const rate = commissionRate();
  const months = commissionMonths();
  const money = (cents: number, currency = "eur") => format.number(cents / 100, { style: "currency", currency: currency.toUpperCase() });
  const pct = format.number(rate, { style: "percent", maximumFractionDigits: 1 });
  const accountAgeDays = user?.created_at ? ((await getNow()).getTime() - new Date(user.created_at).getTime()) / 86400000 : 999;

  // Panel interno para el personal de Kreo: comisiones pendientes de pago (sin datos personales de los referidos).
  const staff = isStaffEmail(user?.email);
  const admin = staff ? createAdminClient() : null;
  const { data: staffPending } = admin
    ? await admin
        .from("affiliate_commissions")
        .select("id, affiliate_id, commission_cents, currency, created_at, affiliates(code)")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-6">
      <div>
        <p className="label-mono">{workspace.name}</p>
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle", { pct, months })}</p>
      </div>

      {!affiliate ? (
        <Card>
          <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <HandCoins className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <h2 className="text-lg font-medium">{t("join.title")}</h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>{t("join.point1", { pct, months })}</li>
                <li>{t("join.point2", { days: ATTRIBUTION_DAYS })}</li>
                <li>{t("join.point3")}</li>
              </ul>
              <p className="text-xs text-muted-foreground">{t("provisional")}</p>
            </div>
            <div className="space-y-3 md:border-l md:border-border md:pl-6">
              <JoinForm />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {affiliate.status !== "active" && (
            <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("suspended")}
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t("link.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CopyField value={affiliateLink(appUrl(), affiliate.code)} label={t("link.title")} />
              <p className="text-xs text-muted-foreground">
                {t("link.code")} <span className="font-mono text-foreground">{affiliate.code}</span> · {t("link.hint", { days: ATTRIBUTION_DAYS })}
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label={t("stats.clicks")} value={format.number(Number(s?.clicks ?? 0))} icon={MousePointerClick} trend="flat" />
            <StatCard label={t("stats.signups")} value={format.number(Number(s?.signups ?? 0))} icon={UserPlus} trend="flat" />
            <StatCard label={t("stats.conversions")} value={format.number(Number(s?.conversions ?? 0))} icon={Repeat} trend="flat" />
            <StatCard label={t("stats.pending")} value={money(Number(s?.pending_cents ?? 0))} icon={Wallet} trend="flat" />
            <StatCard label={t("stats.paid")} value={money(Number(s?.paid_cents ?? 0))} icon={BadgeEuro} trend="flat" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("commissions.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {(commissions ?? []).length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Wallet className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  <p className="text-sm text-muted-foreground">{t("commissions.empty")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <caption className="sr-only">{t("commissions.title")}</caption>
                    <thead>
                      <tr className="label-mono text-left">
                        <th scope="col" className="py-2 font-normal">{t("commissions.date")}</th>
                        <th scope="col" className="py-2 text-right font-normal">{t("commissions.net")}</th>
                        <th scope="col" className="py-2 text-right font-normal">{t("commissions.rate")}</th>
                        <th scope="col" className="py-2 text-right font-normal">{t("commissions.amount")}</th>
                        <th scope="col" className="py-2 pl-4 font-normal">{t("commissions.status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {commissions!.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2 font-mono text-xs text-muted-foreground">{format.dateTime(new Date(c.created_at), { dateStyle: "medium" })}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{money(c.net_amount_cents, c.currency)}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{format.number(Number(c.rate), { style: "percent", maximumFractionDigits: 1 })}</td>
                          <td className="py-2 text-right font-mono font-medium tabular-nums">{money(c.commission_cents, c.currency)}</td>
                          <td className="py-2 pl-4">
                            <Badge variant={c.status === "paid" ? "default" : "secondary"}>{t(`commissions.statuses.${c.status}`)}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                  {t("payouts.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{t("payouts.manual")}</p>
                <p>{t("payouts.future")}</p>
              </CardContent>
            </Card>
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="size-4 text-warning" strokeWidth={1.5} aria-hidden />
                  {t("disclosure.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{t("disclosure.body")}</p>
                <p>{t("disclosure.noSpam")}</p>
                <Link href="/legal/afiliados" className="link inline-block">
                  {t("disclosure.terms")}
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {accountAgeDays <= ATTRIBUTION_DAYS && (
        <Card>
          <CardHeader>
            <CardTitle>{t("claim.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimForm />
          </CardContent>
        </Card>
      )}

      {staff && (
        <section aria-labelledby="staff-heading" className="space-y-3 rounded-md border border-dashed border-border p-4">
          <h2 id="staff-heading" className="label-mono">
            {t("staff.title")}
          </h2>
          {!admin ? (
            <p className="text-sm text-muted-foreground">{t("errors.not_configured")}</p>
          ) : (staffPending ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("staff.empty")}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {staffPending!.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{format.dateTime(new Date(c.created_at), { dateStyle: "short" })}</span>
                  <span className="font-mono">{c.affiliates?.code ?? "—"}</span>
                  <span className="flex-1 font-mono tabular-nums">{money(c.commission_cents, c.currency)}</span>
                  <MarkPaidForm id={c.id} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t("staff.hint")}</p>
        </section>
      )}
    </div>
  );
}
