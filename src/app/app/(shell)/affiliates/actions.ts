"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeAffiliateCode } from "@/lib/affiliates";
import { isStaffEmail } from "@/lib/affiliates/server";
import { getUser } from "@/lib/server/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AffState = { ok?: boolean; error?: "terms_required" | "invalid_code" | "not_applied" | "forbidden" | "not_configured" | "generic" } | undefined;

/** Unirse al programa (aceptando los términos de afiliado). */
export async function joinAffiliateProgram(_prev: AffState, formData: FormData): Promise<AffState> {
  if (formData.get("terms") !== "on") return { error: "terms_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_affiliate_program");
  if (error) return { error: error.code === "42501" ? "forbidden" : "generic" };
  revalidatePath("/app/affiliates");
  return { ok: true };
}

/** "¿Te recomendó alguien?": referido declarado por el propio usuario (sin cookies). */
export async function claimReferral(_prev: AffState, formData: FormData): Promise<AffState> {
  const code = normalizeAffiliateCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "invalid_code" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_referral", { p_code: code, p_source: "declared" });
  if (error) return { error: "generic" };
  if (!data) return { error: "not_applied" };
  return { ok: true };
}

/** Pago manual de una comisión (solo personal de Kreo: KREO_STAFF_EMAILS). */
export async function markCommissionPaid(_prev: AffState, formData: FormData): Promise<AffState> {
  const parsed = z.object({ id: z.uuid(), reference: z.string().trim().max(200) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const user = await getUser();
  if (!isStaffEmail(user?.email)) return { error: "forbidden" };
  // Exige sesión con 2FA si el usuario la tiene activada (aal2), igual que el resto de operaciones sensibles.
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return { error: "forbidden" };
  const admin = createAdminClient();
  if (!admin) return { error: "not_configured" };
  const { error } = await admin.rpc("mark_commission_paid", { p_commission_id: parsed.data.id, p_reference: parsed.data.reference });
  if (error) return { error: "generic" };
  revalidatePath("/app/affiliates");
  return { ok: true };
}
