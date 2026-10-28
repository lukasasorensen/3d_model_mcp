import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createOAuthTransport } from "../../../dist/infrastructure/authentication/oauthTransport.adapter.js";
const identity = {
  origin: "https://cad.example",
  issuer: "https://cad.example/api/auth",
  resource: "https://cad.example/mcp",
};
const { privateKey, publicKey } = await generateKeyPair("ES256");
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "test" }] };
const sign = (claims = {}) =>
  new SignJWT({
    sub: "owner",
    client_id: "theoryfoundry-local-worker",
    cad_grant: "grant",
    scope: "cad:tools offline_access",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "test" })
    .setIssuer(identity.issuer)
    .setAudience(identity.resource)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
test("transport pins endpoints, resource, public client and validates signed identity", async () => {
  const token = await sign();
  const requests = [];
  const transport = createOAuthTransport(identity, async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/jwks")) return Response.json(jwks);
    if (url.endsWith("/revoke")) return new Response();
    return Response.json({
      access_token: token,
      refresh_token: "refresh",
      token_type: "Bearer",
    });
  });
  const result = await transport.exchange({
    grant_type: "refresh_token",
    refresh_token: "old",
  });
  assert.equal(result.account, "owner");
  assert.equal(result.token, token);
  await transport.revoke(result.refreshToken);
  for (const { url, options } of requests) {
    assert.equal(new URL(url).origin, identity.origin);
    assert.equal(options.redirect, "error");
    assert.equal(options.signal.aborted, false);
    if (options.method === "POST") {
      assert.equal(options.body.get("client_id"), "theoryfoundry-local-worker");
      assert.equal(options.body.get("resource"), identity.resource);
      assert.equal(options.body.has("client_secret"), false);
    }
  }
});
test("rejects forged, wrong-client, wrong-scope, wrong-audience, and expired access tokens", async () => {
  const wrongAudience = await new SignJWT({
    sub: "owner",
    client_id: "theoryfoundry-local-worker",
    cad_grant: "grant",
    scope: "cad:tools",
  })
    .setProtectedHeader({ alg: "ES256", kid: "test" })
    .setIssuer(identity.issuer)
    .setAudience("https://evil.example/mcp")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const expired = await new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "ES256", kid: "test" })
    .setIssuer(identity.issuer)
    .setAudience(identity.resource)
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(privateKey);
  for (const token of [
    "not-a-jwt",
    await sign({ client_id: "theoryfoundry-codex" }),
    await sign({ scope: "unrelated" }),
    wrongAudience,
    expired,
  ]) {
    const transport = createOAuthTransport(identity, async (url) =>
      Response.json(
        url.endsWith("/jwks")
          ? jwks
          : {
              access_token: token,
              refresh_token: "sensitive-refresh",
              token_type: "Bearer",
            },
      ),
    );
    await assert.rejects(
      transport.exchange({ grant_type: "refresh_token" }),
      (error) =>
        error.code === "OAUTH_UNAVAILABLE" &&
        !String(error).includes("sensitive-refresh"),
    );
  }
});
test("bounds response bytes, redacts failures, and distinguishes revoked grants from transient errors", async () => {
  for (const [status, body, code] of [
    [400, { error: "invalid_grant" }, "LOGIN_REQUIRED"],
    [503, { error_description: "sensitive-refresh" }, "OAUTH_UNAVAILABLE"],
    [200, { data: "x".repeat(140_000) }, "OAUTH_UNAVAILABLE"],
  ]) {
    const transport = createOAuthTransport(identity, async () =>
      Response.json(body, { status }),
    );
    await assert.rejects(
      transport.exchange({ grant_type: "refresh_token" }),
      (error) =>
        error.code === code && !String(error).includes("sensitive-refresh"),
    );
  }
  const broken = createOAuthTransport(identity, async () => {
    throw new Error("sensitive-refresh");
  });
  await assert.rejects(
    broken.revoke("sensitive-refresh"),
    (error) =>
      error.code === "REVOCATION_FAILED" &&
      !String(error).includes("sensitive-refresh"),
  );
});
