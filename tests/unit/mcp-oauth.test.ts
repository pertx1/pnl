import { describe, expect, it } from "vitest";
import {
  buildRedirect,
  canonicalResource,
  checkAuthorizeRequest,
  generateClientId,
  generateToken,
  hashToken,
  isCimdClientId,
  isDcrClientId,
  isValidCodeChallenge,
  isValidCodeVerifier,
  isWellFormedToken,
  parseCimdDocument,
  parseRegistrationRequest,
  redirectUriMatches,
  resourceMatches,
  s256,
  validateRedirectUri,
  verifyPkce,
  wwwAuthenticate,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from "@/lib/mcp/oauth";
import { safeNext } from "@/lib/auth/safe-next";

const RESOURCE = "https://kreo-nine.vercel.app/api/mcp";
const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";

describe("PKCE S256 (RFC 7636)", () => {
  it("calcula el challenge del ejemplo del RFC 7636 (apéndice B)", () => {
    expect(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("verifica verifier/challenge correctos e incorrectos", () => {
    const v = "a".repeat(43);
    expect(verifyPkce(v, s256(v))).toBe(true);
    expect(verifyPkce("b".repeat(43), s256(v))).toBe(false);
    expect(verifyPkce("corto", s256(v))).toBe(false);
  });
  it("valida el formato del verifier (43–128, caracteres sin reservar) y del challenge", () => {
    expect(isValidCodeVerifier("x".repeat(42))).toBe(false);
    expect(isValidCodeVerifier("x".repeat(129))).toBe(false);
    expect(isValidCodeVerifier("Az09-._~".repeat(6))).toBe(true);
    expect(isValidCodeVerifier("a b".repeat(20))).toBe(false);
    expect(isValidCodeChallenge(s256("y".repeat(50)))).toBe(true);
    expect(isValidCodeChallenge("plain-challenge")).toBe(false);
  });
});

describe("tokens y hashing", () => {
  it("genera tokens aleatorios con prefijo y 256 bits", () => {
    const a = generateToken("access");
    const b = generateToken("access");
    expect(a).not.toBe(b);
    expect(isWellFormedToken("access", a)).toBe(true);
    expect(isWellFormedToken("refresh", a)).toBe(false);
    expect(isWellFormedToken("refresh", generateToken("refresh"))).toBe(true);
    expect(isWellFormedToken("code", generateToken("code"))).toBe(true);
    expect(isWellFormedToken("access", "kreo_sk_" + "a".repeat(43))).toBe(false);
  });
  it("guarda solo SHA-256 en hex (64 caracteres, determinista)", () => {
    const t = generateToken("refresh");
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t.slice(8, 20));
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("caducidades: acceso 1 h, refresco 30 días", () => {
    expect(ACCESS_TTL_SECONDS).toBe(3600);
    expect(REFRESH_TTL_SECONDS).toBe(30 * 86400);
  });
  it("client_id de registro dinámico", () => {
    expect(isDcrClientId(generateClientId())).toBe(true);
    expect(isDcrClientId("kreo_cl_x")).toBe(false);
  });
});

describe("redirect URIs", () => {
  it("acepta https y http solo en loopback", () => {
    expect(validateRedirectUri(CLAUDE_CB)).toEqual({ ok: true, uri: CLAUDE_CB, loopback: false });
    expect(validateRedirectUri("http://localhost:3118/callback")).toMatchObject({ ok: true, loopback: true });
    expect(validateRedirectUri("http://127.0.0.1/callback")).toMatchObject({ ok: true, loopback: true });
    expect(validateRedirectUri("http://[::1]:9000/cb")).toMatchObject({ ok: true, loopback: true });
    expect(validateRedirectUri("http://evil.example/callback").ok).toBe(false);
    expect(validateRedirectUri("javascript:alert(1)").ok).toBe(false);
    expect(validateRedirectUri("myapp://callback").ok).toBe(false);
    expect(validateRedirectUri("https://claude.ai/cb#frag").ok).toBe(false);
    expect(validateRedirectUri("https://user:pass@claude.ai/cb").ok).toBe(false);
    expect(validateRedirectUri(123).ok).toBe(false);
  });
  it("coincidencia exacta salvo el puerto en loopback (RFC 8252 §7.3)", () => {
    expect(redirectUriMatches(CLAUDE_CB, [CLAUDE_CB])).toBe(true);
    expect(redirectUriMatches(`${CLAUDE_CB}/`, [CLAUDE_CB])).toBe(false);
    expect(redirectUriMatches("https://claude.ai/api/mcp/auth_callback?x=1", [CLAUDE_CB])).toBe(false);
    expect(redirectUriMatches("https://CLAUDE.ai/api/mcp/auth_callback", [CLAUDE_CB])).toBe(false);
    expect(redirectUriMatches("http://localhost:51234/callback", ["http://localhost/callback"])).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1:8080/callback", ["http://127.0.0.1/callback"])).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1:8080/other", ["http://127.0.0.1/callback"])).toBe(false);
    expect(redirectUriMatches("http://localhost:8080/callback", ["http://127.0.0.1/callback"])).toBe(false);
    expect(redirectUriMatches("https://localhost:8080/callback", ["http://localhost/callback"])).toBe(false);
    expect(redirectUriMatches("http://evil.example:80/callback", ["http://localhost/callback"])).toBe(false);
  });
  it("buildRedirect conserva la query registrada y añade code/state/iss", () => {
    const u = new URL(buildRedirect("https://app.example/cb?keep=1", { code: "c", state: "s&x", iss: "https://kreo-nine.vercel.app", error: null }));
    expect(u.searchParams.get("keep")).toBe("1");
    expect(u.searchParams.get("state")).toBe("s&x");
    expect(u.searchParams.has("error")).toBe(false);
  });
});

describe("recurso (RFC 8707)", () => {
  it("canonicaliza esquema/host y barra final", () => {
    expect(canonicalResource("HTTPS://Kreo-Nine.Vercel.App/api/mcp/")).toBe(RESOURCE);
    expect(canonicalResource("https://x.test/a#f")).toBeNull();
    expect(canonicalResource("nope")).toBeNull();
  });
  it("acepta el propio recurso (o ausente) y rechaza otros", () => {
    expect(resourceMatches(RESOURCE, RESOURCE)).toBe(true);
    expect(resourceMatches(`${RESOURCE}/`, RESOURCE)).toBe(true);
    expect(resourceMatches(undefined, RESOURCE)).toBe(true);
    expect(resourceMatches("https://kreo-nine.vercel.app", RESOURCE)).toBe(false);
    expect(resourceMatches("https://evil.example/api/mcp", RESOURCE)).toBe(false);
  });
});

describe("petición de autorización", () => {
  const base = {
    client_id: "kreo_cl_AAAAAAAAAAAAAAAAAAAAAA",
    redirect_uri: CLAUDE_CB,
    response_type: "code",
    code_challenge: s256("v".repeat(64)),
    code_challenge_method: "S256",
    state: "xyz",
    scope: "kreo offline_access",
    resource: RESOURCE,
  };
  it("acepta una petición correcta y fija scope y recurso", () => {
    const r = checkAuthorizeRequest(base, [CLAUDE_CB], RESOURCE);
    expect(r).toEqual({ ok: true, params: { clientId: base.client_id, redirectUri: CLAUDE_CB, codeChallenge: base.code_challenge, state: "xyz", scope: "kreo", resource: RESOURCE } });
  });
  it("cliente desconocido o redirect_uri no registrada: no redirige", () => {
    expect(checkAuthorizeRequest(base, null, RESOURCE)).toMatchObject({ ok: false, redirectable: false, reason: "invalid_client" });
    expect(checkAuthorizeRequest({ ...base, redirect_uri: "https://evil.example/cb" }, [CLAUDE_CB], RESOURCE)).toMatchObject({ ok: false, redirectable: false, reason: "invalid_redirect_uri" });
    expect(checkAuthorizeRequest({ ...base, redirect_uri: undefined }, [CLAUDE_CB], RESOURCE)).toMatchObject({ ok: false, redirectable: false });
  });
  it("exige PKCE S256, response_type=code y el recurso correcto (errores redirigibles)", () => {
    expect(checkAuthorizeRequest({ ...base, code_challenge_method: "plain" }, [CLAUDE_CB], RESOURCE)).toMatchObject({ ok: false, redirectable: true, error: "invalid_request" });
    expect(checkAuthorizeRequest({ ...base, code_challenge: undefined }, [CLAUDE_CB], RESOURCE)).toMatchObject({ ok: false, redirectable: true });
    expect(checkAuthorizeRequest({ ...base, response_type: "token" }, [CLAUDE_CB], RESOURCE)).toMatchObject({ ok: false, error: "unsupported_response_type" });
    expect(checkAuthorizeRequest({ ...base, resource: "https://other.example/mcp" }, [CLAUDE_CB], RESOURCE)).toMatchObject({ ok: false, error: "invalid_target" });
  });
});

describe("registro de clientes", () => {
  it("DCR: solo redirect URIs seguras y grants soportados; nunca secretos", () => {
    const ok = parseRegistrationRequest({ client_name: "Claude", redirect_uris: [CLAUDE_CB, CLAUDE_CB], grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "client_secret_post" });
    expect(ok).toEqual({ ok: true, meta: { clientName: "Claude", clientUri: null, redirectUris: [CLAUDE_CB] } });
    expect(parseRegistrationRequest({ redirect_uris: ["http://evil.example/cb"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(parseRegistrationRequest({ redirect_uris: [] })).toMatchObject({ ok: false });
    expect(parseRegistrationRequest({ redirect_uris: [CLAUDE_CB], grant_types: ["client_credentials"] })).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(parseRegistrationRequest({ redirect_uris: [CLAUDE_CB], client_name: "A\u0000B" })).toMatchObject({ ok: true, meta: { clientName: "AB" } });
    expect(parseRegistrationRequest([])).toMatchObject({ ok: false });
  });
  it("CIMD: solo https con ruta de hosts permitidos", () => {
    const hosts = ["claude.ai", "claude.com"];
    expect(isCimdClientId("https://claude.ai/oauth/claude-code-client-metadata", hosts)).toBe(true);
    expect(isCimdClientId("https://claude.ai/", hosts)).toBe(false);
    expect(isCimdClientId("http://claude.ai/meta", hosts)).toBe(false);
    expect(isCimdClientId("https://claude.ai:8443/meta", hosts)).toBe(false);
    expect(isCimdClientId("https://evil.example/meta", hosts)).toBe(false);
    expect(isCimdClientId("https://169.254.169.254/latest", hosts)).toBe(false);
  });
  it("CIMD: el client_id del documento debe ser idéntico a la URL", () => {
    const url = "https://claude.ai/oauth/claude-code-client-metadata";
    const doc = { client_id: url, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], token_endpoint_auth_method: "none" };
    expect(parseCimdDocument(doc, url)).toEqual({ clientName: "Claude Code", clientUri: null, redirectUris: doc.redirect_uris });
    expect(parseCimdDocument({ ...doc, client_id: "https://claude.ai/other" }, url)).toBeNull();
    expect(parseCimdDocument({ ...doc, token_endpoint_auth_method: "private_key_jwt" }, url)).toBeNull();
    expect(parseCimdDocument({ ...doc, redirect_uris: ["http://evil.example/cb"] }, url)).toBeNull();
    expect(parseCimdDocument({ ...doc, client_name: "" }, url)).toBeNull();
  });
});

describe("WWW-Authenticate y redirecciones internas", () => {
  it("apunta a los metadatos del recurso con scope", () => {
    const h = wwwAuthenticate("https://kreo-nine.vercel.app/.well-known/oauth-protected-resource/api/mcp", { error: "invalid_token", description: 'bad "token"' });
    expect(h).toBe('Bearer error="invalid_token", resource_metadata="https://kreo-nine.vercel.app/.well-known/oauth-protected-resource/api/mcp", scope="kreo", error_description="bad token"');
    expect(wwwAuthenticate("https://x/.well-known/oauth-protected-resource")).toBe('Bearer resource_metadata="https://x/.well-known/oauth-protected-resource", scope="kreo"');
  });
  it("safeNext solo permite /app y la pantalla de consentimiento", () => {
    expect(safeNext("/oauth/consent")).toBe("/oauth/consent");
    expect(safeNext("/app/settings")).toBe("/app/settings");
    expect(safeNext("/oauth/consent?x=https://evil")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("/app\\@evil")).toBe("/app");
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("/application")).toBe("/app");
    expect(safeNext(undefined)).toBe("/app");
  });
});
