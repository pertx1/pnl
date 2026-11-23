import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AgentRefusalError, isAgentsConfigured } from "@/lib/agents";
import { settleStudioGeneration } from "@/lib/ai/settle";
import { validateTarget, type MediaKind, type PlatformOptions } from "@/lib/posts/rules";
import { youtubeDerivedAllowed } from "@/lib/research/config";
import { aggregateMetrics, lastDays } from "@/lib/reports/core";
import { salesSummary, type LineItem } from "@/lib/shopify/core";
import { defaultFrequency } from "@/lib/strategy/templates";
import type { Database, WorkspaceRoleT } from "@/lib/supabase/database.types";
import { isBestTimePlatform, type BestTimePlatform, type BestTimesResult } from "@/lib/analytics/best-time";
import { loadProjectBestTimes } from "@/lib/analytics/best-time-data";
import { loadWeeklySummary } from "@/lib/notifications/weekly";
import { addDays, computeFreeSlots, daysBetween, DEFAULT_TZ, hhmm, isIsoDay, isValidTimeZone, PLANNED_STATUSES, zonedParts, zonedToUtc } from "./calendar";
import { draftReply, DRAFT_REPLY_VERSION } from "./reply-agent";
import { modelsCostText, startStudioGeneration } from "./studio";

/**
 * Servidor MCP de Kreo: el "cerebro" de Kreo desde cualquier chat de Claude. Cada petición crea una instancia nueva
 * (sin estado) ligada al usuario autenticado (token OAuth o API key personal).
 * - Con OAuth el acceso queda limitado al workspace que el usuario eligió al dar su consentimiento.
 * - Todas las lecturas/escrituras usan el cliente de servicio, PERO cada herramienta comprueba antes el rol del usuario
 *   en el workspace (lector para leer; editor para crear borradores/tareas o usar IA), igual que la app.
 * Sección 0 (regla nº 1): nada se aprueba, publica ni envía desde aquí.
 *  - create_draft_post crea un BORRADOR o lo envía a aprobación; la aprobación es siempre humana en Kreo.
 *  - draft_reply devuelve un borrador; nunca envía.
 *  - generate_image / generate_video cobran los mismos créditos que el Estudio y devuelven los créditos si fallan.
 *  - Toda herramienta que gasta créditos exige el interruptor «permitir gastar créditos» de la conexión (apagado por
 *    defecto) y respeta su tope diario (mcp_credit_reserve, atómico).
 */

type Db = SupabaseClient<Database>;
export type McpContext = {
  userId: string;
  /** Id de la API key o de la autorización OAuth (solo se registra un prefijo en la actividad). */
  keyId: string;
  via: "api_key" | "oauth";
  /** Con OAuth: único workspace autorizado. Con API key: null (todos los del usuario). */
  workspaceId: string | null;
  db: Db;
};

const ROLE_ORDER: WorkspaceRoleT[] = ["viewer", "editor", "admin", "owner"];
const atLeast = (r: WorkspaceRoleT | undefined, min: WorkspaceRoleT) => !!r && ROLE_ORDER.indexOf(r) >= ROLE_ORDER.indexOf(min);
const DRAFT_REPLY_CREDITS = 1;
const TASKS_MILESTONE = "Tareas";

class ToolError extends Error {}

/** Cupo de créditos de esta conexión (interruptor «permitir gastar créditos» + tope diario, en Ajustes › Claves API). */
function creditBudget(ctx: McpContext) {
  return {
    reserve: async (credits: number) => {
      const { data, error } = await ctx.db.rpc("mcp_credit_reserve", { p_kind: ctx.via, p_id: ctx.keyId, p_amount: credits });
      if (error || !data) return "disabled" as const; // ante la duda, no se gasta
      return data;
    },
    release: async (credits: number) => {
      await ctx.db.rpc("mcp_credit_release", { p_kind: ctx.via, p_id: ctx.keyId, p_amount: credits });
    },
  };
}
const CREDITS_DISABLED_MSG =
  "Esta conexión no tiene permiso para gastar créditos. El usuario puede activarlo en Kreo › Ajustes › Claves API › «Permitir gastar créditos» (con un tope diario).";
const CREDIT_CAP_MSG = "Se ha alcanzado el tope diario de créditos de esta conexión. El usuario puede subirlo en Kreo › Ajustes › Claves API, o esperar a mañana (UTC).";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (code: string, message: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }], isError: true });

async function memberships(ctx: McpContext) {
  let q = ctx.db.from("workspace_members").select("workspace_id, role, workspaces!inner(name, plan_id)").eq("user_id", ctx.userId);
  if (ctx.workspaceId) q = q.eq("workspace_id", ctx.workspaceId);
  const { data } = await q;
  return new Map((data ?? []).map((m) => [m.workspace_id, { role: m.role as WorkspaceRoleT, name: m.workspaces.name, plan: m.workspaces.plan_id }]));
}

/** Proyecto accesible con al menos `min`. Lanza ToolError si no existe o no hay permiso (misma respuesta: no filtra existencia). */
async function projectFor(ctx: McpContext, projectId: string, min: WorkspaceRoleT) {
  const { data: p } = await ctx.db.from("projects").select("id, name, workspace_id").eq("id", projectId).is("archived_at", null).maybeSingle();
  if (!p || (ctx.workspaceId && p.workspace_id !== ctx.workspaceId)) throw new ToolError("not_found");
  const { data: role } = await ctx.db.rpc("member_role", { p_user_id: ctx.userId, p_workspace_id: p.workspace_id });
  if (!atLeast(role ?? undefined, min)) throw new ToolError(atLeast(role ?? undefined, "viewer") ? "forbidden" : "not_found");
  return { ...p, role: role as WorkspaceRoleT };
}

/** Proyectos en el alcance de una consulta: uno concreto o todos los accesibles. */
async function scopeProjects(ctx: McpContext, projectId?: string) {
  if (projectId) {
    const p = await projectFor(ctx, projectId, "viewer");
    return [{ id: p.id, name: p.name, workspace_id: p.workspace_id }];
  }
  const ws = [...(await memberships(ctx)).keys()];
  if (!ws.length) return [];
  const { data } = await ctx.db.from("projects").select("id, name, workspace_id").in("workspace_id", ws).is("archived_at", null).order("created_at");
  return data ?? [];
}

async function log(ctx: McpContext, workspaceId: string, action: string, entityType?: string, entityId?: string, metadata: Record<string, string | number | boolean> = {}) {
  await ctx.db.from("activity_log").insert({
    workspace_id: workspaceId,
    actor_id: ctx.userId,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    metadata: { via: ctx.via === "oauth" ? "mcp_oauth" : "mcp", key: ctx.keyId.slice(0, 8), ...metadata },
  });
}

/** Comprueba si existe una tabla de otro módulo (puede no estar desplegada todavía). */
async function tableAvailable(ctx: McpContext, table: string) {
  const loose = ctx.db as unknown as SupabaseClient;
  const { error } = await loose.from(table).select("id", { head: true, count: "exact" }).limit(1);
  return !error || !(error.code === "PGRST205" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message));
}

/** Envuelve una herramienta: errores conocidos → mensaje claro; desconocidos → genérico (sin detalles internos). */
function safe<A>(fn: (args: A) => Promise<ReturnType<typeof json>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      if (e instanceof ToolError) {
        const msg: Record<string, string> = {
          not_found: "Proyecto o elemento no encontrado, o no tienes acceso (con OAuth solo se ve el espacio de trabajo autorizado).",
          forbidden: "Tu rol en este espacio de trabajo no permite esta acción (hace falta editor o superior).",
          insufficient_credits: "No hay créditos suficientes en este espacio de trabajo.",
          not_configured: "Esta función aún no está configurada en este servidor de Kreo.",
          invalid_range: "Rango de fechas no válido (usa YYYY-MM-DD, `from` ≤ `to` y como máximo 62 días; 31 para huecos libres).",
          invalid_timezone: "Zona horaria no válida. Usa un nombre IANA, por ejemplo Europe/Madrid.",
        };
        return fail(e.message, msg[e.message] ?? e.message);
      }
      console.error("[mcp] tool error");
      return fail("internal_error", "Algo ha fallado. Inténtalo de nuevo más tarde.");
    }
  };
}

const handleOf = (h: string | null | undefined) => (h ? `@${h.replace(/^@/, "")}` : null);

/** Resuelve from/to/zona horaria (por defecto: hoy y los 6 días siguientes en Europe/Madrid). */
function resolveRange(a: { from?: string; to?: string; timezone?: string }, maxDays: number, defaultDays: number) {
  const tz = a.timezone ?? DEFAULT_TZ;
  if (!isValidTimeZone(tz)) throw new ToolError("invalid_timezone");
  const today = zonedParts(new Date(), tz).day;
  const from = a.from ?? today;
  const to = a.to ?? addDays(from, defaultDays - 1);
  if (!isIsoDay(from) || !isIsoDay(to) || from > to || daysBetween(from, to).length > maxDays) throw new ToolError("invalid_range");
  return { tz, from, to, today, startUtc: zonedToUtc(from, 0, tz).toISOString(), endUtc: zonedToUtc(addDays(to, 1), 0, tz).toISOString() };
}

const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");
const tzField = z.string().max(64).optional().describe(`Zona horaria IANA para días y horas (por defecto ${DEFAULT_TZ}).`);

export function createKreoMcpServer(ctx: McpContext) {
  const server = new McpServer(
    { name: "kreo", version: "2.0.0" },
    {
      instructions:
        "Kreo es la herramienta de contenido para redes sociales del usuario (TikTok, Instagram, YouTube). Empieza con get_overview para ver espacios, proyectos y cuentas. " +
        "Usa get_calendar, get_free_slots y get_best_times para planificar; get_weekly_summary para el resumen de la semana; list_tasks/create_task/update_task para las tareas del roadmap; create_draft_post para proponer publicaciones; " +
        "generate_image/generate_video + get_generation para crear medios con IA (cuestan créditos: indícalo antes; solo funcionan si el usuario activó «permitir gastar créditos» para esta conexión en Ajustes, con tope diario). Kreo NUNCA publica ni aprueba desde aquí: " +
        "todo queda como borrador o pendiente de aprobación humana en Kreo. Las fechas y horas se expresan en la zona horaria indicada (por defecto Europe/Madrid).",
    },
  );

  // =============================================================================================== RESUMEN
  server.registerTool(
    "get_overview",
    {
      title: "Resumen de Kreo",
      description:
        "Resumen del espacio de trabajo: proyectos, cuentas sociales conectadas (con su estado y límite diario anti-baneo), publicaciones programadas en los próximos 7 días, pendientes de aprobar, borradores, tareas abiertas/vencidas y créditos disponibles. Úsala primero para obtener los ids de proyectos y cuentas.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async () => {
      const ms = await memberships(ctx);
      if (!ms.size) return json({ workspaces: [], notice: "No perteneces a ningún espacio de trabajo de Kreo." });
      const wsIds = [...ms.keys()];
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 86400_000).toISOString();
      const today = now.toISOString().slice(0, 10);
      const [{ data: projects }, { data: accounts }, { data: credits }, { data: upcoming }, { data: pending }, { data: drafts }, { data: tasks }] = await Promise.all([
        ctx.db.from("projects").select("id, name, description, workspace_id").in("workspace_id", wsIds).is("archived_at", null).order("created_at"),
        ctx.db.from("social_accounts").select("id, project_id, platform, handle, status, daily_post_limit").in("workspace_id", wsIds).order("created_at"),
        ctx.db.from("credit_balances").select("workspace_id, balance").in("workspace_id", wsIds),
        ctx.db.from("posts").select("id, workspace_id, project_id, title, caption, status, scheduled_at").in("workspace_id", wsIds).in("status", ["approved", "scheduled"]).gte("scheduled_at", now.toISOString()).lt("scheduled_at", in7).order("scheduled_at").limit(200),
        ctx.db.from("posts").select("id, workspace_id").in("workspace_id", wsIds).eq("status", "pending_approval").limit(500),
        ctx.db.from("posts").select("id, workspace_id").in("workspace_id", wsIds).eq("status", "draft").limit(500),
        ctx.db.from("roadmap_tasks").select("id, workspace_id, due_date").in("workspace_id", wsIds).neq("status", "done").limit(2000),
      ]);
      const count = <T extends { workspace_id: string }>(rows: T[] | null, ws: string) => (rows ?? []).filter((r) => r.workspace_id === ws).length;
      return json({
        workspaces: wsIds.map((ws) => {
          const m = ms.get(ws)!;
          return {
            id: ws,
            name: m.name,
            your_role: m.role,
            plan: m.plan,
            credits: credits?.find((c) => c.workspace_id === ws)?.balance ?? 0,
            projects: (projects ?? [])
              .filter((p) => p.workspace_id === ws)
              .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                accounts: (accounts ?? []).filter((a) => a.project_id === p.id).map((a) => ({ id: a.id, platform: a.platform, handle: handleOf(a.handle), status: a.status, daily_post_limit: a.daily_post_limit })),
              })),
            scheduled_next_7_days: count(upcoming, ws),
            next_posts: (upcoming ?? [])
              .filter((p) => p.workspace_id === ws)
              .slice(0, 5)
              .map((p) => ({ id: p.id, project_id: p.project_id, title: p.title, caption_excerpt: p.caption.slice(0, 120), status: p.status, scheduled_at: p.scheduled_at })),
            pending_approval: count(pending, ws),
            drafts: count(drafts, ws),
            open_tasks: count(tasks, ws),
            overdue_tasks: (tasks ?? []).filter((t) => t.workspace_id === ws && t.due_date && t.due_date < today).length,
          };
        }),
        access: ctx.via === "oauth" ? "OAuth: limitado al espacio de trabajo autorizado." : "API key: todos tus espacios de trabajo.",
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "list_projects",
    {
      title: "Listar proyectos",
      description: "Lista los espacios de trabajo y proyectos de Kreo a los que tienes acceso, con tu rol en cada espacio.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async () => {
      const ms = await memberships(ctx);
      if (!ms.size) return json({ workspaces: [] });
      const { data: projects } = await ctx.db.from("projects").select("id, name, description, workspace_id").in("workspace_id", [...ms.keys()]).is("archived_at", null).order("created_at");
      return json({
        workspaces: [...ms.entries()].map(([id, m]) => ({
          id,
          name: m.name,
          role: m.role,
          projects: (projects ?? []).filter((p) => p.workspace_id === id).map((p) => ({ id: p.id, name: p.name, description: p.description })),
        })),
      });
    }),
  );

  // =============================================================================================== CALENDARIO
  server.registerTool(
    "get_calendar",
    {
      title: "Ver calendario de publicaciones",
      description:
        "Calendario de publicaciones por día (programadas, aprobadas, pendientes de aprobar, borradores con fecha, publicadas y fallidas) con red, cuenta, estado y hora local; incluye también las tareas del roadmap que vencen cada día y los borradores sin fecha. Por defecto: hoy y los 6 días siguientes. Máximo 62 días.",
      inputSchema: z.object({
        from: dayField.optional().describe("Primer día (YYYY-MM-DD). Por defecto, hoy."),
        to: dayField.optional().describe("Último día incluido (YYYY-MM-DD). Por defecto, from + 6 días."),
        project_id: z.uuid().optional().describe("Solo este proyecto. Sin él: todos los proyectos accesibles."),
        timezone: tzField,
        include_tasks: z.boolean().default(true).describe("Incluir las tareas del roadmap que vencen cada día."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { from?: string; to?: string; project_id?: string; timezone?: string; include_tasks: boolean }) => {
      const r = resolveRange(a, 62, 7);
      const projects = await scopeProjects(ctx, a.project_id);
      if (!projects.length) return json({ days: [], notice: "No hay proyectos." });
      const ids = projects.map((p) => p.id);
      const pname = new Map(projects.map((p) => [p.id, p.name]));
      const [{ data: posts }, { data: undated }, tasksRes] = await Promise.all([
        ctx.db
          .from("posts")
          .select("id, project_id, title, caption, status, scheduled_at, asset_ids, post_targets(status, social_account_id, social_accounts(platform, handle))")
          .in("project_id", ids)
          .neq("status", "cancelled")
          .gte("scheduled_at", r.startUtc)
          .lt("scheduled_at", r.endUtc)
          .order("scheduled_at")
          .limit(500),
        ctx.db.from("posts").select("id, project_id, title, caption, created_at").in("project_id", ids).eq("status", "draft").is("scheduled_at", null).order("created_at", { ascending: false }).limit(20),
        a.include_tasks
          ? ctx.db.from("roadmap_tasks").select("id, project_id, title, status, due_date, platform").in("project_id", ids).neq("status", "done").gte("due_date", r.from).lte("due_date", r.to).limit(300)
          : Promise.resolve({ data: [] as { id: string; project_id: string; title: string; status: string; due_date: string | null; platform: string | null }[] }),
      ]);
      const days = daysBetween(r.from, r.to).map((day) => ({
        date: day,
        weekday: zonedParts(zonedToUtc(day, 12 * 60, r.tz), r.tz).weekday,
        posts: [] as unknown[],
        tasks_due: [] as unknown[],
      }));
      const byDay = new Map(days.map((d) => [d.date, d]));
      for (const p of posts ?? []) {
        const z0 = zonedParts(new Date(p.scheduled_at!), r.tz);
        byDay.get(z0.day)?.posts.push({
          post_id: p.id,
          time: z0.time,
          status: p.status,
          project: pname.get(p.project_id),
          project_id: p.project_id,
          title: p.title,
          caption_excerpt: p.caption.slice(0, 160),
          media_count: p.asset_ids.length,
          targets: (p.post_targets ?? []).map((t) => ({ account_id: t.social_account_id, platform: t.social_accounts?.platform, handle: handleOf(t.social_accounts?.handle), status: t.status })),
        });
      }
      for (const t of tasksRes.data ?? []) {
        if (t.due_date) byDay.get(t.due_date)?.tasks_due.push({ task_id: t.id, title: t.title, status: t.status, platform: t.platform, project: pname.get(t.project_id) });
      }
      return json({
        timezone: r.tz,
        from: r.from,
        to: r.to,
        days,
        unscheduled_drafts: (undated ?? []).map((p) => ({ post_id: p.id, project: pname.get(p.project_id), title: p.title, caption_excerpt: p.caption.slice(0, 120) })),
        legend: "draft = borrador; pending_approval = esperando aprobación humana; approved/scheduled = aprobada (se publicará); published/failed = resultado.",
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "get_free_slots",
    {
      title: "Huecos libres del calendario",
      description:
        "Huecos libres del calendario de contenido: para cada día, las franjas sin publicaciones (horario 08:00–22:00 con 1 h de margen alrededor de cada publicación) y, por cada cuenta activa, cuántas publicaciones lleva planificadas frente a su límite diario anti-baneo (daily_post_limit), cuántas le quedan y una hora sugerida (según la frecuencia de la estrategia o la hora habitual de la red). Úsala antes de proponer fechas a create_draft_post. Máximo 31 días; los días pasados se omiten.",
      inputSchema: z.object({
        from: dayField.optional().describe("Primer día (YYYY-MM-DD). Por defecto, hoy."),
        to: dayField.optional().describe("Último día incluido (YYYY-MM-DD). Por defecto, from + 6 días."),
        project_id: z.uuid().optional().describe("Solo este proyecto. Sin él: todos los proyectos accesibles."),
        account_id: z.uuid().optional().describe("Solo esta cuenta social."),
        timezone: tzField,
        window_start_hour: z.number().int().min(0).max(23).default(8).describe("Inicio del horario en que se publica (hora local)."),
        window_end_hour: z.number().int().min(1).max(24).default(22).describe("Fin del horario (hora local)."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { from?: string; to?: string; project_id?: string; account_id?: string; timezone?: string; window_start_hour: number; window_end_hour: number }) => {
      if (a.window_end_hour <= a.window_start_hour) throw new ToolError("invalid_range");
      const r = resolveRange(a, 31, 7);
      const projects = await scopeProjects(ctx, a.project_id);
      if (!projects.length) return json({ days: [], notice: "No hay proyectos." });
      const ids = projects.map((p) => p.id);
      let accQ = ctx.db.from("social_accounts").select("id, project_id, platform, handle, status, daily_post_limit").in("project_id", ids).eq("status", "active");
      if (a.account_id) accQ = accQ.eq("id", a.account_id);
      const [{ data: accounts }, { data: strategies }, { data: posts }] = await Promise.all([
        accQ,
        ctx.db.from("strategies").select("project_id, social_account_id, frequency").in("project_id", ids),
        ctx.db
          .from("posts")
          .select("scheduled_at, status, post_targets(social_account_id)")
          .in("project_id", ids)
          .in("status", ["draft", ...PLANNED_STATUSES])
          // ±1 día: el límite se comprueba al aprobar por día UTC, que puede salirse del rango local pedido.
          .gte("scheduled_at", new Date(new Date(r.startUtc).getTime() - 86_400_000).toISOString())
          .lt("scheduled_at", new Date(new Date(r.endUtc).getTime() + 86_400_000).toISOString())
          .limit(1000),
      ]);
      if (a.account_id && !accounts?.length) return fail("not_found", "Cuenta no encontrada o no activa en tus proyectos.");
      const prefHour = (projectId: string, accountId: string, platform: string) => {
        const pick = (rows: typeof strategies) =>
          (rows ?? [])
            .flatMap((s) => (Array.isArray(s.frequency) ? (s.frequency as { platform?: string; hour?: number }[]) : []))
            .find((f) => f.platform === platform && typeof f.hour === "number")?.hour;
        return (
          pick((strategies ?? []).filter((s) => s.social_account_id === accountId)) ??
          pick((strategies ?? []).filter((s) => s.project_id === projectId && !s.social_account_id)) ??
          (["tiktok", "instagram", "youtube"].includes(platform) ? defaultFrequency(platform as "tiktok").hour : 13)
        );
      };
      // Mejores horas con historial propio (no el patrón orientativo; YouTube nunca): ordenan las horas sugeridas.
      const best = await loadProjectBestTimes(ctx.db, [...new Set((accounts ?? []).map((x) => x.project_id))], { timezone: r.tz }).catch(() => null);
      const scoresFor = (projectId: string, platform: string) => {
        const res = isBestTimePlatform(platform) ? best?.get(projectId)?.get(platform) : undefined;
        return res && res.source !== "default" ? res.grid : undefined;
      };
      const days = computeFreeSlots({
        days: daysBetween(r.from, r.to),
        tz: r.tz,
        now: new Date(),
        windowStartHour: a.window_start_hour,
        windowEndHour: a.window_end_hour,
        accounts: (accounts ?? []).map((x) => ({
          id: x.id,
          platform: x.platform,
          handle: handleOf(x.handle),
          dailyLimit: x.daily_post_limit,
          preferredHour: prefHour(x.project_id, x.id, x.platform),
          hourScores: scoresFor(x.project_id, x.platform),
        })),
        posts: (posts ?? []).filter((p) => p.scheduled_at).map((p) => ({ scheduledAt: p.scheduled_at!, status: p.status, accountIds: (p.post_targets ?? []).map((t) => t.social_account_id) })),
      });
      return json({
        timezone: r.tz,
        days,
        notes: [
          "planned cuenta publicaciones pendientes de aprobar, aprobadas, programadas o publicadas; los borradores con fecha (drafts) ocupan franja pero no límite.",
          "Kreo vuelve a comprobar el límite diario al aprobar (por día UTC): si se supera, la publicación no se programa. remaining y suggested_time ya tienen en cuenta el día UTC de la hora sugerida.",
          "Si una cuenta tiene ranked_times, la hora sugerida sale de su historial propio de rendimiento (get_best_times); si no, de la estrategia o la hora habitual de la red.",
          (accounts ?? []).length ? "" : "No hay cuentas activas conectadas: conecta una en Kreo › Cuentas.",
        ].filter(Boolean),
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "get_best_times",
    {
      title: "Mejores horas para publicar",
      description:
        "Mejores días y horas para publicar por red (TikTok, Instagram, YouTube) en un proyecto. Combina un patrón ORIENTATIVO por red (basado en estudios públicos del sector) con el historial propio de publicaciones hechas con Kreo y su rendimiento, que pesa más cuantas más muestras hay (mínimo 12). YouTube: solo el patrón orientativo (sus normas prohíben métricas derivadas). Úsala junto a get_free_slots antes de proponer horas.",
      inputSchema: z.object({
        project_id: z.uuid().optional().describe("Proyecto. Sin él: todos los proyectos accesibles."),
        platform: z.enum(["tiktok", "instagram", "youtube"]).optional().describe("Solo esta red. Sin ella: las redes con cuentas conectadas."),
        timezone: tzField,
        top: z.number().int().min(1).max(10).default(5),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { project_id?: string; platform?: BestTimePlatform; timezone?: string; top: number }) => {
      const tz = a.timezone ?? DEFAULT_TZ;
      if (!isValidTimeZone(tz)) throw new ToolError("invalid_timezone");
      const projects = await scopeProjects(ctx, a.project_id);
      if (!projects.length) return json({ projects: [], notice: "No hay proyectos." });
      const best = await loadProjectBestTimes(ctx.db, projects.map((p) => p.id), { timezone: tz, platforms: a.platform ? [a.platform] : undefined });
      const dayNames = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
      return json({
        timezone: tz,
        projects: projects.map((p) => ({
          project_id: p.id,
          project: p.name,
          platforms: [...(best.get(p.id) ?? new Map<BestTimePlatform, BestTimesResult>()).entries()].map(([platform, r]) => ({
            platform,
            source: r.source,
            samples_with_metrics: r.samples,
            min_samples: r.minSamples,
            history_weight: r.historyWeight,
            best: r.top.slice(0, a.top).map((s) => ({ weekday: dayNames[s.weekday], time: hhmm(s.hour * 60), score: s.score })),
          })),
        })),
        notes: [
          "source = default: solo el patrón orientativo; blended: patrón + historial propio; history: domina el historial propio.",
          "El patrón por defecto es orientativo (Sprout Social, Hootsuite y Buffer, sobre todo audiencias de EE. UU./globales); varía por país y audiencia.",
          "YouTube usa siempre solo el patrón orientativo: sus Developer Policies no permiten combinar sus datos para crear métricas.",
          "Las puntuaciones (0–100) son relativas: 100 = la mejor franja de esa red.",
        ],
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "get_weekly_summary",
    {
      title: "Resumen semanal",
      description:
        "Resumen de los últimos 7 días de un proyecto (o de todos): seguidores y variación por cuenta (YouTube aparte, solo suscriptores actuales, sin sumar ni comparar), publicaciones publicadas y fallidas, lo programado para los próximos 7 días y las tareas vencidas del roadmap. Es el mismo resumen que Kreo guarda cada lunes a las 8:00 como aviso.",
      inputSchema: z.object({
        project_id: z.uuid().optional().describe("Proyecto. Sin él: todos los proyectos accesibles (máx. 10)."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { project_id?: string }) => {
      const projects = (await scopeProjects(ctx, a.project_id)).slice(0, 10);
      if (!projects.length) return json({ projects: [], notice: "No hay proyectos." });
      const summaries = [];
      for (const p of projects) summaries.push(await loadWeeklySummary(ctx.db, { id: p.id, name: p.name }));
      return json({
        summaries,
        notes: [
          "period = los 7 días anteriores a hoy; next = hoy y los 6 días siguientes (zona Europe/Madrid).",
          "accounts.change = variación de seguidores en el periodo (null si no hay datos suficientes). YouTube va en `youtube` sin variación.",
        ],
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "list_scheduled_posts",
    {
      title: "Listar publicaciones próximas",
      description: "Lista las próximas publicaciones (pendientes de aprobar, aprobadas o programadas) de un proyecto o de todos tus proyectos.",
      inputSchema: z.object({
        project_id: z.uuid().optional(),
        status: z.enum(["pending_approval", "approved", "scheduled"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { project_id?: string; status?: "pending_approval" | "approved" | "scheduled"; limit: number }) => {
      const projects = await scopeProjects(ctx, a.project_id);
      if (!projects.length) return json({ posts: [] });
      const { data } = await ctx.db
        .from("posts")
        .select("id, project_id, title, caption, status, scheduled_at, post_targets(status, social_accounts(platform, handle))")
        .in("project_id", projects.map((p) => p.id))
        .in("status", a.status ? [a.status] : ["pending_approval", "approved", "scheduled"])
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(a.limit);
      return json({
        posts: (data ?? []).map((p) => ({
          id: p.id,
          project_id: p.project_id,
          title: p.title,
          caption_excerpt: p.caption.slice(0, 200),
          status: p.status,
          scheduled_at: p.scheduled_at,
          targets: (p.post_targets ?? []).map((t) => ({ platform: t.social_accounts?.platform, handle: handleOf(t.social_accounts?.handle), status: t.status })),
        })),
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "create_draft_post",
    {
      title: "Crear publicación en borrador",
      description:
        "Crea una publicación como BORRADOR en Kreo, con fecha propuesta, cuentas destino y medios opcionales (asset_ids de get_generation o de la biblioteca); opcionalmente la envía a aprobación humana. NUNCA aprueba ni publica: un admin debe aprobarla en Kreo. TikTok exige elegir la privacidad en Kreo antes de enviarla a aprobación, e Instagram/TikTok/YouTube necesitan medios. Avisa si la fecha supera el límite diario de alguna cuenta. Requiere rol editor. No cuesta créditos.",
      inputSchema: z.object({
        project_id: z.uuid(),
        caption: z.string().min(1).max(5000).describe("Texto de la publicación."),
        title: z.string().max(120).optional().describe("Título interno (y título de YouTube)."),
        scheduled_at: z.iso.datetime({ offset: true }).optional().describe("Fecha y hora propuestas (ISO 8601 con desfase, p. ej. 2026-11-25T19:00:00+01:00). Debe ser futura."),
        account_ids: z.array(z.uuid()).max(20).optional().describe("Ids de cuentas conectadas del proyecto (ver get_overview)."),
        asset_ids: z.array(z.uuid()).max(10).optional().describe("Ids de medios del proyecto (p. ej. el asset_id que devuelve get_generation)."),
        task_id: z.uuid().optional().describe("Tarea del roadmap a la que vincular este borrador."),
        submit_for_approval: z.boolean().default(false).describe("Enviar a aprobación humana si cumple las reglas de cada red."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    safe(
      async (a: {
        project_id: string;
        caption: string;
        title?: string;
        scheduled_at?: string;
        account_ids?: string[];
        asset_ids?: string[];
        task_id?: string;
        submit_for_approval: boolean;
      }) => {
        const p = await projectFor(ctx, a.project_id, "editor");
        if (a.scheduled_at && new Date(a.scheduled_at).getTime() < Date.now()) return fail("scheduled_in_past", "scheduled_at debe ser una fecha futura.");
        const ids = [...new Set(a.account_ids ?? [])];
        const { data: accounts } = ids.length
          ? await ctx.db.from("social_accounts").select("id, platform, handle, status, daily_post_limit").eq("project_id", p.id).in("id", ids)
          : { data: [] as { id: string; platform: string; handle: string | null; status: string; daily_post_limit: number }[] };
        if ((accounts ?? []).length !== ids.length) return fail("invalid_accounts", "Algunas account_ids no pertenecen a este proyecto.");
        const assetIds = [...new Set(a.asset_ids ?? [])];
        const { data: assets } = assetIds.length
          ? await ctx.db.from("assets").select("id, mime_type, ai_generated").eq("project_id", p.id).in("id", assetIds)
          : { data: [] as { id: string; mime_type: string; ai_generated: boolean }[] };
        if ((assets ?? []).length !== assetIds.length) return fail("invalid_assets", "Algunos asset_ids no pertenecen a este proyecto.");
        if (a.task_id) {
          const { data: task } = await ctx.db.from("roadmap_tasks").select("id").eq("id", a.task_id).eq("project_id", p.id).maybeSingle();
          if (!task) return fail("invalid_task", "La tarea no pertenece a este proyecto.");
        }
        const media: MediaKind[] = assetIds.map((id) => ((assets ?? []).find((x) => x.id === id)!.mime_type.startsWith("video/") ? "video" : "image"));

        const { data: post, error } = await ctx.db
          .from("posts")
          .insert({
            workspace_id: p.workspace_id,
            project_id: p.id,
            title: a.title?.trim() || null,
            caption: a.caption,
            scheduled_at: a.scheduled_at ?? null,
            asset_ids: assetIds,
            ai_generated: (assets ?? []).some((x) => x.ai_generated),
            created_by: ctx.userId,
          })
          .select("id, status")
          .single();
        if (error || !post) throw new Error("insert_failed");
        if (ids.length) {
          const { error: tErr } = await ctx.db.from("post_targets").insert(ids.map((id) => ({ post_id: post.id, workspace_id: p.workspace_id, social_account_id: id, platform_options: {} })));
          if (tErr) {
            await ctx.db.from("posts").delete().eq("id", post.id);
            throw new Error("targets_failed");
          }
        }
        if (a.task_id) await ctx.db.from("roadmap_tasks").update({ post_id: post.id }).eq("id", a.task_id).eq("project_id", p.id);
        await log(ctx, p.workspace_id, "post.created", "post", post.id);

        // Aviso anti-baneo: publicaciones del mismo día (UTC, igual que la comprobación al aprobar) por cuenta frente a su límite.
        const limitWarnings: { account_id: string; handle: string | null; day: string; planned_including_this: number; daily_limit: number }[] = [];
        if (a.scheduled_at && ids.length) {
          const day = new Date(a.scheduled_at).toISOString().slice(0, 10);
          const { data: same } = await ctx.db
            .from("post_targets")
            .select("social_account_id, posts!inner(id, status, scheduled_at)")
            .in("social_account_id", ids)
            .in("posts.status", [...PLANNED_STATUSES])
            .gte("posts.scheduled_at", `${day}T00:00:00Z`)
            .lt("posts.scheduled_at", `${addDays(day, 1)}T00:00:00Z`);
          for (const acc of accounts ?? []) {
            const n = (same ?? []).filter((t) => t.social_account_id === acc.id && t.posts?.id !== post.id).length + 1;
            if (n > acc.daily_post_limit) limitWarnings.push({ account_id: acc.id, handle: handleOf(acc.handle), day, planned_including_this: n, daily_limit: acc.daily_post_limit });
          }
        }

        let status = "draft";
        const blockers: { account_id: string; rules: string[] }[] = [];
        if (a.submit_for_approval) {
          for (const acc of accounts ?? []) {
            const rules: string[] = validateTarget(acc.platform, a.caption, media, {} as PlatformOptions);
            if (acc.status !== "active") rules.push("account_not_active");
            if (rules.length) blockers.push({ account_id: acc.id, rules });
          }
          if (!ids.length) blockers.push({ account_id: "-", rules: ["no_targets"] });
          if (!blockers.length) {
            // Mismo efecto que submit_post(): draft → pending_approval. La aprobación sigue siendo humana.
            await ctx.db.from("posts").update({ status: "pending_approval" }).eq("id", post.id).eq("status", "draft");
            await ctx.db.from("post_targets").update({ status: "pending_approval" }).eq("post_id", post.id);
            await log(ctx, p.workspace_id, "post.submitted", "post", post.id);
            status = "pending_approval";
          }
        }
        return json({
          post_id: post.id,
          status,
          scheduled_at: a.scheduled_at ?? null,
          edit_url_path: `/app/p/${p.id}/posts/${post.id}`,
          approval_blockers: blockers,
          daily_limit_warnings: limitWarnings,
          notice:
            status === "pending_approval"
              ? "Enviada a aprobación. Solo se programará cuando un admin la apruebe en Kreo."
              : "Guardada como borrador. Ábrela en Kreo para revisar, añadir medios o elegir opciones de cada red y enviarla a aprobación. Nada se publica automáticamente.",
        });
      },
    ),
  );

  // =============================================================================================== TAREAS
  server.registerTool(
    "list_tasks",
    {
      title: "Listar tareas pendientes",
      description:
        "Tareas del roadmap de estrategia (por defecto, las abiertas: por hacer y en curso) de un proyecto o de todos, con estado, fecha límite, red, hito y si están asignadas a ti; y, si include_warmup, las tareas MANUALES de los planes de calentamiento activos de hoy, atrasadas y de los próximos 7 días (Kreo nunca las ejecuta: las hace la persona).",
      inputSchema: z.object({
        project_id: z.uuid().optional(),
        status: z.enum(["open", "todo", "doing", "done", "all"]).default("open"),
        due_before: dayField.optional().describe("Solo tareas con fecha límite hasta este día (incluido)."),
        include_warmup: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { project_id?: string; status: "open" | "todo" | "doing" | "done" | "all"; due_before?: string; include_warmup: boolean; limit: number }) => {
      const projects = await scopeProjects(ctx, a.project_id);
      if (!projects.length) return json({ tasks: [], warmup: [] });
      const ids = projects.map((p) => p.id);
      const pname = new Map(projects.map((p) => [p.id, p.name]));
      let q = ctx.db
        .from("roadmap_tasks")
        .select("id, project_id, strategy_id, milestone_id, title, brief, platform, status, assignee_id, due_date, post_id, roadmap_milestones(title)")
        .in("project_id", ids)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(a.limit);
      if (a.status === "open") q = q.neq("status", "done");
      else if (a.status !== "all") q = q.eq("status", a.status);
      if (a.due_before) q = q.lte("due_date", a.due_before);
      const { data: tasks } = await q;
      const today = new Date().toISOString().slice(0, 10);

      let warmup: unknown[] = [];
      if (a.include_warmup) {
        const { data: plans } = await ctx.db.from("warmup_plans").select("id, project_id, platform, handle, start_date, duration_days").in("project_id", ids).eq("status", "active").limit(20);
        if (plans?.length) {
          const { data: wt } = await ctx.db.from("warmup_tasks").select("id, plan_id, day, title, category, target_count").in("plan_id", plans.map((x) => x.id)).is("done_at", null).order("day").limit(300);
          const limitDay = addDays(today, 7);
          warmup = (wt ?? [])
            .map((t) => {
              const plan = plans.find((x) => x.id === t.plan_id)!;
              return { task_id: t.id, project: pname.get(plan.project_id), platform: plan.platform, handle: handleOf(plan.handle), date: addDays(plan.start_date, t.day - 1), day: t.day, title: t.title, category: t.category, target_count: t.target_count };
            })
            .filter((t) => t.date <= limitDay)
            .slice(0, 60);
        }
      }
      return json({
        tasks: (tasks ?? []).map((t) => ({
          task_id: t.id,
          project_id: t.project_id,
          project: pname.get(t.project_id),
          title: t.title,
          brief: t.brief.slice(0, 300),
          status: t.status,
          due_date: t.due_date,
          overdue: !!t.due_date && t.due_date < today && t.status !== "done",
          platform: t.platform,
          milestone: t.roadmap_milestones?.title ?? null,
          assigned_to_you: t.assignee_id === ctx.userId,
          linked_post_id: t.post_id,
        })),
        warmup,
        notes: a.include_warmup ? ["Las tareas de calentamiento son acciones manuales: márcalas como hechas en Kreo › Calentamiento."] : [],
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "create_task",
    {
      title: "Crear tarea",
      description: `Crea una tarea en el roadmap de estrategia del proyecto (estado por hacer, fecha límite opcional, asignada a ti por defecto). Si el proyecto no tiene estrategia, crea una mínima ("Plan de contenido") con un hito "${TASKS_MILESTONE}"; si no indicas milestone_id, la tarea va al hito "${TASKS_MILESTONE}". Requiere rol editor. No cuesta créditos.`,
      inputSchema: z.object({
        project_id: z.uuid(),
        title: z.string().trim().min(1).max(200),
        brief: z.string().max(2000).optional().describe("Detalle o guion breve de la tarea."),
        due_date: dayField.optional().describe("Fecha límite (YYYY-MM-DD)."),
        platform: z.enum(["tiktok", "instagram", "youtube"]).optional(),
        status: z.enum(["todo", "doing", "done"]).default("todo"),
        milestone_id: z.uuid().optional().describe("Hito del roadmap (ver list_tasks)."),
        assign_to_me: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    safe(async (a: { project_id: string; title: string; brief?: string; due_date?: string; platform?: "tiktok" | "instagram" | "youtube"; status: "todo" | "doing" | "done"; milestone_id?: string; assign_to_me: boolean }) => {
      const p = await projectFor(ctx, a.project_id, "editor");
      if (a.due_date && !isIsoDay(a.due_date)) throw new ToolError("invalid_range");

      let strategyId: string;
      let milestoneId: string;
      let createdStrategy = false;
      if (a.milestone_id) {
        const { data: m } = await ctx.db.from("roadmap_milestones").select("id, strategy_id").eq("id", a.milestone_id).eq("project_id", p.id).maybeSingle();
        if (!m) return fail("invalid_milestone", "El hito no pertenece a este proyecto.");
        strategyId = m.strategy_id;
        milestoneId = m.id;
      } else {
        const { data: strategies } = await ctx.db.from("strategies").select("id, social_account_id").eq("project_id", p.id).order("created_at");
        let s = (strategies ?? []).find((x) => !x.social_account_id) ?? strategies?.[0];
        if (!s) {
          const { data: created, error } = await ctx.db
            .from("strategies")
            .insert({ workspace_id: p.workspace_id, project_id: p.id, title: "Plan de contenido", summary: "Creado desde Claude. Complétalo en Kreo › Estrategia.", source: "manual", created_by: ctx.userId })
            .select("id, social_account_id")
            .single();
          if (error || !created) throw new Error("strategy_failed");
          s = created;
          createdStrategy = true;
          await log(ctx, p.workspace_id, "strategy.created", "strategy", created.id);
        }
        strategyId = s.id;
        const { data: ms } = await ctx.db.from("roadmap_milestones").select("id, title, position").eq("strategy_id", s.id).order("position");
        const existing = (ms ?? []).find((m) => m.title === TASKS_MILESTONE);
        if (existing) milestoneId = existing.id;
        else {
          const { data: m, error } = await ctx.db
            .from("roadmap_milestones")
            .insert({ workspace_id: p.workspace_id, project_id: p.id, strategy_id: s.id, title: TASKS_MILESTONE, description: "Tareas sueltas creadas desde Claude o a mano.", position: Math.min(1000, (ms ?? []).length) })
            .select("id")
            .single();
          if (error || !m) throw new Error("milestone_failed");
          milestoneId = m.id;
        }
      }
      const { count } = await ctx.db.from("roadmap_tasks").select("id", { count: "exact", head: true }).eq("milestone_id", milestoneId);
      const { data: task, error } = await ctx.db
        .from("roadmap_tasks")
        .insert({
          workspace_id: p.workspace_id,
          project_id: p.id,
          strategy_id: strategyId,
          milestone_id: milestoneId,
          title: a.title,
          brief: a.brief ?? "",
          platform: a.platform ?? null,
          status: a.status,
          assignee_id: a.assign_to_me ? ctx.userId : null,
          due_date: a.due_date ?? null,
          position: Math.min(1000, count ?? 0),
        })
        .select("id")
        .single();
      if (error || !task) throw new Error("task_failed");
      await log(ctx, p.workspace_id, "task.created", "roadmap_task", task.id);
      return json({
        task_id: task.id,
        strategy_id: strategyId,
        milestone_id: milestoneId,
        created_strategy: createdStrategy,
        view_url_path: `/app/p/${p.id}/strategy`,
        notice: createdStrategy ? "El proyecto no tenía estrategia: se ha creado una mínima. Complétala en Kreo › Estrategia." : "Tarea creada.",
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "update_task",
    {
      title: "Actualizar tarea",
      description: "Cambia el estado (todo = por hacer, doing = en curso, done = hecha), la fecha límite, el título, el detalle o la red de una tarea del roadmap. Solo cambia los campos que envíes; due_date null quita la fecha. Requiere rol editor.",
      inputSchema: z.object({
        task_id: z.uuid(),
        status: z.enum(["todo", "doing", "done"]).optional(),
        due_date: dayField.nullable().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        brief: z.string().max(2000).optional(),
        platform: z.enum(["tiktok", "instagram", "youtube"]).nullable().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safe(async (a: { task_id: string; status?: "todo" | "doing" | "done"; due_date?: string | null; title?: string; brief?: string; platform?: "tiktok" | "instagram" | "youtube" | null }) => {
      const { data: t } = await ctx.db.from("roadmap_tasks").select("id, project_id").eq("id", a.task_id).maybeSingle();
      if (!t) throw new ToolError("not_found");
      const p = await projectFor(ctx, t.project_id, "editor");
      if (a.due_date && !isIsoDay(a.due_date)) throw new ToolError("invalid_range");
      const patch: Database["public"]["Tables"]["roadmap_tasks"]["Update"] = {};
      if (a.status !== undefined) patch.status = a.status;
      if (a.due_date !== undefined) patch.due_date = a.due_date;
      if (a.title !== undefined) patch.title = a.title;
      if (a.brief !== undefined) patch.brief = a.brief;
      if (a.platform !== undefined) patch.platform = a.platform;
      if (!Object.keys(patch).length) return fail("nothing_to_update", "No has indicado ningún cambio.");
      const { data: updated, error } = await ctx.db.from("roadmap_tasks").update(patch).eq("id", t.id).select("id, title, status, due_date, platform").single();
      if (error || !updated) throw new Error("update_failed");
      await log(ctx, p.workspace_id, "task.updated", "roadmap_task", t.id, a.status ? { status: a.status } : {});
      return json({ task: { task_id: updated.id, title: updated.title, status: updated.status, due_date: updated.due_date, platform: updated.platform } });
    }),
  );

  // =============================================================================================== ESTUDIO (IA)
  const startTool = (kind: "image" | "video") =>
    safe(async (a: { project_id: string; prompt: string; model_id: string; aspect: "1:1" | "9:16" | "16:9" | "4:5"; duration?: number; source_asset_id?: string; use_brand_colors?: boolean; idempotency_key?: string }) => {
      const p = await projectFor(ctx, a.project_id, "editor");
      const r = await startStudioGeneration(ctx.db, {
        userId: ctx.userId,
        project: p,
        kind,
        modelId: a.model_id,
        prompt: a.prompt,
        aspect: a.aspect,
        duration: a.duration,
        sourceAssetId: a.source_asset_id,
        useBrandColors: a.use_brand_colors ?? true,
        idempotencyKey: a.idempotency_key ?? crypto.randomUUID(),
        budget: creditBudget(ctx),
      });
      if (!r.ok) {
        const msg: Record<string, string> = {
          credits_disabled: CREDITS_DISABLED_MSG,
          credit_cap_reached: CREDIT_CAP_MSG,
          not_configured: "La generación con IA aún no está configurada en este servidor de Kreo.",
          invalid_model: `Modelo no válido. Opciones: ${modelsCostText(kind)}.`,
          invalid_duration: "Duración no admitida por ese modelo.",
          image_required: "Este modelo necesita source_asset_id: una imagen de la biblioteca del mismo proyecto.",
          banned_word: "El prompt contiene una palabra prohibida en el brand kit del proyecto.",
          insufficient_credits: "No hay créditos suficientes en este espacio de trabajo.",
          forbidden: "Tu rol no permite generar con IA (hace falta editor).",
          provider_error: "El proveedor de IA ha fallado. Los créditos se han devuelto.",
          generic: "No se ha podido iniciar la generación.",
        };
        return fail(r.error, msg[r.error]);
      }
      if (!r.alreadyStarted) await log(ctx, p.workspace_id, `ai.${kind}_started`, "ai_generation", r.generationId, { credits: r.credits });
      return json({
        generation_id: r.generationId,
        status: "pending",
        model: r.model,
        credits_used: r.alreadyStarted ? 0 : r.credits,
        credits_cost: r.credits,
        already_started: r.alreadyStarted,
        next_step: `Consulta el resultado con get_generation (las imágenes tardan segundos; los vídeos, 1–5 minutos). Si falla, los créditos se devuelven solos.`,
        notice: "El resultado queda en la biblioteca del proyecto marcado como generado con IA. No se publica nada.",
      });
    });

  server.registerTool(
    "generate_image",
    {
      title: "Generar imagen con IA",
      description: `Genera una imagen en el Estudio de Kreo (fal.ai, modelos con licencia comercial) y la guarda en la biblioteca del proyecto. CUESTA CRÉDITOS del espacio de trabajo: dile al usuario el coste antes. Modelos y coste: ${modelsCostText("image")}. Devuelve un generation_id: consulta el resultado con get_generation. Usa la misma idempotency_key si repites la llamada para no cobrar dos veces. Requiere rol editor.`,
      inputSchema: z.object({
        project_id: z.uuid(),
        prompt: z.string().trim().min(3).max(1500).describe("Descripción de la imagen."),
        model_id: z.string().max(40).default("flux-2-flash"),
        aspect: z.enum(["1:1", "9:16", "16:9", "4:5"]).default("9:16"),
        use_brand_colors: z.boolean().default(true).describe("Añadir la paleta del brand kit al prompt."),
        idempotency_key: z.uuid().optional().describe("Clave para reintentos sin doble cobro."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    startTool("image"),
  );

  server.registerTool(
    "generate_video",
    {
      title: "Generar vídeo con IA",
      description: `Genera un vídeo en el Estudio de Kreo (fal.ai, modelos con licencia comercial) a partir de texto, o animando una imagen de la biblioteca, y lo guarda en el proyecto. CUESTA CRÉDITOS (según modelo y duración): dile al usuario el coste antes. Modelos y coste: ${modelsCostText("video")}. Devuelve un generation_id: consulta el resultado con get_generation (tarda 1–5 min). Usa la misma idempotency_key si repites la llamada. Requiere rol editor.`,
      inputSchema: z.object({
        project_id: z.uuid(),
        prompt: z.string().trim().min(3).max(1500).describe("Descripción del vídeo (escena, movimiento, estilo)."),
        model_id: z.string().max(40).default("pixverse-v6"),
        duration: z.number().int().min(1).max(15).optional().describe("Segundos (según el modelo; por defecto el más corto)."),
        aspect: z.enum(["1:1", "9:16", "16:9", "4:5"]).default("9:16"),
        source_asset_id: z.uuid().optional().describe("Imagen de la biblioteca a animar (modelos imagen → vídeo)."),
        idempotency_key: z.uuid().optional().describe("Clave para reintentos sin doble cobro."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    startTool("video"),
  );

  server.registerTool(
    "get_generation",
    {
      title: "Consultar generación",
      description:
        "Estado de una generación de IA (pending, done o failed). Cuando termina, guarda el resultado en la biblioteca del proyecto (una sola vez) y devuelve su asset_id y un enlace temporal (1 h) para verlo; usa ese asset_id en create_draft_post. Si falló, los créditos ya se han devuelto. No cuesta créditos.",
      inputSchema: z.object({ generation_id: z.uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe(async (a: { generation_id: string }) => {
      const { data: gen } = await ctx.db
        .from("ai_generations")
        .select("id, workspace_id, project_id, created_by, status, params, credits_cost, created_at, kind, provider")
        .eq("id", a.generation_id)
        .maybeSingle();
      if (!gen) throw new ToolError("not_found");
      await projectFor(ctx, gen.project_id, "viewer");
      if (gen.provider !== "fal" || (gen.kind !== "image" && gen.kind !== "video")) {
        return json({ generation_id: gen.id, kind: gen.kind, status: gen.status === "succeeded" ? "done" : gen.status === "running" ? "pending" : "failed" });
      }
      const res = await settleStudioGeneration(ctx.db, gen);
      if (res.status !== "done") {
        return json({
          generation_id: gen.id,
          kind: gen.kind,
          status: res.status,
          ...(res.status === "failed" ? { notice: "La generación ha fallado o ha caducado. Los créditos se han devuelto." } : { notice: "Sigue en proceso. Vuelve a consultar en unos segundos." }),
        });
      }
      const { data: asset } = await ctx.db.from("assets").select("id, mime_type, width, height, storage_path").eq("id", res.assetId).single();
      const { data: signed } = asset ? await ctx.db.storage.from("project-media").createSignedUrl(asset.storage_path, 3600) : { data: null };
      return json({
        generation_id: gen.id,
        kind: gen.kind,
        status: "done",
        asset_id: res.assetId,
        mime_type: asset?.mime_type,
        width: asset?.width,
        height: asset?.height,
        preview_url: signed?.signedUrl ?? null,
        preview_expires_in_seconds: 3600,
        library_url_path: `/app/p/${gen.project_id}/studio`,
        next_step: "Para preparar una publicación, llama a create_draft_post con asset_ids: [asset_id]. Quedará como borrador.",
      });
    }),
  );

  // =============================================================================================== MÉTRICAS Y RESEARCH
  server.registerTool(
    "get_project_stats",
    {
      title: "Métricas del proyecto",
      description:
        "Métricas de contenido (seguidores, visualizaciones, likes, crecimiento) de las cuentas conectadas del proyecto en los últimos N días, publicaciones publicadas con Kreo y ventas de Shopify si hay tienda vinculada. Los canales de YouTube se muestran aparte y nunca se suman a los totales (políticas de la API de YouTube).",
      inputSchema: z.object({ project_id: z.uuid(), days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ project_id, days }: { project_id: string; days: 7 | 30 | 90 }) => {
      const p = await projectFor(ctx, project_id, "viewer");
      const period = lastDays(days, new Date());
      const [{ data: accounts }, { data: metrics }, { count: published }, { data: store }] = await Promise.all([
        ctx.db.from("social_accounts").select("id, platform, handle, status").eq("project_id", p.id),
        ctx.db.from("account_metrics_daily").select("social_account_id, day, followers, views, likes, social_accounts!inner(project_id, platform)").eq("social_accounts.project_id", p.id).gte("day", period.since).limit(5000),
        ctx.db.from("post_targets").select("id, posts!inner(project_id)", { count: "exact", head: true }).eq("posts.project_id", p.id).eq("status", "published").gte("published_at", `${period.since}T00:00:00Z`),
        ctx.db.from("shopify_stores").select("id, shop_domain, status, last_synced_at").eq("project_id", p.id).maybeSingle(),
      ]);
      const agg = aggregateMetrics(
        (metrics ?? []).map((m) => ({ accountId: m.social_account_id, platform: m.social_accounts?.platform ?? "", day: m.day, followers: m.followers, views: m.views, likes: m.likes })),
        period.since,
        period.until,
      );
      const names = new Map((accounts ?? []).map((a) => [a.id, handleOf(a.handle) ?? a.id]));
      let sales = null;
      if (store) {
        const { data: orders } = await ctx.db.from("shopify_orders").select("ordered_at, total, currency, cancelled, test, line_items").eq("project_id", p.id).gte("ordered_at", `${period.since}T00:00:00Z`).limit(10000);
        const s = salesSummary((orders ?? []).map((o) => ({ orderedAt: o.ordered_at, total: Number(o.total), currency: o.currency, cancelled: o.cancelled, test: o.test, lineItems: (o.line_items ?? []) as LineItem[] })));
        sales = { store: store.shop_domain, status: store.status, last_synced_at: store.last_synced_at, currency: s.currency, revenue: s.revenue, orders: s.orders, average_order_value: s.aov, top_products: s.topProducts.slice(0, 5) };
      }
      return json({
        project: { id: p.id, name: p.name },
        period,
        totals_excluding_youtube: agg.totals,
        accounts: agg.accounts.map((a) => ({ account: names.get(a.accountId), platform: a.platform, followers: a.followers, views: a.views, likes: a.likes, follower_growth: a.growth })),
        connected_accounts: (accounts ?? []).map((a) => ({ id: a.id, platform: a.platform, handle: a.handle, status: a.status })),
        posts_published_with_kreo: published ?? 0,
        shopify: sales,
        notes: agg.hasYouTube ? ["Los datos de YouTube se muestran por canal y no se combinan con otras redes."] : [],
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "analyze_competitor",
    {
      title: "Analizar competidor",
      description:
        "Devuelve los datos públicos guardados de un competidor seguido en el módulo de Investigación del proyecto (solo APIs oficiales): estadísticas del perfil, mejores publicaciones recientes con su múltiplo frente a la mediana y el último análisis de IA guardado (para canales de YouTube solo los datos tal como los da YouTube, sin métricas calculadas ni análisis de IA). Sin `competitor`, lista los competidores seguidos. No cuesta créditos.",
      inputSchema: z.object({ project_id: z.uuid(), competitor: z.string().max(200).optional().describe("Id o @usuario del competidor.") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { project_id: string; competitor?: string }) => {
      const p = await projectFor(ctx, a.project_id, "viewer");
      if (!(await tableAvailable(ctx, "research_competitors"))) return fail("not_available", "El análisis de competencia aún no está disponible.");
      const db = ctx.db as unknown as SupabaseClient;
      const { data: list } = await db.from("research_competitors").select("id, platform, handle, display_name, followers, total_views, media_count, last_fetched_at").eq("project_id", p.id).order("created_at");
      const rows = (list ?? []) as { id: string; platform: string; handle: string | null; display_name: string | null; followers: number | null; total_views: number | null; media_count: number | null; last_fetched_at: string | null }[];
      if (!a.competitor) return json({ competitors: rows });
      const needle = a.competitor.trim().replace(/^@/, "").toLowerCase();
      const c = rows.find((r) => r.id === a.competitor || r.handle?.replace(/^@/, "").toLowerCase() === needle);
      if (!c) return fail("not_found", "Ese competidor no está en seguimiento en este proyecto. Añádelo antes en Kreo › Investigación.");
      const { data: posts } = await db.from("research_competitor_posts").select("title, url, published_at, views, likes, comments").eq("competitor_id", c.id).order("published_at", { ascending: false }).limit(30);
      const ps = (posts ?? []) as { title: string | null; url: string | null; published_at: string | null; views: number | null; likes: number | null; comments: number | null }[];
      // YouTube Developer Policies III.E.2.b / III.E.4.h: sin auditoría (III.L) no se calculan métricas derivadas
      // (mediana, múltiplo) ni se entregan análisis de IA sobre canales ajenos. Mismo criterio que el módulo de investigación.
      const derived = c.platform !== "youtube" || youtubeDerivedAllowed();
      const views = ps.map((x) => x.views).filter((v): v is number => v !== null).sort((x, y) => x - y);
      const median = derived && views.length ? views[Math.floor(views.length / 2)] : null;
      const { data: analysis } = derived
        ? await db.from("research_analyses").select("result, agent_version, created_at").eq("subject_type", "competitor").eq("subject_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : { data: null };
      return json({
        competitor: c,
        ...(derived ? { median_views_last_30_posts: median } : {}),
        top_posts: [...ps]
          .sort((x, y) => (y.views ?? -1) - (x.views ?? -1))
          .slice(0, 10)
          .map((x) => (derived ? { ...x, multiple_vs_median: median && x.views !== null ? Math.round((x.views / median) * 10) / 10 : null } : x)),
        latest_ai_analysis: analysis ?? null,
        ...(c.platform === "youtube"
          ? {
              notes: [
                "Data from the YouTube Data API, shown as provided by YouTube. YouTube Terms of Service: https://www.youtube.com/t/terms · Google Privacy Policy: https://policies.google.com/privacy",
              ],
            }
          : {}),
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "search_products",
    {
      title: "Buscar productos guardados",
      description: "Busca en los productos guardados en el módulo de Investigación del proyecto (título y notas) y devuelve precio, coste y margen estimado.",
      inputSchema: z.object({ project_id: z.uuid(), query: z.string().max(100).optional(), limit: z.number().int().min(1).max(50).default(20) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (a: { project_id: string; query?: string; limit: number }) => {
      const p = await projectFor(ctx, a.project_id, "viewer");
      if (!(await tableAvailable(ctx, "research_products"))) return fail("not_available", "La búsqueda de productos aún no está disponible.");
      const db = ctx.db as unknown as SupabaseClient;
      let q = db
        .from("research_products")
        .select("id, title, notes, source, score, currency, sale_price, unit_cost, shipping_cost, fee_pct, cpa, ad_snapshot_url, created_at")
        .eq("project_id", p.id)
        .order("created_at", { ascending: false })
        .limit(a.limit);
      const term = a.query?.trim().replace(/[%_,()]/g, " ");
      if (term) q = q.or(`title.ilike.%${term}%,notes.ilike.%${term}%`);
      const { data } = await q;
      type P = { id: string; title: string; notes: string; source: string; score: number | null; currency: string; sale_price: number | null; unit_cost: number | null; shipping_cost: number | null; fee_pct: number | null; cpa: number | null; ad_snapshot_url: string | null };
      return json({
        products: ((data ?? []) as P[]).map((x) => {
          const price = x.sale_price === null ? null : Number(x.sale_price);
          const margin =
            price === null || x.unit_cost === null
              ? null
              : Math.round((price - Number(x.unit_cost) - Number(x.shipping_cost ?? 0) - (price * Number(x.fee_pct ?? 0)) / 100 - Number(x.cpa ?? 0)) * 100) / 100;
          return { id: x.id, title: x.title, notes: x.notes.slice(0, 300), source: x.source, score: x.score, currency: x.currency, sale_price: price, estimated_margin_per_unit: margin, ad_snapshot_url: x.ad_snapshot_url };
        }),
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "draft_reply",
    {
      title: "Redactar respuesta (borrador)",
      description: `Redacta un BORRADOR de respuesta a un mensaje, comentario o email con la voz de marca del proyecto. Nunca envía nada. Cuesta ${DRAFT_REPLY_CREDITS} crédito (rol editor).`,
      inputSchema: z.object({
        project_id: z.uuid(),
        message: z.string().min(1).max(4000),
        context: z.string().max(4000).optional(),
        tone: z.string().max(200).optional(),
        language: z.enum(["es", "en"]).default("es"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    safe(async (a: { project_id: string; message: string; context?: string; tone?: string; language: "es" | "en" }) => {
      const p = await projectFor(ctx, a.project_id, "editor");
      if (!isAgentsConfigured()) throw new ToolError("not_configured");
      const budget = creditBudget(ctx);
      const b = await budget.reserve(DRAFT_REPLY_CREDITS);
      if (b !== "ok") return fail(b === "disabled" ? "credits_disabled" : "credit_cap_reached", b === "disabled" ? CREDITS_DISABLED_MSG : CREDIT_CAP_MSG);
      const { data: genId, error } = await ctx.db.rpc("mcp_start_ai_generation", {
        p_user_id: ctx.userId,
        p_project_id: p.id,
        p_kind: "text",
        p_provider: "anthropic",
        p_model: "claude-opus-5-5",
        p_prompt: `mcp.draft_reply ${DRAFT_REPLY_VERSION}`, // sin el mensaje del tercero (minimización, igual que la bandeja)
        p_params: { agent: "mcp.draft_reply", version: DRAFT_REPLY_VERSION },
        p_credits: DRAFT_REPLY_CREDITS,
        p_license: { name: "Anthropic Commercial Terms", commercialUse: true },
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error || !genId) {
        await budget.release(DRAFT_REPLY_CREDITS);
        throw new ToolError(error?.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden");
      }
      try {
        const { data: kit } = await ctx.db.from("brand_kits").select("tone_of_voice, target_audience, banned_words, colors").eq("project_id", p.id).maybeSingle();
        const out = await draftReply(
          { projectName: p.name, tone: kit?.tone_of_voice ?? "", audience: kit?.target_audience ?? "", bannedWords: kit?.banned_words ?? [], colors: [] },
          { message: a.message, context: a.context, tone: a.tone, locale: a.language },
        );
        await ctx.db.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
        await log(ctx, p.workspace_id, "ai.draft_reply", "ai_generation", genId);
        return json({ draft: out.reply, check_before_sending: out.notes, credits_used: DRAFT_REPLY_CREDITS, notice: "Es un borrador. Kreo no ha enviado nada." });
      } catch (e) {
        await ctx.db.from("ai_generations").update({ status: "refunded", error_code: e instanceof AgentRefusalError ? "refusal" : "provider_error" }).eq("id", genId);
        await ctx.db.rpc("grant_credits", { p_workspace_id: p.workspace_id, p_amount: DRAFT_REPLY_CREDITS, p_reason: "refund_ai_failure", p_idempotency_key: `refund:${genId}` });
        return fail(e instanceof AgentRefusalError ? "refusal" : "provider_error", "La IA no ha podido redactar la respuesta. Se ha devuelto el crédito.");
      }
    }),
  );

  return server;
}
