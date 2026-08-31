import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyRemoteMcpToken } from "../dist/remote-mcp-auth.js";

test("bearer verification enforces expiry, signature, scope, grant identity, and operational errors", async () => {
  const keys = await generateKeyPair("ES256");
  const publicKey = await exportJWK(keys.publicKey);
  const issuer = "https://cad.example.com/api/auth";
  const resource = "https://cad.example.com/mcp";
  const sign = (claims = {}, expires = "5m", privateKey = keys.privateKey) => new SignJWT({ client_id: "codex", cad_grant: "grant-a", scope: "cad:tools", ...claims })
    .setProtectedHeader({ alg: "ES256" }).setSubject("owner-a").setIssuer(issuer).setAudience(resource).setIssuedAt().setExpirationTime(expires).sign(privateKey);
  let queries = 0;
  const pool = { async query(_sql, parameters) { queries++; assert.equal(parameters[0], "owner-a"); return { rows: [{ id: "grant-a" }] }; } };
  const verify = (token, overrides = {}) => verifyRemoteMcpToken(token, { pool, jwks: { keys: [publicKey] }, issuer, resource, ...overrides });
  await assert.rejects(verify(await sign({}, "-1s")), { code: "invalid_token" });
  await assert.rejects(verify(await sign({ scope: "offline_access" })), { code: "insufficient_scope" });
  const wrongKeys = await generateKeyPair("ES256");
  await assert.rejects(verify(await sign({}, "5m", wrongKeys.privateKey)), { code: "invalid_token" });
  assert.equal(queries, 0);
  await assert.rejects(verify(await sign({ cad_grant: "revoked-grant" })), { code: "invalid_token" });
  assert.equal(await verify(await sign()), "owner-a");
  const failure = new Error("database unavailable");
  await assert.rejects(verify(await sign(), { pool: { query: async () => { throw failure; } } }), (error) => error === failure);
});
