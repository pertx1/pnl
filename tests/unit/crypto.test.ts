import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("cifrado de tokens OAuth", () => {
  it("cifra y descifra; nunca deja el token en claro", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto/tokens");
    const enc = encryptToken("secreto-123");
    expect(enc).not.toContain("secreto-123");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptToken(enc)).toBe("secreto-123");
  });

  it("detecta manipulación (GCM)", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto/tokens");
    const parts = encryptToken("x").split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });

  it("firma y verifica el estado OAuth; rechaza alteraciones", async () => {
    const { sign, verify } = await import("@/lib/crypto/tokens");
    const s = sign("abc");
    expect(verify(s)).toBe("abc");
    expect(verify(s.replace("abc", "abd"))).toBeNull();
  });

  it("estado OAuth caduca y lleva PKCE cuando se pide", async () => {
    const { newState, readState } = await import("@/lib/social/oauth-state");
    const st = newState("00000000-0000-0000-0000-000000000000", true);
    expect(st.challenge).toBeTruthy();
    expect(readState(st.cookie)?.projectId).toBe("00000000-0000-0000-0000-000000000000");
    expect(readState(st.cookie + "x")).toBeNull();
  });
});
