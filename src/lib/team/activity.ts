/**
 * Registro de actividad → mensajes legibles (lógica pura). El texto vive en i18n:
 * `team.activity.messages.<key>` y `team.activity.actionNames.<key>`.
 */
export const KNOWN_ACTIONS = [
  "workspace.created",
  "project.created",
  "post.submitted",
  "post.approved",
  "member.invited",
  "member.joined",
  "member.role_changed",
  "member.removed",
  "member.left",
  "ownership.transferred",
  "invitation.revoked",
  "plan.changed",
] as const;
export type KnownAction = (typeof KNOWN_ACTIONS)[number];

export type ActivityRow = { action: string; entity_type: string | null; entity_id: string | null; metadata: unknown };

export type ActivityDescription =
  | { known: true; key: string; targetId: string | null; roleValues: Record<string, string>; planValues: Record<string, string> }
  | { known: false };

const ROLE_KEYS = ["role", "from", "to"] as const;

export function isKnownAction(action: string): action is KnownAction {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

export function describeActivity(row: ActivityRow): ActivityDescription {
  if (!isKnownAction(row.action)) return { known: false };
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  const targetId = row.entity_type === "member" && row.entity_id ? row.entity_id : null;
  const roleValues: Record<string, string> = {};
  const planValues: Record<string, string> = {};
  if (row.action === "plan.changed") {
    planValues.from = str("from");
    planValues.to = str("to");
  } else {
    for (const k of ROLE_KEYS) if (str(k)) roleValues[k] = str(k);
  }
  return { known: true, key: row.action.replace(".", "_"), targetId, roleValues, planValues };
}
