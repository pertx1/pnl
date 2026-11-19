"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { ShopifyError } from "@/lib/shopify/client";
import { buildUtmUrl, sanitizeDiscountCode, slugify } from "@/lib/shopify/core";
import { createDiscountCode, disconnectStore, syncOrders } from "@/lib/shopify/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ShopifyActionResult = { ok: true; url?: string; code?: string } | { ok?: false; error: string };

/** Proyecto + comprobación de rol con la sesión del usuario (RLS + has_workspace_role). */
async function guard(projectId: string, min: "editor" | "admin") {
  if (!z.uuid().safeParse(projectId).success) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: project } = await supabase.from("projects").select("id, workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return null;
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: min });
  if (!ok) return null;
  return { supabase, user: auth.user, project };
}

const path = (projectId: string) => `/app/p/${projectId}/shopify`;

export async function syncNow(projectId: string): Promise<ShopifyActionResult> {
  const g = await guard(projectId, "editor");
  if (!g) return { error: "forbidden" };
  const { data: store } = await g.supabase.from("shopify_stores").select("id, status").eq("project_id", projectId).maybeSingle();
  if (!store || store.status === "uninstalled") return { error: "not_connected" };
  try {
    await inngest.send({ name: "shopify/store.sync", data: { storeId: store.id } });
  } catch {
    // Sin Inngest (p. ej. en local): sincroniza aquí mismo.
    try {
      await syncOrders(store.id, 60);
    } catch (e) {
      return { error: e instanceof ShopifyError ? e.code : "generic" };
    }
  }
  revalidatePath(path(projectId));
  return { ok: true };
}

export async function disconnect(projectId: string): Promise<ShopifyActionResult> {
  const g = await guard(projectId, "admin");
  if (!g) return { error: "forbidden" };
  const { data: store } = await g.supabase.from("shopify_stores").select("id").eq("project_id", projectId).maybeSingle();
  if (!store) return { error: "not_connected" };
  try {
    await disconnectStore(store.id);
  } catch {
    return { error: "generic" };
  }
  await createAdminClient()?.from("activity_log").insert({ workspace_id: g.project.workspace_id, actor_id: g.user.id, action: "shopify.disconnected", entity_type: "shopify_store", entity_id: store.id, metadata: {} });
  revalidatePath(path(projectId));
  return { ok: true };
}

const targetSchema = z
  .object({
    projectId: z.uuid(),
    postId: z.uuid().nullable(),
    creator: z.string().trim().max(80).nullable(),
  })
  .refine((v) => v.postId || v.creator, { message: "target_required" });

/** Comprueba que el post (si lo hay) es del proyecto y devuelve una etiqueta legible. */
async function targetLabel(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string, postId: string | null, creator: string | null) {
  if (!postId) return creator!;
  const { data: post } = await supabase.from("posts").select("id, title, caption").eq("id", postId).eq("project_id", projectId).maybeSingle();
  if (!post) return null;
  const base = (post.title || post.caption || "").trim().slice(0, 60) || post.id.slice(0, 8);
  return creator ? `${base} · ${creator}` : base;
}

export async function createUtmLink(input: { projectId: string; postId: string | null; creator: string | null; destination: string }): Promise<ShopifyActionResult> {
  const parsed = targetSchema.safeParse(input);
  const dest = z.url({ protocol: /^https$/ }).max(1500).safeParse(input.destination);
  if (!parsed.success || !dest.success) return { error: "invalid_input" };
  const d = parsed.data;
  const g = await guard(d.projectId, "editor");
  if (!g) return { error: "forbidden" };
  const label = await targetLabel(g.supabase, d.projectId, d.postId, d.creator || null);
  if (!label) return { error: "invalid_input" };

  // utm_campaign = id del post (o slug del creador); utm_content = creador si hay post y creador.
  const creatorSlug = d.creator ? slugify(d.creator) || null : null;
  const campaign = d.postId ?? `creator-${creatorSlug ?? "x"}`;
  const utm = { source: "kreo", medium: creatorSlug && d.postId ? "creator" : d.postId ? "social" : "creator", campaign, content: d.postId ? creatorSlug : null };
  const url = buildUtmUrl(dest.data, utm);
  if (!url) return { error: "invalid_input" };
  const { error } = await g.supabase.from("commerce_attributions").insert({
    workspace_id: g.project.workspace_id,
    project_id: d.projectId,
    kind: "utm",
    post_id: d.postId,
    creator_label: d.creator || null,
    label,
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    url,
    created_by: g.user.id,
  });
  if (error) return { error: "generic" };
  revalidatePath(path(d.projectId));
  return { ok: true, url };
}

export async function createDiscount(input: { projectId: string; postId: string | null; creator: string | null; code: string; percent: number; endsAt: string | null }): Promise<ShopifyActionResult> {
  const parsed = targetSchema.safeParse(input);
  const code = sanitizeDiscountCode(input.code ?? "");
  const percent = z.number().min(1).max(90).safeParse(input.percent);
  const endsAt = input.endsAt ? z.iso.date().safeParse(input.endsAt) : null;
  if (!parsed.success || !code || !percent.success || (endsAt && !endsAt.success)) return { error: "invalid_input" };
  const d = parsed.data;
  const g = await guard(d.projectId, "editor");
  if (!g) return { error: "forbidden" };
  const label = await targetLabel(g.supabase, d.projectId, d.postId, d.creator || null);
  if (!label) return { error: "invalid_input" };
  const { data: store } = await g.supabase.from("shopify_stores").select("id, status").eq("project_id", d.projectId).maybeSingle();
  if (!store || store.status !== "active") return { error: "not_connected" };
  const { data: dup } = await g.supabase.from("commerce_attributions").select("id").eq("project_id", d.projectId).eq("discount_code", code).maybeSingle();
  if (dup) return { error: "code_taken" };

  const db = createAdminClient();
  if (!db) return { error: "not_configured" };
  try {
    const endsIso = input.endsAt ? new Date(`${input.endsAt}T23:59:59Z`).toISOString() : null;
    if (endsIso && new Date(endsIso).getTime() < Date.now()) return { error: "invalid_input" };
    const discountId = await createDiscountCode(store.id, { code, title: `Kreo · ${label}`.slice(0, 120), percent: percent.data, endsAt: endsIso });
    // Los códigos solo los inserta el servidor (la política RLS de inserción solo permite enlaces UTM).
    const { error } = await db.from("commerce_attributions").insert({
      workspace_id: g.project.workspace_id,
      project_id: d.projectId,
      kind: "discount",
      post_id: d.postId,
      creator_label: d.creator || null,
      label,
      discount_code: code,
      discount_percent: percent.data,
      shopify_discount_id: discountId,
      created_by: g.user.id,
    });
    if (error) return { error: "generic" };
    await db.from("activity_log").insert({ workspace_id: g.project.workspace_id, actor_id: g.user.id, action: "shopify.discount_created", entity_type: "discount", entity_id: discountId, metadata: { percent: percent.data } });
  } catch (e) {
    return { error: e instanceof ShopifyError ? e.code : "generic" };
  }
  revalidatePath(path(d.projectId));
  return { ok: true, code };
}

/** Quita la regla de atribución de Kreo (el código sigue existiendo en Shopify: se gestiona desde la tienda). */
export async function deleteAttribution(projectId: string, id: string): Promise<ShopifyActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };
  const g = await guard(projectId, "editor");
  if (!g) return { error: "forbidden" };
  const { data, error } = await g.supabase.from("commerce_attributions").delete().eq("id", id).eq("project_id", projectId).select("id");
  if (error || !data?.length) return { error: "forbidden" };
  revalidatePath(path(projectId));
  return { ok: true };
}
