import { describe, expect, it } from "vitest";
import { describeActivity, isKnownAction } from "@/lib/team/activity";
import { assignableRoles, atLeast, canRemoveMember, canTransferOwnership, isValidInviteToken, leaveBlocker, teamErrorKey } from "@/lib/team/roles";

describe("roles del equipo", () => {
  it("orden de roles", () => {
    expect(atLeast("owner", "admin")).toBe(true);
    expect(atLeast("editor", "admin")).toBe(false);
    expect(atLeast("viewer", "viewer")).toBe(true);
  });

  it("solo admin+ puede cambiar roles y nunca asigna 'owner'", () => {
    expect(assignableRoles("editor", "viewer", 1)).toEqual([]);
    expect(assignableRoles("admin", "editor", 1)).toEqual(["viewer", "editor", "admin"]);
    expect(assignableRoles("admin", "editor", 1)).not.toContain("owner");
  });

  it("un admin no toca a un owner; un owner sí, si queda otro owner", () => {
    expect(assignableRoles("admin", "owner", 2)).toEqual([]);
    expect(assignableRoles("owner", "owner", 1)).toEqual([]);
    expect(assignableRoles("owner", "owner", 2)).toHaveLength(3);
  });

  it("quitar miembros", () => {
    expect(canRemoveMember("admin", "editor", false)).toBe(true);
    expect(canRemoveMember("admin", "owner", false)).toBe(false);
    expect(canRemoveMember("owner", "owner", false)).toBe(true);
    expect(canRemoveMember("owner", "editor", true)).toBe(false);
    expect(canRemoveMember("editor", "viewer", false)).toBe(false);
  });

  it("transferir propiedad: solo un owner, a otro miembro no owner", () => {
    expect(canTransferOwnership("owner", "admin", false)).toBe(true);
    expect(canTransferOwnership("admin", "editor", false)).toBe(false);
    expect(canTransferOwnership("owner", "owner", false)).toBe(false);
    expect(canTransferOwnership("owner", "admin", true)).toBe(false);
  });

  it("nunca dejar el workspace sin owner al salir", () => {
    expect(leaveBlocker("owner", 1, 1)).toBe("last_member");
    expect(leaveBlocker("owner", 3, 1)).toBe("transfer_ownership_required");
    expect(leaveBlocker("owner", 3, 2)).toBeNull();
    expect(leaveBlocker("editor", 2, 1)).toBeNull();
  });

  it("token de invitación: 64 hex", () => {
    expect(isValidInviteToken("a".repeat(64))).toBe(true);
    expect(isValidInviteToken("A".repeat(64))).toBe(false);
    expect(isValidInviteToken("a".repeat(63))).toBe(false);
    expect(isValidInviteToken("../" + "a".repeat(61))).toBe(false);
    expect(isValidInviteToken(undefined)).toBe(false);
  });

  it("traduce errores de la base de datos", () => {
    expect(teamErrorKey({ message: "plan_limit_members" })).toBe("plan_limit_members");
    expect(teamErrorKey({ message: "invitation_email_mismatch" })).toBe("invitation_email_mismatch");
    expect(teamErrorKey({ message: "x", code: "42501" })).toBe("forbidden");
    expect(teamErrorKey({ message: "boom" })).toBe("generic");
    expect(teamErrorKey(null)).toBe("generic");
  });
});

describe("registro de actividad", () => {
  it("reconoce acciones conocidas", () => {
    expect(isKnownAction("member.invited")).toBe(true);
    expect(isKnownAction("foo.bar")).toBe(false);
    expect(describeActivity({ action: "foo.bar", entity_type: null, entity_id: null, metadata: {} })).toEqual({ known: false });
  });

  it("cambio de rol: objetivo y roles", () => {
    const d = describeActivity({ action: "member.role_changed", entity_type: "member", entity_id: "u1", metadata: { from: "viewer", to: "editor" } });
    expect(d).toMatchObject({ known: true, key: "member_role_changed", targetId: "u1", roleValues: { from: "viewer", to: "editor" } });
  });

  it("cambio de plan: valores de plan, no de rol", () => {
    const d = describeActivity({ action: "plan.changed", entity_type: "workspace", entity_id: "w", metadata: { from: "free", to: "pro" } });
    expect(d).toMatchObject({ known: true, targetId: null, planValues: { from: "free", to: "pro" }, roleValues: {} });
  });

  it("metadata no válida no rompe", () => {
    expect(describeActivity({ action: "member.left", entity_type: "member", entity_id: "u", metadata: null })).toMatchObject({ known: true });
  });
});
