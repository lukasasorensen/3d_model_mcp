import assert from "node:assert/strict";
import test from "node:test";
import { databaseShellArguments } from "../../../tooling/database/databaseShell.cli.mjs";

test("database shell selects an existing database rather than the renamed default", () => {
  const args = databaseShellArguments(
    "postgres://operator:private-password@localhost:5433/existing-cad",
  );
  assert.deepEqual(args, [
    "compose",
    "-f",
    "compose.local.yaml",
    "exec",
    "postgres",
    "psql",
    "-U",
    "operator",
    "-d",
    "existing-cad",
  ]);
  assert.doesNotMatch(JSON.stringify(args), /private-password/);
});

test("database shell decodes identifiers without interpreting shell syntax", () => {
  const args = databaseShellArguments(
    "postgresql://cad%20operator:secret@localhost/theory%20foundry%3B%24%28echo%29",
  );
  assert.equal(args[7], "cad operator");
  assert.equal(args[9], "theory foundry;$(echo)");
});

test("database shell rejects missing or invalid configuration without exposing credentials", () => {
  for (const connection of [
    undefined,
    "invalid",
    "https://operator:secret@localhost/cad",
    "postgres://operator:secret@localhost",
    "postgres://operator:secret@localhost/%00",
  ]) {
    assert.throws(() => databaseShellArguments(connection), {
      message: "DATABASE_URL must be a PostgreSQL URL with a database name.",
    });
  }
});
