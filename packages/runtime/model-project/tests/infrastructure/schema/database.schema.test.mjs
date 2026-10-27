import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTableName } from "drizzle-orm";

import { schema } from "../../../dist/infrastructure/schema/index.js";

test("split schema modules assemble the complete database schema", () => {
  assert.deepEqual(Object.values(schema).map(getTableName).sort(), [
    "account",
    "browser_presence",
    "browser_preview_jobs",
    "browser_render_jobs",
    "candidate_artifacts",
    "candidates",
    "export_download_tokens",
    "jwks",
    "model_exports",
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
    "validation_attempts",
    "verification",
    "worker_export_jobs",
    "worker_validation_jobs",
  ]);
});

test("committed PostgreSQL migrations contain auth, ownership, revision, and render-job boundaries", async () => {
  const migrations = await Promise.all([
    readFile(
      new URL("../../../drizzle/0000_tough_jetstream.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../drizzle/0001_material_ben_grimm.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../drizzle/0002_marvelous_puff_adder.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]).then((parts) => parts.join("\n"));
  for (const table of [
    "user",
    "session",
    "account",
    "projects",
    "candidates",
    "revisions",
    "browser_render_jobs",
  ]) {
    assert.match(migrations, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migrations, /projects_owner_id_user_id_fk/);
  assert.match(migrations, /projects_current_revision_id_revisions_id_fk/);
  assert.match(migrations, /candidate_state/);
  assert.match(migrations, /account_issuer_id_unique/);
  assert.doesNotMatch(
    migrations,
    /bytea/i,
    "mesh bytes must not be stored in PostgreSQL",
  );
});

test("deferred foreign keys bind to the assembled tables, including project/revision cycles", async () => {
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  for (const table of Object.values(schema)) {
    for (const foreignKey of getTableConfig(table).foreignKeys) {
      const reference = foreignKey.reference();
      assert.ok(
        Object.values(schema).includes(reference.foreignTable),
        foreignKey.getName(),
      );
      for (const column of reference.foreignColumns) {
        assert.equal(column.table, reference.foreignTable);
      }
    }
  }
  const projects = getTableConfig(schema.projects);
  const revisions = getTableConfig(schema.revisions);
  assert.equal(
    projects.foreignKeys
      .find(
        (key) =>
          key.getName() === "projects_current_revision_id_revisions_id_fk",
      )
      .reference().foreignColumns[0],
    schema.revisions.id,
  );
  assert.equal(
    revisions.foreignKeys
      .find((key) => key.getName() === "revisions_project_id_projects_id_fk")
      .reference().foreignColumns[0],
    schema.projects.id,
  );
});

test("schema factories allocate fresh columns for independent table instances", async () => {
  const { defineProjectsSchema } =
    await import("../../../dist/infrastructure/schema/project.schema.js");
  const left = defineProjectsSchema({ revisions: () => schema.revisions.id });
  const right = defineProjectsSchema({ revisions: () => schema.revisions.id });
  for (const name of ["id", "ownerId", "createdAt", "updatedAt"]) {
    assert.notEqual(left[name], right[name]);
    assert.equal(left[name].table, left);
    assert.equal(right[name].table, right);
  }
});
