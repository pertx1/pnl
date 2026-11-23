import { NonRetriableError } from "inngest";
import type { PlatformOptions } from "@/lib/posts/rules";
import { getAdapter } from "@/lib/social";
import { publishTo } from "@/lib/social/publish";
import { loadTokens, saveTokens } from "@/lib/social/token-store";
import { PlatformError, type Platform, type TokenSet } from "@/lib/social/types";
import { refundGeneration, settleStudioGeneration, STUDIO_TIMEOUT_MS } from "@/lib/ai/settle";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "./client";

const AI_DISCLOSURE = "Contenido generado con IA · AI-generated content";

function admin() {
  const a = createAdminClient();
  if (!a) throw new NonRetriableError("SUPABASE_SECRET_KEY no configurada");
  return a;
}

/** Devuelve tokens vigentes; si caducan en < 5 min los refresca. Si no se puede, marca la cuenta como caducada. */
async function freshTokens(accountId: string, platform: Platform): Promise<TokenSet> {
  const adapter = getAdapter(platform)!;
  const tokens = await loadTokens(accountId);
  if (!tokens) throw new NonRetriableError("missing_tokens");
  const expiresSoon = tokens.accessExpiresAt && tokens.accessExpiresAt.getTime() < Date.now() + 5 * 60_000;
  if (!expiresSoon) return tokens;
  try {
    const refreshed = await adapter.refresh(tokens.refreshToken ?? tokens.accessToken);
    await saveTokens(accountId, { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken });
    return refreshed;
  } catch {
    await admin().from("social_accounts").update({ status: "expired" }).eq("id", accountId);
    throw new NonRetriableError("token_expired");
  }
}

/** Recalcula el estado del post a partir de sus destinos. */
async function settlePost(postId: string) {
  const db = admin();
  const { data: targets } = await db.from("post_targets").select("status").eq("post_id", postId);
  const s = (targets ?? []).map((t) => t.status);
  if (!s.length || s.some((x) => x === "publishing" || x === "scheduled")) return;
  const status = s.every((x) => x === "published") ? "published" : "failed";
  await db.from("posts").update({ status }).eq("id", postId);
}

// -----------------------------------------------------------------------------------------------
// 1) Cada minuto: busca destinos programados que ya toca publicar y lanza un evento por cada uno.
// -----------------------------------------------------------------------------------------------
export const dispatchDuePosts = inngest.createFunction(
  { id: "dispatch-due-posts", triggers: [{ cron: "* * * * *" }], concurrency: 1 },
  async ({ step }) => {
    const due = await step.run("find-due", async () => {
      const { data } = await admin()
        .from("post_targets")
        .select("id, social_account_id, posts!inner(status, scheduled_at)")
        .eq("status", "scheduled")
        .eq("posts.status", "scheduled")
        .lte("posts.scheduled_at", new Date().toISOString())
        .limit(200);
      return (data ?? []).map((t) => ({ id: t.id, accountId: t.social_account_id }));
    });
    if (due.length) {
      // id del evento = id del destino → Inngest descarta duplicados (no se publica dos veces).
      await step.sendEvent(
        "publish",
        due.map((d) => ({ id: `publish-${d.id}`, name: "post/target.publish", data: { postTargetId: d.id, socialAccountId: d.accountId } })),
      );
    }
    return { dispatched: due.length };
  },
);

// -----------------------------------------------------------------------------------------------
// 2) Publicar un destino. Una publicación a la vez por cuenta y ritmo limitado (rate limits + anti-baneo).
// -----------------------------------------------------------------------------------------------
export const publishTarget = inngest.createFunction(
  {
    id: "publish-target",
    triggers: [{ event: "post/target.publish" }],
    concurrency: { limit: 1, key: "event.data.socialAccountId" },
    throttle: { limit: 1, period: "1m", key: "event.data.socialAccountId" },
    retries: 2, // backoff exponencial gestionado por Inngest; nunca en bucle
    onFailure: async ({ event }) => {
      const id = (event.data.event.data as { postTargetId: string }).postTargetId;
      const db = admin();
      const { data } = await db
        .from("post_targets")
        .update({ status: "failed", error_code: String(event.data.error?.message ?? "unknown").slice(0, 120) })
        .eq("id", id)
        .eq("status", "publishing")
        .select("post_id");
      if (data?.[0]) await settlePost(data[0].post_id);
    },
  },
  async ({ event, step }) => {
    const { postTargetId } = event.data as { postTargetId: string };

    // Reclamar el destino de forma atómica (idempotencia): solo si sigue programado y aprobado.
    const claimed = await step.run("claim", async () => {
      const db = admin();
      const { data } = await db
        .from("post_targets")
        .update({ status: "publishing", attempts: 1 })
        .eq("id", postTargetId)
        .eq("status", "scheduled")
        .select("id, post_id, social_account_id")
        .maybeSingle();
      if (!data) return null;
      const { data: post } = await db.from("posts").select("id, status, approved_by").eq("id", data.post_id).single();
      // Garantía final: sin aprobación humana no se publica nada.
      if (!post || post.status !== "scheduled" || !post.approved_by) {
        await db.from("post_targets").update({ status: "scheduled" }).eq("id", postTargetId);
        return null;
      }
      await db.from("posts").update({ status: "publishing" }).eq("id", post.id);
      // Solo IDs: lo que devuelve un paso se guarda en Inngest (minimización, sin captions ni datos personales).
      return { postId: post.id, socialAccountId: data.social_account_id };
    });
    if (!claimed) return { skipped: true };

    const result = await step.run("publish", async () => {
      const db = admin();
      const [{ data: target }, { data: post }] = await Promise.all([
        db.from("post_targets").select("caption_override, platform_options").eq("id", postTargetId).single(),
        db.from("posts").select("id, caption, asset_ids, ai_generated").eq("id", claimed.postId).single(),
      ]);
      if (!target || !post) throw new NonRetriableError("post_not_found");
      const { data: account } = await db.from("social_accounts").select("id, platform, external_id, status").eq("id", claimed.socialAccountId).single();
      if (!account || account.status !== "active") throw new NonRetriableError("account_not_active");
      const platform = account.platform as Platform;
      const tokens = await freshTokens(account.id, platform);

      const { data: assets } = post.asset_ids.length
        ? await db.from("assets").select("id, storage_path, mime_type").in("id", post.asset_ids)
        : { data: [] };
      const ordered = post.asset_ids.map((id: string) => assets!.find((a) => a.id === id)).filter(Boolean) as { storage_path: string; mime_type: string }[];
      const media = await Promise.all(
        ordered.map(async (a) => {
          const { data } = await db.storage.from("project-media").createSignedUrl(a.storage_path, 60 * 60);
          const url = data!.signedUrl;
          return { url, mime: a.mime_type, bytes: async () => (await fetch(url)).arrayBuffer() };
        }),
      );

      const options = (target.platform_options ?? {}) as PlatformOptions;
      // Miniatura de YouTube: solo una imagen JPG/PNG del MISMO proyecto que la publicación.
      let thumbnail: { url: string; mime: string; bytes: () => Promise<ArrayBuffer> } | undefined;
      if (platform === "youtube" && options.yt_thumbnail_asset_id) {
        const { data: th } = await db
          .from("assets")
          .select("storage_path, mime_type, project_id")
          .eq("id", options.yt_thumbnail_asset_id)
          .maybeSingle();
        const { data: postProject } = await db.from("posts").select("project_id").eq("id", claimed.postId).single();
        if (th && postProject && th.project_id === postProject.project_id && /^image\/(jpeg|png)$/.test(th.mime_type)) {
          const { data: signed } = await db.storage.from("project-media").createSignedUrl(th.storage_path, 60 * 60);
          if (signed?.signedUrl) {
            const url = signed.signedUrl;
            thumbnail = { url, mime: th.mime_type, bytes: async () => (await fetch(url)).arrayBuffer() };
          }
        }
      }

      try {
        const out = await publishTo(platform, tokens, {
          externalId: account.external_id,
          caption: target.caption_override ?? post.caption,
          media,
          aiGenerated: post.ai_generated,
          options,
          aiDisclosure: AI_DISCLOSURE,
          thumbnail,
        });
        // Solo códigos (sin datos personales): pasos opcionales que no se pudieron completar.
        if (out.warnings?.length) console.warn(`[publish] ${platform} avisos: ${out.warnings.join(",")}`);
        return { externalPostId: out.externalPostId, url: out.url, warnings: out.warnings ?? [] };
      } catch (e) {
        // Errores de la plataforma que no se arreglan reintentando → no reintentar.
        if (e instanceof PlatformError && !["rate_limited", "unavailable"].includes(e.code)) throw new NonRetriableError(e.code);
        throw e;
      }
    });

    await step.run("save-result", async () => {
      const db = admin();
      await db
        .from("post_targets")
        .update({
          status: "published",
          external_post_id: result.externalPostId,
          external_url: result.url ?? null,
          published_at: new Date().toISOString(),
          // Publicado, pero con algún paso opcional pendiente (p. ej. "warn:thumbnail_403").
          error_code: result.warnings?.length ? `warn:${result.warnings.join(",")}`.slice(0, 120) : null,
        })
        .eq("id", postTargetId);
      await settlePost(claimed.postId);
    });
    return { published: result.externalPostId };
  },
);

// -----------------------------------------------------------------------------------------------
// 3) Cada 6 h: refrescar estadísticas de las cuentas propias (datos autorizados por el usuario).
// -----------------------------------------------------------------------------------------------
export const refreshMetrics = inngest.createFunction(
  {
    id: "refresh-account-metrics",
    // Cada 6 h para todas; y al momento (evento) para un proyecto: al conectar una cuenta o al abrir Analíticas sin datos.
    triggers: [{ cron: "TZ=Europe/Madrid 7 */6 * * *" }, { event: "social/metrics.refresh" }],
    concurrency: 1,
  },
  async ({ step, event }) => {
    const projectId = (event?.data as { projectId?: string } | undefined)?.projectId;
    const accounts = await step.run("list", async () => {
      let q = admin().from("social_accounts").select("id, workspace_id, platform, external_id, metadata").eq("status", "active");
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q.limit(1000);
      return data ?? [];
    });
    let ok = 0;
    for (const a of accounts) {
      const done = await step.run(`stats-${a.id}`, async () => {
        try {
          const adapter = getAdapter(a.platform)!;
          const tokens = await freshTokens(a.id, a.platform as Platform);
          const s = await adapter.fetchStats(tokens, { externalId: a.external_id, metadata: (a.metadata ?? {}) as Record<string, unknown> });
          const day = new Date().toISOString().slice(0, 10);
          await admin()
            .from("account_metrics_daily")
            .upsert({ social_account_id: a.id, workspace_id: a.workspace_id, day, followers: s.followers ?? null, views: s.views ?? null, likes: s.likes ?? null, posts_count: s.posts ?? null });
          await admin().from("social_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", a.id);
          return true;
        } catch (e) {
          // Una cuenta caída no bloquea a las demás. Solo se registra el tipo de error (sin tokens ni datos personales).
          const err = e as { code?: string; status?: number; message?: string };
          console.error("[metrics] fallo al leer estadísticas", { platform: a.platform, code: err.code ?? null, status: err.status ?? null, msg: (err.message ?? "").slice(0, 120) });
          return false;
        }
      });
      if (done) ok++;
    }
    return { refreshed: ok, total: accounts.length };
  },
);

// -----------------------------------------------------------------------------------------------
// 4) Cada día: plazos de borrado (minimización RGPD).
// -----------------------------------------------------------------------------------------------
export const dataRetention = inngest.createFunction(
  { id: "data-retention", triggers: [{ cron: "TZ=Europe/Madrid 23 4 * * *" }] },
  async ({ step }) => {
    const waitlist = await step.run("waitlist-unconfirmed", async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count } = await admin().from("waitlist").delete({ count: "exact" }).is("confirmed_at", null).lt("consent_at", cutoff);
      return count ?? 0;
    });
    // Servidor OAuth del MCP: límites por IP/usuario, códigos, tokens caducados y autorizaciones revocadas o abandonadas.
    const mcpOAuth = await step.run("mcp-oauth", async () => {
      const { purgeMcpOAuth } = await import("@/lib/mcp/oauth-retention");
      return purgeMcpOAuth(admin());
    });
    return { waitlistDeleted: waitlist, mcpOAuth };
  },
);

// -----------------------------------------------------------------------------------------------
// 5) Cada 10 min: cerrar generaciones de IA atascadas. Una generación cobrada siempre termina en
//    "succeeded" o "refunded", aunque la petición del navegador se cortara a mitad.
// -----------------------------------------------------------------------------------------------
export const settleStaleGenerations = inngest.createFunction(
  { id: "settle-stale-generations", triggers: [{ cron: "*/10 * * * *" }], concurrency: 1 },
  async ({ step }) => {
    // Estudio (imagen/vídeo en cola de fal.ai): se consulta su estado y se guarda o se devuelve.
    const studio = await step.run("studio", async () => {
      const db = admin();
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data } = await db
        .from("ai_generations")
        .select("id, workspace_id, project_id, created_by, status, params, credits_cost, created_at")
        .eq("status", "running")
        .in("kind", ["image", "video"])
        .not("params->>model_id", "is", null)
        .lt("created_at", cutoff)
        .limit(50);
      let closed = 0;
      for (const gen of data ?? []) {
        const r = await settleStudioGeneration(db, gen);
        if (r.status !== "pending") closed++;
      }
      return { checked: data?.length ?? 0, closed };
    });
    // Texto, voz y música son síncronos: si siguen "running" tras 30 min, la petición murió → devolver.
    const sync = await step.run("sync", async () => {
      const db = admin();
      const cutoff = new Date(Date.now() - STUDIO_TIMEOUT_MS).toISOString();
      const { data } = await db
        .from("ai_generations")
        .select("id, workspace_id, credits_cost")
        .eq("status", "running")
        .in("kind", ["text", "audio", "music"])
        .lt("created_at", cutoff)
        .limit(100);
      for (const g of data ?? []) await refundGeneration(db, g.id, g.workspace_id, g.credits_cost, "stale");
      return data?.length ?? 0;
    });
    return { studio, syncRefunded: sync };
  },
);

import { commerceFunctions } from "./modules/commerce";
import { inboxFunctions } from "./modules/inbox";
import { researchFunctions } from "./modules/research";
import { strategyFunctions } from "./modules/strategy";
import { teamFunctions } from "./modules/team";

export const functions = [
  dispatchDuePosts,
  publishTarget,
  refreshMetrics,
  dataRetention,
  settleStaleGenerations,
  ...researchFunctions,
  ...strategyFunctions,
  ...inboxFunctions,
  ...teamFunctions,
  ...commerceFunctions,
];
