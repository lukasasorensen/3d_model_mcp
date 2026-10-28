import test from "node:test";
import assert from "node:assert/strict";
import { provisionWorkerClient } from "../../../../dist/features/authentication/services/workerOAuthProvisioning.service.js";
import { createPostgresFixture } from "../../../fixtures/postgres.fixture.mjs";
import { WORKER_OAUTH_CALLBACK } from "@theoryfoundry/contracts";

test("worker provisioning repairs unsafe settings, narrows resources, and preserves disablement", async () => {
  const fixture = await createPostgresFixture();
  try {
    const id = await provisionWorkerClient(fixture.pool);
    await fixture.pool.query(
      "UPDATE oauth_client SET disabled = true, require_pkce = false, skip_consent = true, client_secret = 'test-only', redirect_uris = ARRAY['http://localhost/other'], scopes = ARRAY['admin'] WHERE client_id = $1",
      [id],
    );
    await fixture.pool.query(
      "INSERT INTO oauth_resource (id, identifier, name) VALUES ('foreign-resource', 'https://unrelated.example', 'Unrelated')",
    );
    await fixture.pool.query(
      "INSERT INTO oauth_client_resource (id, client_id, resource_id) VALUES ('foreign-mapping', $1, 'https://unrelated.example')",
      [id],
    );
    assert.equal(await provisionWorkerClient(fixture.pool), id);
    const client = (
      await fixture.pool.query(
        "SELECT * FROM oauth_client WHERE client_id = $1",
        [id],
      )
    ).rows[0];
    assert.equal(client.disabled, true);
    assert.equal(client.require_pkce, true);
    assert.equal(client.skip_consent, false);
    assert.equal(client.client_secret, null);
    assert.deepEqual(client.redirect_uris, [WORKER_OAUTH_CALLBACK]);
    assert.deepEqual(client.scopes, ["cad:tools", "offline_access"]);
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT * FROM oauth_client_resource WHERE client_id = $1",
          [id],
        )
      ).rows.length,
      1,
    );
  } finally {
    await fixture.close();
  }
});

test("failed provisioning rolls back the client as well as resource registration", async () => {
  const fixture = await createPostgresFixture();
  try {
    const pool = {
      async connect() {
        const connection = await fixture.pool.connect();
        return {
          query(sql, args) {
            if (sql.includes("INSERT INTO oauth_resource"))
              throw new Error("injected resource failure");
            return connection.query(sql, args);
          },
          release: () => connection.release(),
        };
      },
    };
    await assert.rejects(
      provisionWorkerClient(pool),
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
