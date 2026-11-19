// Funciones de Inngest del módulo "research" (se registran en ../functions.ts).
import { NonRetriableError } from "inngest";
import { fetchOembed } from "@/lib/research/oembed";
import { refreshCompetitor } from "@/lib/research/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

const DAY = 86_400_000;
/** YouTube Developer Policies III.E.4: datos no autorizados → refrescar o borrar en ≤ 30 días. Margen de seguridad. */
const YT_REFRESH_AFTER_DAYS = 20;
const YT_MAX_AGE_DAYS = 29;

function admin() {
  const a = createAdminClient();
  if (!a) throw new NonRetriableError("SUPABASE_SECRET_KEY no configurada");
  return a;
}

// -----------------------------------------------------------------------------------------------
// 1) Cada 6 h: refresca los competidores seguidos (YouTube + Instagram) y crea alertas de outliers nuevos.
//    Secuencial (concurrency 1) para no gastar cuota de golpe: YouTube = 3 unidades por canal.
// -----------------------------------------------------------------------------------------------
export const researchCompetitorAlerts = inngest.createFunction(
  { id: "research-competitor-alerts", triggers: [{ cron: "TZ=Europe/Madrid 41 */6 * * *" }], concurrency: 1, retries: 1 },
  async ({ step }) => {
    const due = await step.run("list-due", async () => {
      const cutoff = new Date(Date.now() - 5 * 3600_000).toISOString();
      const { data } = await admin()
        .from("research_competitors")
        .select("id")
        .in("platform", ["youtube", "instagram"])
        .or(`last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`)
        .order("last_fetched_at", { ascending: true, nullsFirst: true })
        .limit(300);
      return (data ?? []).map((c) => c.id); // solo IDs en el estado de Inngest
    });
    let ok = 0;
    let alerts = 0;
    for (const id of due) {
      const r = await step.run(`refresh-${id}`, async () => {
        const db = admin();
        const { data: c } = await db.from("research_competitors").select("*").eq("id", id).maybeSingle();
        if (!c) return { ok: false, newAlerts: 0 };
        const res = await refreshCompetitor(db, c);
        return res.ok ? { ok: true, newAlerts: res.newAlerts } : { ok: false, newAlerts: 0 };
      });
      if (r.ok) ok++;
      alerts += r.newAlerts;
    }
    return { refreshed: ok, total: due.length, newAlerts: alerts };
  },
);

// -----------------------------------------------------------------------------------------------
// 2) Cada día: plazos de YouTube (≤ 30 días) para datos de terceros + refresco de metadatos oEmbed de YouTube.
// -----------------------------------------------------------------------------------------------
export const researchRetention = inngest.createFunction(
  { id: "research-retention", triggers: [{ cron: "TZ=Europe/Madrid 17 3 * * *" }], concurrency: 1, retries: 1 },
  async ({ step }) => {
    // a) Intentar refrescar canales de YouTube con datos de más de 20 días.
    const stale = await step.run("yt-stale", async () => {
      const cutoff = new Date(Date.now() - YT_REFRESH_AFTER_DAYS * DAY).toISOString();
      const { data } = await admin().from("research_competitors").select("id").eq("platform", "youtube").lt("last_fetched_at", cutoff).limit(500);
      return (data ?? []).map((c) => c.id);
    });
    for (const id of stale) {
      await step.run(`yt-refresh-${id}`, async () => {
        const db = admin();
        const { data: c } = await db.from("research_competitors").select("*").eq("id", id).maybeSingle();
        if (c) await refreshCompetitor(db, c);
        return true;
      });
    }

    // b) Lo que siga teniendo más de 29 días se borra (estadísticas, publicaciones, alertas y análisis derivados).
    const purged = await step.run("yt-purge", async () => {
      const db = admin();
      const cutoff = new Date(Date.now() - YT_MAX_AGE_DAYS * DAY).toISOString();
      const { data: yt } = await db.from("research_competitors").select("id, last_fetched_at").eq("platform", "youtube").limit(5000);
      const ids = (yt ?? []).map((c) => c.id);
      const expired = (yt ?? []).filter((c) => !c.last_fetched_at || c.last_fetched_at < cutoff).map((c) => c.id);
      let posts = 0;
      let analyses = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const r1 = await db.from("research_competitor_posts").delete({ count: "exact" }).in("competitor_id", chunk).lt("fetched_at", cutoff);
        posts += r1.count ?? 0;
        const r2 = await db.from("research_analyses").delete({ count: "exact" }).eq("subject_type", "competitor").in("subject_id", chunk).lt("created_at", cutoff);
        analyses += r2.count ?? 0;
      }
      for (let i = 0; i < expired.length; i += 200) {
        await db
          .from("research_competitors")
          .update({ followers: null, total_views: null, media_count: null, display_name: null, avatar_url: null, fetch_error: "data_expired" })
          .in("id", expired.slice(i, i + 200));
      }
      return { posts, analyses, competitors: expired.length };
    });

    // c) Swipe file: metadatos oEmbed de YouTube con más de 20 días → refrescar (o borrar si ya no existen).
    const swipes = await step.run("yt-oembed", async () => {
      const db = admin();
      const cutoff = new Date(Date.now() - YT_REFRESH_AFTER_DAYS * DAY).toISOString();
      const { data } = await db.from("research_swipes").select("id, url").eq("network", "youtube").lt("oembed_fetched_at", cutoff).limit(200);
      let n = 0;
      for (const s of data ?? []) {
        const meta = await fetchOembed("youtube", s.url);
        await db
          .from("research_swipes")
          .update(
            meta
              ? { title: meta.title, author_name: meta.authorName, thumbnail_url: meta.thumbnailUrl, oembed_fetched_at: new Date().toISOString() }
              : { title: null, author_name: null, thumbnail_url: null, oembed_fetched_at: null },
          )
          .eq("id", s.id);
        n++;
      }
      return n;
    });

    return { refreshed: stale.length, purged, swipesRefreshed: swipes };
  },
);

export const researchFunctions = [researchCompetitorAlerts, researchRetention] as const;
