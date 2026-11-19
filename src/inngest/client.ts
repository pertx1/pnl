import { Inngest } from "inngest";

/**
 * Cliente de Inngest (colas y tareas programadas).
 * Los eventos solo llevan IDs (nunca datos personales ni tokens): minimización + RGPD.
 */
export const inngest = new Inngest({ id: "kreo" });

export type PublishTargetEvent = { name: "post/target.publish"; data: { postTargetId: string; socialAccountId: string } };
