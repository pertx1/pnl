// Funciones de Inngest del módulo "strategy" (se registran en ../functions.ts).
import { NonRetriableError } from "inngest";
import { layoutEmail, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { currentPlanDay, overdueCount, todayPendingCount } from "@/lib/strategy/warmup";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

function admin() {
  const a = createAdminClient();
  if (!a) throw new NonRetriableError("SUPABASE_SECRET_KEY no configurada");
  return a;
}

const PLATFORM_NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

/**
 * Cada mañana: revisa los planes de calentamiento activos y marca los que tienen tareas pendientes
 * (`needs_attention` + `pending_count`) para mostrar el aviso dentro de la app. Si quien lo activó quiere
 * recordatorio por email, se le envía uno (máx. 1 al día). Nunca se ejecuta ninguna acción en las plataformas.
 * Los pasos solo devuelven IDs (minimización: Inngest guarda lo que devuelve cada paso).
 */
export const warmupDailyCheck = inngest.createFunction(
  { id: "warmup-daily-check", triggers: [{ cron: "TZ=Europe/Madrid 13 8 * * *" }], concurrency: 1 },
  async ({ step }) => {
    const toEmail = await step.run("flag-plans", async () => {
      const db = admin();
      const today = new Date().toISOString().slice(0, 10);
      const { data: plans } = await db
        .from("warmup_plans")
        .select("id, start_date, duration_days, reminder_user_id, last_reminded_at")
        .eq("status", "active")
        .limit(2000);
      const ids = (plans ?? []).map((p) => p.id);
      const tasks: { plan_id: string; day: number; done_at: string | null }[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await db.from("warmup_tasks").select("plan_id, day, done_at").in("plan_id", ids.slice(i, i + 200));
        tasks.push(...(data ?? []));
      }
      const emails: string[] = [];
      for (const p of plans ?? []) {
        const day = currentPlanDay(p.start_date, today, p.duration_days);
        const list = tasks.filter((x) => x.plan_id === p.id).map((x) => ({ day: x.day, done: Boolean(x.done_at) }));
        const pending = day < 1 ? 0 : overdueCount(list, day) + (day <= p.duration_days ? todayPendingCount(list, day) : 0);
        // Plan terminado hace más de 7 días y sin nada pendiente → completado. Si quedan cosas, seguimos avisando (máx. 7 días).
        const finished = day > p.duration_days;
        const stale = finished && today > new Date(Date.parse(p.start_date) + (p.duration_days + 7) * 86400000).toISOString().slice(0, 10);
        await db
          .from("warmup_plans")
          .update({
            needs_attention: pending > 0 && !stale,
            pending_count: pending,
            last_checked_at: new Date().toISOString(),
            ...(finished && pending === 0 ? { status: "completed" as const } : {}),
            ...(stale ? { reminder_user_id: null } : {}),
          })
          .eq("id", p.id);
        const remindedToday = p.last_reminded_at && p.last_reminded_at.slice(0, 10) === today;
        if (p.reminder_user_id && pending > 0 && !stale && !remindedToday) emails.push(p.id);
      }
      return emails;
    });

    let sent = 0;
    for (const planId of toEmail) {
      const ok = await step.run(`remind-${planId}`, async () => {
        const db = admin();
        const { data: p } = await db
          .from("warmup_plans")
          .select("id, workspace_id, project_id, platform, handle, reminder_user_id, pending_count, needs_attention, last_reminded_at")
          .eq("id", planId)
          .single();
        if (!p?.reminder_user_id || !p.needs_attention) return false;
        // Si ya no es miembro del workspace (expulsado o se fue), no se le envía nada y se apaga el recordatorio.
        const { data: member } = await db
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", p.workspace_id)
          .eq("user_id", p.reminder_user_id)
          .maybeSingle();
        if (!member) {
          await db.from("warmup_plans").update({ reminder_user_id: null }).eq("id", p.id);
          return false;
        }
        const today = new Date().toISOString().slice(0, 10);
        if (p.last_reminded_at?.slice(0, 10) === today) return false; // idempotencia ante reintentos
        const { data: u } = await db.auth.admin.getUserById(p.reminder_user_id);
        const email = u.user?.email;
        if (!email) return false;
        const { data: profile } = await db.from("profiles").select("locale").eq("id", p.reminder_user_id).maybeSingle();
        const en = profile?.locale === "en";
        const name = `${PLATFORM_NAME[p.platform] ?? p.platform}${p.handle ? ` @${p.handle}` : ""}`;
        const url = `${appUrl()}/app/p/${p.project_id}/warmup?plan=${p.id}`;
        const { html, text } = layoutEmail({
          title: en ? `Warm-up ${name}: ${p.pending_count} tasks pending` : `Calentamiento ${name}: ${p.pending_count} tareas pendientes`,
          paragraphs: en
            ? ["You have warm-up tasks to do by hand today. A few minutes a day keeps your new account healthy.", "Kreo never performs these actions for you: it's a guided checklist."]
            : ["Tienes tareas de calentamiento para hacer hoy a mano. Unos minutos al día mantienen sana tu cuenta nueva.", "Kreo nunca hace estas acciones por ti: es una checklist guiada."],
          cta: { label: en ? "Open my plan" : "Abrir mi plan", url },
          footer: en
            ? `You get this email because you turned on reminders for this plan. <a href="${url}">Turn them off</a> from the plan page.`
            : `Recibes este email porque activaste los recordatorios de este plan. <a href="${url}">Desactívalos</a> desde la página del plan.`,
        });
        const res = await sendEmail({ to: email, subject: en ? "Your warm-up checklist for today" : "Tu checklist de calentamiento de hoy", html, text });
        if (res.ok) await db.from("warmup_plans").update({ last_reminded_at: new Date().toISOString() }).eq("id", p.id);
        return res.ok;
      });
      if (ok) sent++;
    }
    return { flaggedForEmail: toEmail.length, sent };
  },
);

export const strategyFunctions = [warmupDailyCheck] as const;
