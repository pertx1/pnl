import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AgentRefusalError, isAgentsConfigured } from "@/lib/agents";
import { validateTarget, type PlatformOptions } from "@/lib/posts/rules";
import { youtubeDerivedAllowed } from "@/lib/research/config";
import { aggregateMetrics, lastDays } from "@/lib/reports/core";
import { salesSummary, type LineItem } from "@/lib/shopify/core";
import type { Database, WorkspaceRoleT } from "@/lib/supabase/database.types";
import { draftReply, DRAFT_REPLY_VERSION } from "./reply-agent";

/**
 * Servidor MCP de Kreo. Cada petición crea una instancia nueva (sin estado) ligada al usuario de la API key.
 * Todas las lecturas/escrituras pasan por el cliente de servicio, PERO cada herramienta comprueba antes el rol del
 * usuario en el workspace (viewer para leer, editor para crear borradores o usar IA). Sección 0:
 *  - create_draft_post crea un BORRADOR o lo envía a aprobación. NUNCA aprueba ni publica.
 *  - draft_reply devuelve un borrador. NUNCA envía nada.
 */

type Db = SupabaseClient<Database>;
export type McpContext = { userId: string; keyId: string; db: Db };

const ROLE_ORDER: WorkspaceRoleT[] = ["viewer", "editor", "admin", "owner"];
const atLeast = (r: WorkspaceRoleT | undefined, min: WorkspaceRoleT) => !!r && ROLE_ORDER.indexOf(r) >= ROLE_ORDER.indexOf(min);
const DRAFT_REPLY_CREDITS = 1;

class ToolError extends Error {}

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (code: string, message: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }], isError: true });

async function memberships(ctx: McpContext) {
  const { data } = await ctx.db.from("workspace_members").select("workspace_id, role, workspaces!inner(name)").eq("user_id", ctx.userId);
  return new Map((data ?? []).map((m) => [m.workspace_id, { role: m.role as WorkspaceRoleT, name: m.workspaces.name }]));
}

/** Proyecto accesible con al menos `min`. Lanza ToolError si no existe o no hay permiso (misma respuesta: no filtra existencia). */
async function projectFor(ctx: McpContext, projectId: string, min: WorkspaceRoleT) {
  const { data: p } = await ctx.db.from("projects").select("id, name, workspace_id").eq("id", projectId).is("archived_at", null).maybeSingle();
  if (!p) throw new ToolError("not_found");
  const { data: role } = await ctx.db.rpc("member_role", { p_user_id: ctx.userId, p_workspace_id: p.workspace_id });
  if (!atLeast(role ?? undefined, min)) throw new ToolError(atLeast(role ?? undefined, "viewer") ? "forbidden" : "not_found");
  return { ...p, role: role as WorkspaceRoleT };
}

async function log(ctx: McpContext, workspaceId: string, action: string, entityType?: string, entityId?: string, metadata: Record<string, string | number | boolean> = {}) {
  await ctx.db.from("activity_log").insert({ workspace_id: workspaceId, actor_id: ctx.userId, action, entity_type: entityType ?? null, entity_id: entityId ?? null, metadata: { via: "mcp", key: ctx.keyId.slice(0, 8), ...metadata } });
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
          not_found: "Project not found or you don't have access.",
          forbidden: "Your role in this workspace doesn't allow this action (editor or higher required).",
          insufficient_credits: "Not enough credits in this workspace.",
          not_configured: "This feature is not configured on this Kreo instance yet.",
        };
        return fail(e.message, msg[e.message] ?? e.message);
      }
      console.error("[mcp] tool error");
      return fail("internal_error", "Something went wrong. Try again later.");
    }
  };
}

export function createKreoMcpServer(ctx: McpContext) {
  const server = new McpServer({ name: "kreo", version: "1.0.0" });

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Lists the Kreo workspaces and projects you have access to, with your role in each workspace.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
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

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "get_project_stats",
    {
      title: "Get project stats",
      description:
        "Content metrics (followers, views, likes, growth) of the project's connected accounts for the last N days, posts published with Kreo, and Shopify sales if a store is linked. YouTube channels are reported separately and never added to totals (YouTube API policies).",
      inputSchema: z.object({ project_id: z.uuid(), days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }),
      annotations: { readOnlyHint: true },
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
      const names = new Map((accounts ?? []).map((a) => [a.id, a.handle ? `@${a.handle.replace(/^@/, "")}` : a.id]));
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
        notes: agg.hasYouTube ? ["YouTube data is shown per channel only and is not combined with other platforms."] : [],
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "create_draft_post",
    {
      title: "Create draft post",
      description:
        "Creates a post as a DRAFT in Kreo (optionally sends it for human approval). It never approves or publishes: an admin must approve it in Kreo, and media must be attached in Kreo when the network requires it. Requires editor role.",
      inputSchema: z.object({
        project_id: z.uuid(),
        caption: z.string().min(1).max(5000),
        title: z.string().max(120).optional(),
        scheduled_at: z.iso.datetime({ offset: true }).optional().describe("Proposed publish time (ISO 8601 with offset). Must be in the future."),
        account_ids: z.array(z.uuid()).max(20).optional().describe("Connected account ids of the project (see get_project_stats)."),
        submit_for_approval: z.boolean().default(false),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    safe(async (a: { project_id: string; caption: string; title?: string; scheduled_at?: string; account_ids?: string[]; submit_for_approval: boolean }) => {
      const p = await projectFor(ctx, a.project_id, "editor");
      if (a.scheduled_at && new Date(a.scheduled_at).getTime() < Date.now()) return fail("scheduled_in_past", "scheduled_at must be in the future.");
      const ids = [...new Set(a.account_ids ?? [])];
      const { data: accounts } = ids.length ? await ctx.db.from("social_accounts").select("id, platform").eq("project_id", p.id).in("id", ids) : { data: [] };
      if ((accounts ?? []).length !== ids.length) return fail("invalid_accounts", "Some account_ids don't belong to this project.");

      const { data: post, error } = await ctx.db
        .from("posts")
        .insert({ workspace_id: p.workspace_id, project_id: p.id, title: a.title?.trim() || null, caption: a.caption, scheduled_at: a.scheduled_at ?? null, created_by: ctx.userId })
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
      await log(ctx, p.workspace_id, "post.created", "post", post.id);

      let status = "draft";
      const blockers: { account_id: string; rules: string[] }[] = [];
      if (a.submit_for_approval) {
        for (const acc of accounts ?? []) {
          const rules = validateTarget(acc.platform, a.caption, [], {} as PlatformOptions);
          if (rules.length) blockers.push({ account_id: acc.id, rules });
        }
        if (!ids.length) blockers.push({ account_id: "-", rules: ["no_targets"] });
        if (!blockers.length) {
          // Mismo efecto que submit_post(): draft → pending_approval (el servidor puede cambiar el estado; la aprobación sigue siendo humana).
          await ctx.db.from("posts").update({ status: "pending_approval" }).eq("id", post.id).eq("status", "draft");
          await ctx.db.from("post_targets").update({ status: "pending_approval" }).eq("post_id", post.id);
          await log(ctx, p.workspace_id, "post.submitted", "post", post.id);
          status = "pending_approval";
        }
      }
      return json({
        post_id: post.id,
        status,
        edit_url_path: `/app/p/${p.id}/posts/${post.id}`,
        approval_blockers: blockers,
        notice:
          status === "pending_approval"
            ? "Sent for approval. It will only be scheduled after an admin approves it in Kreo."
            : "Saved as a draft. Open it in Kreo to add media, review and send it for approval. Nothing is published automatically.",
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "list_scheduled_posts",
    {
      title: "List scheduled posts",
      description: "Lists upcoming posts (pending approval, approved or scheduled) of one project or of all your projects.",
      inputSchema: z.object({
        project_id: z.uuid().optional(),
        status: z.enum(["pending_approval", "approved", "scheduled"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { project_id?: string; status?: "pending_approval" | "approved" | "scheduled"; limit: number }) => {
      let workspaceIds: string[];
      if (a.project_id) workspaceIds = [(await projectFor(ctx, a.project_id, "viewer")).workspace_id];
      else workspaceIds = [...(await memberships(ctx)).keys()];
      if (!workspaceIds.length) return json({ posts: [] });
      let q = ctx.db
        .from("posts")
        .select("id, project_id, title, caption, status, scheduled_at, post_targets(status, social_accounts(platform, handle))")
        .in("workspace_id", workspaceIds)
        .in("status", a.status ? [a.status] : ["pending_approval", "approved", "scheduled"])
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(a.limit);
      if (a.project_id) q = q.eq("project_id", a.project_id);
      const { data } = await q;
      return json({
        posts: (data ?? []).map((p) => ({
          id: p.id,
          project_id: p.project_id,
          title: p.title,
          caption_excerpt: p.caption.slice(0, 200),
          status: p.status,
          scheduled_at: p.scheduled_at,
          targets: (p.post_targets ?? []).map((t) => ({ platform: t.social_accounts?.platform, handle: t.social_accounts?.handle, status: t.status })),
        })),
      });
    }),
  );

  // ---------------------------------------------------------------------------------------------
  server.registerTool(
    "analyze_competitor",
    {
      title: "Analyze competitor",
      description:
        "Returns the saved public data of a competitor tracked in the project's Research module (official APIs only): profile stats, top recent posts with their multiple vs. the median, and the latest saved AI analysis (for YouTube channels only the data as provided by YouTube, without calculated metrics or AI analysis). Without `competitor`, lists the tracked competitors. Does not use credits.",
      inputSchema: z.object({ project_id: z.uuid(), competitor: z.string().max(200).optional().describe("Competitor id or handle.") }),
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { project_id: string; competitor?: string }) => {
      const p = await projectFor(ctx, a.project_id, "viewer");
      if (!(await tableAvailable(ctx, "research_competitors"))) return fail("not_available", "Competitor analysis is not available yet.");
      const db = ctx.db as unknown as SupabaseClient;
      const { data: list } = await db.from("research_competitors").select("id, platform, handle, display_name, followers, total_views, media_count, last_fetched_at").eq("project_id", p.id).order("created_at");
      const rows = (list ?? []) as { id: string; platform: string; handle: string | null; display_name: string | null; followers: number | null; total_views: number | null; media_count: number | null; last_fetched_at: string | null }[];
      if (!a.competitor) return json({ competitors: rows });
      const needle = a.competitor.trim().replace(/^@/, "").toLowerCase();
      const c = rows.find((r) => r.id === a.competitor || r.handle?.replace(/^@/, "").toLowerCase() === needle);
      if (!c) return fail("not_found", "Competitor not tracked in this project. Add it in Kreo › Research first.");
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
      title: "Search saved products",
      description: "Searches the products saved in the project's Research module (title and notes) and returns price, cost and estimated margin.",
      inputSchema: z.object({ project_id: z.uuid(), query: z.string().max(100).optional(), limit: z.number().int().min(1).max(50).default(20) }),
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { project_id: string; query?: string; limit: number }) => {
      const p = await projectFor(ctx, a.project_id, "viewer");
      if (!(await tableAvailable(ctx, "research_products"))) return fail("not_available", "Product search is not available yet.");
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
      title: "Draft a reply",
      description: `Writes a DRAFT reply to a message/comment/email in the project's brand voice. It never sends anything. Costs ${DRAFT_REPLY_CREDITS} credit (editor role).`,
      inputSchema: z.object({
        project_id: z.uuid(),
        message: z.string().min(1).max(4000),
        context: z.string().max(4000).optional(),
        tone: z.string().max(200).optional(),
        language: z.enum(["es", "en"]).default("es"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    safe(async (a: { project_id: string; message: string; context?: string; tone?: string; language: "es" | "en" }) => {
      const p = await projectFor(ctx, a.project_id, "editor");
      if (!isAgentsConfigured()) throw new ToolError("not_configured");
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
      if (error || !genId) throw new ToolError(error?.message.includes("insufficient_credits") ? "insufficient_credits" : "forbidden");
      try {
        const { data: kit } = await ctx.db.from("brand_kits").select("tone_of_voice, target_audience, banned_words, colors").eq("project_id", p.id).maybeSingle();
        const out = await draftReply(
          { projectName: p.name, tone: kit?.tone_of_voice ?? "", audience: kit?.target_audience ?? "", bannedWords: kit?.banned_words ?? [], colors: [] },
          { message: a.message, context: a.context, tone: a.tone, locale: a.language },
        );
        await ctx.db.from("ai_generations").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", genId);
        await log(ctx, p.workspace_id, "ai.draft_reply", "ai_generation", genId);
        return json({ draft: out.reply, check_before_sending: out.notes, credits_used: DRAFT_REPLY_CREDITS, notice: "This is a draft. Kreo has not sent anything." });
      } catch (e) {
        await ctx.db.from("ai_generations").update({ status: "refunded", error_code: e instanceof AgentRefusalError ? "refusal" : "provider_error" }).eq("id", genId);
        await ctx.db.rpc("grant_credits", { p_workspace_id: p.workspace_id, p_amount: DRAFT_REPLY_CREDITS, p_reason: "refund_ai_failure", p_idempotency_key: `refund:${genId}` });
        return fail(e instanceof AgentRefusalError ? "refusal" : "provider_error", "The AI could not draft a reply. Your credit was refunded.");
      }
    }),
  );

  return server;
}
