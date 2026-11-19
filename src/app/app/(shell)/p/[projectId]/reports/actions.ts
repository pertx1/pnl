"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { nextRunAt, parseRecipients } from "@/lib/reports/core";
import { sendScheduledReport } from "@/lib/reports/email";
import { createClient } from "@/lib/supabase/server";

export type ReportActionResult = { ok: true } | { ok?: false; error: string };

const path = (projectId: string) => `/app/p/${projectId}/reports`;

function mapDbError(message: string) {
  if (message.includes("recipient_unsubscribed")) return "recipient_unsubscribed";
  if (message.includes("invalid_recipient")) return "invalid_recipients";
  if (message.includes("row-level security") || message.includes("42501")) return "forbidden";
  return "generic";
}

const createSchema = z.object({
  projectId: z.uuid(),
  frequency: z.enum(["weekly", "monthly"]),
  recipients: z.string().max(3000),
  senderName: z.string().trim().min(1).max(80),
  locale: z.enum(["es", "en"]),
  includeSales: z.boolean(),
  showFooter: z.boolean(),
  consent: z.literal(true),
});

export async function createSchedule(input: z.input<typeof createSchema>): Promise<ReportActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.some((i) => i.path[0] === "consent") ? "consent_required" : "invalid_input" };
  const d = parsed.data;
  const recipients = parseRecipients(d.recipients);
  if (!recipients) return { error: "invalid_recipients" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "forbidden" };
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", d.projectId).maybeSingle();
  if (!project) return { error: "forbidden" };
  const { count } = await supabase.from("report_schedules").select("id", { count: "exact", head: true }).eq("project_id", d.projectId);
  if ((count ?? 0) >= 5) return { error: "too_many_schedules" };

  const { error } = await supabase.from("report_schedules").insert({
    workspace_id: project.workspace_id,
    project_id: d.projectId,
    frequency: d.frequency,
    recipients,
    sender_name: d.senderName,
    locale: d.locale,
    include_sales: d.includeSales,
    show_footer: d.showFooter,
    next_run_at: nextRunAt(d.frequency, new Date()).toISOString(),
    created_by: auth.user.id,
  });
  if (error) return { error: mapDbError(error.message) };
  revalidatePath(path(d.projectId));
  return { ok: true };
}

export async function toggleSchedule(projectId: string, id: string, active: boolean): Promise<ReportActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: s } = await supabase.from("report_schedules").select("frequency").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!s) return { error: "forbidden" };
  const { data, error } = await supabase
    .from("report_schedules")
    .update({ active, ...(active ? { next_run_at: nextRunAt(s.frequency, new Date()).toISOString() } : {}) })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: error ? mapDbError(error.message) : "forbidden" };
  revalidatePath(path(projectId));
  return { ok: true };
}

export async function deleteSchedule(projectId: string, id: string): Promise<ReportActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_schedules").delete().eq("id", id).eq("project_id", projectId).select("id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(path(projectId));
  return { ok: true };
}

/** Envía ahora el informe del último periodo completo a los destinatarios (editor+). */
export async function sendNow(projectId: string, id: string): Promise<ReportActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };
  const supabase = await createClient();
  const { data: s } = await supabase.from("report_schedules").select("id, workspace_id, active, last_sent_at").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!s) return { error: "forbidden" };
  const { data: canEdit } = await supabase.rpc("has_workspace_role", { p_workspace_id: s.workspace_id, p_min_role: "editor" });
  if (!canEdit) return { error: "forbidden" };
  if (!s.active) return { error: "inactive" };
  // Freno contra envíos repetidos a terceros: máx. uno cada 10 min.
  if (s.last_sent_at && Date.now() - new Date(s.last_sent_at).getTime() < 10 * 60_000) return { error: "rate_limited" };
  try {
    // id por ventana de 10 min → Inngest descarta los dobles clics.
    await inngest.send({ id: `report-manual-${id}-${Math.floor(Date.now() / 600_000)}`, name: "report/schedule.send", data: { scheduleId: id, manual: true } });
  } catch {
    try {
      await sendScheduledReport(id);
    } catch {
      return { error: "generic" };
    }
  }
  revalidatePath(path(projectId));
  return { ok: true };
}
