import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTableName } from "drizzle-orm";

import { schema } from "../dist/schema.js";

test("split schema modules assemble the complete database schema", () => {
  assert.deepEqual(
    Object.values(schema).map(getTableName).sort(),
    [
      "account",
      "browser_render_jobs",
      "candidate_artifacts",
      "candidates",
      "jwks",
      "oauth_access_token",
      "oauth_client",
      "oauth_client_assertion",
      "oauth_client_resource",
      "oauth_consent",
      "oauth_refresh_token",
      "oauth_resource",
      "projects",
      "revision_artifacts",
      "revisions",
      "session",
      "user",
      "verification",
    ],
  );
});

test("committed PostgreSQL migrations contain auth, ownership, revision, and render-job boundaries", async () => {
  const migrations = await Promise.all([
    readFile(new URL("../drizzle/0000_tough_jetstream.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_material_ben_grimm.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_marvelous_puff_adder.sql", import.meta.url), "utf8"),
  ]).then((parts) => parts.join("\n"));
  for (const table of ["user", "session", "account", "projects", "candidates", "revisions", "browser_render_jobs"]) {
    assert.match(migrations, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migrations, /projects_owner_id_user_id_fk/);
  assert.match(migrations, /projects_current_revision_id_revisions_id_fk/);
  assert.match(migrations, /candidate_state/);
  assert.match(migrations, /account_issuer_id_unique/);
  assert.doesNotMatch(migrations, /bytea/i, "mesh bytes must not be stored in PostgreSQL");
});
