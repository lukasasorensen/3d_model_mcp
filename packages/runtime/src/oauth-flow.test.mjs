import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { schema } from "@rjls/model-project";
import { createConfiguredAuth } from "../dist/auth.js";
import { provisionCodexClient } from "../dist/oauth-provisioning.js";
import { revokeOAuthGrant } from "../dist/oauth-authorization.js";
import { verifyRemoteMcpToken } from "../dist/remote-mcp-auth.js";
import { createPostgresFixture } from "./test-support/postgres-fixture.mjs";

const origin = "http://localhost:3000";
const callback = "http://127.0.0.1/callback";
const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

test("real OAuth login, PKCE, consent, refresh, token binding, storage, and revocation", async () => {
  const fixture = await createPostgresFixture();
  const previous = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "test", BETTER_AUTH_URL: origin, RJLS_ALLOWED_ORIGIN: origin, BETTER_AUTH_SECRET: "test-only-secret-not-for-production-123456789", RJLS_REMOTE_MCP_ENABLED: "1", RJLS_AUTH_ALLOW_SIGNUP: "1" });
  try {
    const auth = createConfiguredAuth({ pool: fixture.pool, db: drizzle(fixture.database, { schema }) });
    await auth.$context;
    const clientId = await provisionCodexClient(fixture.pool, callback);
    assert.equal(await provisionCodexClient(fixture.pool, callback), clientId);
    const legacyCallback = "http://127.0.0.1/callback/legacy";
    await provisionCodexClient(fixture.pool, legacyCallback);
    assert.deepEqual(
      (await fixture.pool.query("SELECT redirect_uris FROM oauth_client WHERE client_id = $1", [clientId])).rows[0].redirect_uris.sort(),
      [callback, legacyCallback].sort(),
    );
    await provisionCodexClient(fixture.pool, callback, { replaceCallbacks: true });
    assert.deepEqual(
      (await fixture.pool.query("SELECT redirect_uris FROM oauth_client WHERE client_id = $1", [clientId])).rows[0].redirect_uris,
      [callback],
    );
    const signup = await auth.api.signUpEmail({ body: { email: "a@example.com", password: "Test-password-123!", name: "A" }, asResponse: true });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const owner = (await signup.json()).user.id;
    const request = (path, body, cookieValue = cookie) => auth.handler(new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET", headers: { cookie: cookieValue, origin, "content-type": path === "/oauth2/token" ? "application/x-www-form-urlencoded" : "application/json", accept: "application/json" },
      ...(body ? { body: path === "/oauth2/token" ? new URLSearchParams(body).toString() : JSON.stringify(body) } : {}),
    }));
    const authorize = (overrides = {}, cookieValue = cookie) => request(`/oauth2/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: "cad:tools offline_access", resource: `${origin}/mcp`, state: "test-state", code_challenge: challenge, code_challenge_method: "S256", ...overrides })}`, undefined, cookieValue);
    const discovery = await auth.api.getOAuthServerConfig();
    assert.equal(discovery.issuer, `${origin}/api/auth`);
    assert.ok(discovery.code_challenge_methods_supported.includes("S256"));
    assert.equal(discovery.registration_endpoint, undefined);
    const loginStart = await authorize({}, "");
    const loginPage = new URL((await loginStart.json()).url, origin);
    assert.equal(loginPage.pathname, "/sign-in");
    const login = await request("/sign-in/email", { email: "a@example.com", password: "Test-password-123!", oauth_query: loginPage.search.slice(1) }, "");
    assert.equal(login.status, 200);
    assert.equal(new URL((await login.json()).url, origin).pathname, "/consent");
    const tampered = await request("/oauth2/consent", { accept: true, oauth_query: loginPage.search.slice(1).replace("cad%3Atools", "admin") });
    assert.equal(tampered.status, 400);
    const deniedStart = await authorize();
    const deniedPage = new URL((await deniedStart.json()).url, origin);
    const deniedConsent = await request("/oauth2/consent", { accept: false, oauth_query: deniedPage.search.slice(1) });
    assert.equal(new URL((await deniedConsent.json()).url).searchParams.get("error"), "access_denied");
    const first = await authorize();
    const initial = await first.json();
    assert.equal(first.status, 200, JSON.stringify(initial));
    assert.ok(initial.url.includes("/consent?"), JSON.stringify(initial));
    const signedQuery = new URL(initial.url, origin).search.slice(1);
    const consent = await request("/oauth2/consent", { accept: true, oauth_query: signedQuery });
    const consentBody = await consent.json();
    assert.equal(consent.status, 200, JSON.stringify(consentBody));
    const approved = new URL(consentBody.url);
    assert.equal(approved.searchParams.get("state"), "test-state");
    const exchange = (code, codeVerifier = verifier) => request("/oauth2/token", { grant_type: "authorization_code", client_id: clientId, redirect_uri: callback, code, code_verifier: codeVerifier, resource: `${origin}/mcp` }, "");
    const tokenResponse = await exchange(approved.searchParams.get("code"));
    const tokens = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200, JSON.stringify(tokens));
    assert.ok(tokens.access_token && tokens.refresh_token);
    const jwks = await auth.api.getJwks();
    assert.equal((await fixture.pool.query("SELECT redirect_uris FROM oauth_client")).rows[0].redirect_uris.length, 1);
    const verify = (token, overrides = {}) => verifyRemoteMcpToken(token, { pool: fixture.pool, jwks, issuer: `${origin}/api/auth`, resource: `${origin}/mcp`, ...overrides });
    assert.equal(await verify(tokens.access_token), owner);
    await assert.rejects(verify(tokens.access_token, { resource: `${origin}/other` }), { code: "invalid_token" });
    const dump = JSON.stringify((await fixture.database.query("SELECT * FROM oauth_refresh_token")).rows);
    assert.equal(dump.includes(tokens.refresh_token), false);
    const keys = (await fixture.database.query("SELECT private_key FROM jwks")).rows;
    assert.ok(keys.length > 0);
    assert.equal(keys[0].private_key.includes('"d"'), false);
    const refreshed = await request("/oauth2/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token, resource: `${origin}/mcp` }, "");
    const next = await refreshed.json();
    assert.equal(refreshed.status, 200, JSON.stringify(next));
    assert.notEqual(next.refresh_token, tokens.refresh_token);
    const reusedRefresh = await request("/oauth2/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token, resource: `${origin}/mcp` }, "");
    assert.equal(reusedRefresh.status, 400);
    const grant = (await fixture.pool.query("SELECT id FROM oauth_consent WHERE user_id = $1", [owner])).rows[0].id;
    assert.equal(await revokeOAuthGrant(fixture.pool, "other-owner", grant), false);
    assert.equal(await revokeOAuthGrant(fixture.pool, owner, grant), true);
    await assert.rejects(verify(next.access_token), { code: "invalid_token" });
    const revokedRefresh = await request("/oauth2/token", { grant_type: "refresh_token", client_id: clientId, refresh_token: next.refresh_token }, "");
    assert.equal(revokedRefresh.status, 400);
    assert.equal((await exchange(approved.searchParams.get("code"))).status, 400);
    const badRedirect = await authorize({ redirect_uri: "http://attacker.example/callback" });
    const badRedirectBody = await badRedirect.json();
    assert.ok(badRedirectBody.error || (badRedirectBody.url && new URL(badRedirectBody.url).searchParams.has("error")), JSON.stringify(badRedirectBody));
    assert.equal(badRedirectBody.url ? new URL(badRedirectBody.url).searchParams.has("code") : false, false);
    const plainPkce = await authorize({ code_challenge_method: "plain" });
    const plainBody = await plainPkce.json();
    assert.ok(plainBody.error || (plainBody.url && new URL(plainBody.url).searchParams.has("error")), JSON.stringify(plainBody));
    assert.equal((await request("/oauth2/register", { client_name: "evil" }, "")).status, 403);
    const retryStart = await authorize();
    const retryPage = new URL((await retryStart.json()).url, origin);
    const retryConsent = await request("/oauth2/consent", { accept: true, oauth_query: retryPage.search.slice(1) });
    const retryCode = new URL((await retryConsent.json()).url).searchParams.get("code");
    assert.equal((await exchange(retryCode, "b".repeat(64))).status, 401);
    await assert.rejects(verify(tokens.access_token), { code: "invalid_token" });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await fixture.close();
  }
});
