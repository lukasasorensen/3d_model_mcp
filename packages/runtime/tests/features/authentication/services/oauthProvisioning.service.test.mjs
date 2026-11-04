import assert from "node:assert/strict";
import test from "node:test";
import { provisionOAuthClient } from "../../../../dist/features/authentication/services/oauthProvisioning.service.js";
import { createPostgresFixture } from "../../../fixtures/postgres.fixture.mjs";

test("plugin profiles isolate registration, repair policies, preserve disablement and reject invalid callbacks", async () => {
  const fixture = await createPostgresFixture();
  try {
    const codex = await provisionOAuthClient(
      fixture.pool,
      "http://127.0.0.1/callback",
    );
    const openai = await provisionOAuthClient(
      fixture.pool,
      "https://chatgpt.com/connector_platform_oauth_redirect",
      { profile: "openai-plugin" },
    );
    const claude = await provisionOAuthClient(
      fixture.pool,
      "http://localhost/callback",
      { profile: "claude-code" },
    );
    assert.equal(new Set([codex, openai, claude]).size, 3);
    await fixture.pool.query(
      "UPDATE oauth_client SET disabled = true, require_pkce = false, skip_consent = true, client_secret = 'fixture', scopes = ARRAY['admin'] WHERE client_id = $1",
      [claude],
    );
    await provisionOAuthClient(fixture.pool, "http://127.0.0.1/callback", {
      profile: "claude-code",
    });
    const repaired = (
      await fixture.pool.query(
        "SELECT * FROM oauth_client WHERE client_id = $1",
        [claude],
      )
    ).rows[0];
    assert.equal(repaired.disabled, true);
    assert.equal(repaired.require_pkce, true);
    assert.equal(repaired.skip_consent, false);
    assert.equal(repaired.client_secret, null);
    assert.deepEqual(repaired.scopes, ["cad:tools", "offline_access"]);
    assert.deepEqual(repaired.metadata, { cadClientId: claude });
    assert.deepEqual(
      repaired.redirect_uris.sort(),
      ["http://localhost/callback", "http://127.0.0.1/callback"].sort(),
    );
    await provisionOAuthClient(fixture.pool, "http://localhost/callback", {
      profile: "claude-code",
      replaceCallbacks: true,
    });
    assert.deepEqual(
      (
        await fixture.pool.query(
          "SELECT redirect_uris FROM oauth_client WHERE client_id = $1",
          [claude],
        )
      ).rows[0].redirect_uris,
      ["http://localhost/callback"],
    );
    for (const callback of [
      "http://attacker.example/callback",
      "https://localhost/callback",
      "https://user:secret@example.com/callback",
      "https://example.com/*",
      "https://example.com/%2a",
      "https://example.com/callback?next=evil",
      "https://example.com/callback#fragment",
    ]) {
      await assert.rejects(
        provisionOAuthClient(fixture.pool, callback, {
          profile: "openai-plugin",
        }),
      );
    }
    await assert.rejects(
      provisionOAuthClient(fixture.pool, "https://example.com/callback"),
    );
    await assert.rejects(
      provisionOAuthClient(fixture.pool, "http://localhost/callback", {
        profile: "unknown",
      }),
    );
    assert.equal(
      (await fixture.pool.query("SELECT * FROM oauth_client")).rows.length,
      3,
    );
  } finally {
    await fixture.close();
  }
});

test("failed plugin provisioning rolls back both client and resource writes", async () => {
  const fixture = await createPostgresFixture();
  try {
    const pool = {
      async connect() {
        const connection = await fixture.pool.connect();
        return {
          query(sql, values) {
            if (sql.includes("INSERT INTO oauth_resource"))
              throw new Error("injected resource failure");
            return connection.query(sql, values);
          },
          release: () => connection.release(),
        };
      },
    };
    await assert.rejects(
      provisionOAuthClient(pool, "http://localhost/callback", {
        profile: "claude-code",
      }),
      /injected resource failure/,
    );
    assert.equal(
      (await fixture.pool.query("SELECT * FROM oauth_client")).rows.length,
      0,
    );
  } finally {
    await fixture.close();
  }
});
