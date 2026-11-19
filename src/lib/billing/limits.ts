/**
 * Límites por plan (lógica pura, sin servidor: se puede usar en cliente, servidor y tests).
 * El cumplimiento real lo hace la base de datos (create_project, upsert_social_account, create_invitation...);
 * esto sirve para AVISAR antes en la UI ("has llegado al límite → mejora tu plan").
 * Lectura del uso de un workspace: `getWorkspaceUsage()` en ./usage.ts (solo servidor).
 */
export type LimitKind = "projects" | "socialAccounts" | "members" | "credits";

export type LimitStatus = {
  kind: LimitKind;
  used: number;
  max: number;
  remaining: number;
  /** Uso de 0 a 1 (puede pasar de 1 si se bajó de plan). */
  ratio: number;
  reached: boolean;
  /** ≥ 80 % del límite, sin haberlo alcanzado. */
  near: boolean;
};

export const NEAR_LIMIT_RATIO = 0.8;

export function evaluateLimit(kind: LimitKind, used: number, max: number): LimitStatus {
  const safeMax = Math.max(0, Math.floor(max));
  const safeUsed = Math.max(0, Math.floor(used));
  const ratio = safeMax === 0 ? 1 : safeUsed / safeMax;
  const reached = safeUsed >= safeMax;
  return {
    kind,
    used: safeUsed,
    max: safeMax,
    remaining: Math.max(0, safeMax - safeUsed),
    ratio,
    reached,
    near: !reached && ratio >= NEAR_LIMIT_RATIO,
  };
}

/** ¿Se pueden añadir `count` elementos más? */
export function canAdd(status: Pick<LimitStatus, "used" | "max">, count = 1): boolean {
  return status.used + count <= status.max;
}

/** Errores de la base de datos que significan "límite del plan alcanzado". */
const PLAN_LIMIT_ERRORS: Record<string, LimitKind> = {
  plan_limit_projects: "projects",
  plan_limit_accounts: "socialAccounts",
  plan_limit_members: "members",
  insufficient_credits: "credits",
};

export function limitKindFromError(message: string | null | undefined): LimitKind | null {
  const msg = (message ?? "").toLowerCase();
  for (const [key, kind] of Object.entries(PLAN_LIMIT_ERRORS)) if (msg.includes(key)) return kind;
  return null;
}
