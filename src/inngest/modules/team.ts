// Funciones de Inngest del módulo "team" (se registran en ../functions.ts).
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

/**
 * Minimización de datos: borra invitaciones (con su email) que ya no sirven:
 * aceptadas, revocadas o caducadas hace más de 30 días.
 */
export const purgeOldInvitations = inngest.createFunction(
  { id: "team-purge-old-invitations", triggers: [{ cron: "TZ=Europe/Madrid 41 4 * * *" }], concurrency: 1 },
  async ({ step }) => {
    return step.run("purge", async () => {
      const admin = createAdminClient();
      if (!admin) return { skipped: "no_admin_client" };
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const [accepted, revoked, expired] = await Promise.all([
        admin.from("workspace_invitations").delete({ count: "exact" }).lt("accepted_at", cutoff),
        admin.from("workspace_invitations").delete({ count: "exact" }).lt("revoked_at", cutoff),
        admin.from("workspace_invitations").delete({ count: "exact" }).is("accepted_at", null).lt("expires_at", cutoff),
      ]);
      return { accepted: accepted.count ?? 0, revoked: revoked.count ?? 0, expired: expired.count ?? 0 };
    });
  },
);

export const teamFunctions = [purgeOldInvitations] as const;
