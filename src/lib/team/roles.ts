/**
 * Reglas de roles del equipo (lógica pura; la base de datos aplica las mismas reglas en
 * change_member_role / remove_member / transfer_ownership — esto solo decide qué mostrar en la UI).
 *
 * viewer < editor < admin < owner
 *  - admin+: invitar, cambiar roles (no de owners), quitar miembros (no owners), ver actividad, aprobar.
 *  - owner: además transferir la propiedad, tocar a otros owners, facturación.
 *  - Nunca se puede dejar el workspace sin owner.
 */
export type Role = "viewer" | "editor" | "admin" | "owner";

export const ROLE_ORDER: Role[] = ["viewer", "editor", "admin", "owner"];
export const INVITABLE_ROLES: Exclude<Role, "owner">[] = ["viewer", "editor", "admin"];

export function roleRank(role: Role) {
  return ROLE_ORDER.indexOf(role);
}

export function atLeast(role: Role, min: Role) {
  return roleRank(role) >= roleRank(min);
}

/** Roles que `actor` puede asignar a un miembro con rol `target` (vacío = no puede cambiarlo). */
export function assignableRoles(actor: Role, target: Role, ownerCount: number): Exclude<Role, "owner">[] {
  if (!atLeast(actor, "admin")) return [];
  if (target === "owner" && (actor !== "owner" || ownerCount <= 1)) return [];
  return INVITABLE_ROLES;
}

export function canRemoveMember(actor: Role, target: Role, isSelf: boolean): boolean {
  if (isSelf || !atLeast(actor, "admin")) return false;
  return target !== "owner" || actor === "owner";
}

export function canTransferOwnership(actor: Role, target: Role, isSelf: boolean): boolean {
  return actor === "owner" && !isSelf && target !== "owner";
}

/** ¿Puede salir del workspace? El último owner con más miembros debe transferir antes; el único miembro no puede. */
export function leaveBlocker(role: Role, memberCount: number, ownerCount: number): "last_member" | "transfer_ownership_required" | null {
  if (memberCount <= 1) return "last_member";
  if (role === "owner" && ownerCount <= 1) return "transfer_ownership_required";
  return null;
}

/** Token de invitación: 32 bytes en hexadecimal (create_invitation). */
export function isValidInviteToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}

export const TEAM_ERRORS = [
  "forbidden",
  "invalid_role",
  "invalid_email",
  "already_member",
  "rate_limited",
  "plan_limit_members",
  "last_owner",
  "last_member",
  "transfer_ownership_required",
  "invalid_target",
  "not_found",
  "invitation_invalid",
  "invitation_expired",
  "invitation_email_mismatch",
  "mfa_required",
  "email_failed",
] as const;
export type TeamError = (typeof TEAM_ERRORS)[number] | "generic" | "invalid_input";

/** Traduce el error de la base de datos a una clave de i18n de `team.errors`. */
export function teamErrorKey(error: unknown): TeamError {
  const e = error as { message?: string; code?: string } | null;
  const msg = (e?.message ?? "").toLowerCase();
  for (const k of TEAM_ERRORS) if (msg.includes(k)) return k;
  if (e?.code === "42501") return "forbidden";
  return "generic";
}
