import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exporta a CSV las métricas diarias de las cuentas de un proyecto (RLS: solo si el usuario tiene acceso). */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_metrics_daily")
    .select("day, followers, views, likes, posts_count, social_accounts!inner(project_id, platform, handle)")
    .eq("social_accounts.project_id", projectId)
    .order("day");
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Evita inyección de fórmulas en hojas de cálculo (=, +, -, @ al inicio).
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = [["day", "platform", "account", "followers", "views", "likes", "posts"]];
  for (const r of data ?? []) {
    rows.push([r.day, r.social_accounts?.platform, r.social_accounts?.handle, r.followers, r.views, r.likes, r.posts_count].map(cell) as string[]);
  }
  return new NextResponse(rows.map((r) => r.join(",")).join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kreo-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
