import { CLAUDE_HOSTED_OAUTH_CALLBACK } from "@theoryfoundry/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { submitOAuthAction } from "../../../../../src/features/authentication/browser/services/oauthNavigation.service";

void test("OAuth navigation carries the signed query and follows only the provider response", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  let assigned = "";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: "https://cad.example.com",
        search: "?sig=signature&redirect_uri=https://evil.example",
        assign: (url: string) => {
          assigned = url;
        },
      },
    },
  });
  try {
    globalThis.fetch = async (_input, init): Promise<Response> => {
      assert.equal(
        JSON.parse(String(init?.body)).oauth_query,
        "sig=signature&redirect_uri=https://evil.example",
      );
      return Response.json({ url: "http://127.0.0.1:4321/callback?code=test" });
    };
    await submitOAuthAction("oauth2/consent", { accept: true });
    assert.equal(assigned, "http://127.0.0.1:4321/callback?code=test");
    const claudeResponse =
      CLAUDE_HOSTED_OAUTH_CALLBACK + "?code=test&state=state";
    globalThis.fetch = async (): Promise<Response> =>
      Response.json({ url: claudeResponse });
    await submitOAuthAction("oauth2/consent", { accept: true });
    assert.equal(assigned, claudeResponse);
    for (const url of [
      "https://evil.example/callback",
      CLAUDE_HOSTED_OAUTH_CALLBACK + "/other-path",
      CLAUDE_HOSTED_OAUTH_CALLBACK + "#fragment",
      "https://user@claude.ai/api/mcp/auth_callback",
    ]) {
      globalThis.fetch = async (): Promise<Response> => Response.json({ url });
      await assert.rejects(
        submitOAuthAction("oauth2/consent", { accept: true }),
      );
      assert.equal(assigned, claudeResponse);
    }
    globalThis.fetch = async (): Promise<Response> =>
      Response.json({ error: "invalid_signature" }, { status: 400 });
    await assert.rejects(submitOAuthAction("oauth2/consent", { accept: true }));
  } finally {
    globalThis.fetch = previousFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});
