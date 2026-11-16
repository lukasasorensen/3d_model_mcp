import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { hashPassword } from "better-auth/crypto";
import { schema } from "@theoryfoundry/model-project";
import { createConfiguredAuth } from "../../../dist/configuredAuth.composition.js";

test("auth upgrade preserves credentials, rejects ambiguous provider keys, and admits new accounts", async () => {
  const database = new PGlite();
  const previous = { ...process.env };
  const migrationRoot = new URL(
    "../../../model-project/drizzle/",
    import.meta.url,
  );
  try {
    const journal = JSON.parse(
      await readFile(new URL("meta/_journal.json", migrationRoot), "utf8"),
    );
    for (const { tag } of journal.entries.filter(({ idx }) => idx < 19)) {
      await database.exec(
        await readFile(new URL(`${tag}.sql`, migrationRoot), "utf8"),
      );
    }
    const password = "migration test password";
    const hash = await hashPassword(password);
    await database.query(
      'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
      ["existing", "Existing", "existing@example.test"],
    );
    await database.query(
      "INSERT INTO account (id, issuer, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        "old-account",
        "local:credential",
        "existing",
        "credential",
        "existing",
        hash,
      ],
    );
    // Old issuer keys could distinguish rows that the new provider key cannot.
    await database.exec(
      "INSERT INTO account (id, issuer, account_id, provider_id, user_id) VALUES ('ambiguous', 'other:issuer', 'existing', 'credential', 'existing')",
    );
    const migration = await readFile(
      new URL("0019_auth-provider-account-key.sql", migrationRoot),
      "utf8",
    );
    await database.exec("BEGIN");
    await assert.rejects(database.exec(migration), /unique|duplicate/i);
    await database.exec("ROLLBACK");
    assert.equal(
      (await database.query("SELECT count(*)::int AS count FROM account"))
        .rows[0].count,
      2,
    );
    await database.exec("DELETE FROM account WHERE id = 'ambiguous'");
    await database.exec(migration);
    assert.deepEqual(
      (
        await database.query(
          "SELECT issuer, password FROM account WHERE id = 'old-account'",
        )
      ).rows[0],
      { issuer: "local:credential", password: hash },
    );
    Object.assign(process.env, {
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "test-only-secret-not-for-production-123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      THEORYFOUNDRY_ALLOWED_ORIGIN: "http://localhost:3000",
      THEORYFOUNDRY_REMOTE_MCP_ENABLED: "0",
      THEORYFOUNDRY_AUTH_ALLOW_SIGNUP: "1",
      THEORYFOUNDRY_LOCAL_EDITION: "0",
    });
    const auth = createConfiguredAuth({
      db: drizzle(database, { schema }),
      pool: { query: (...args) => database.query(...args) },
    });
    await auth.$context;
    const login = await auth.api.signInEmail({
      body: { email: "existing@example.test", password },
    });
    assert.equal(login.user.id, "existing");
    const signup = await auth.api.signUpEmail({
      body: { name: "New", email: "new@example.test", password },
    });
    const newAccount = (
      await database.query("SELECT issuer FROM account WHERE user_id = $1", [
        signup.user.id,
      ])
    ).rows[0];
    assert.equal(newAccount.issuer, null);
    await assert.rejects(
      database.exec(
        "INSERT INTO account (id, account_id, provider_id, user_id) VALUES ('duplicate', 'existing', 'credential', 'existing')",
      ),
      /unique|duplicate/i,
    );
    await database.exec(
      "INSERT INTO account (id, account_id, provider_id, user_id) VALUES ('other-provider', 'existing', 'other-provider', 'existing')",
    );
  } finally {
    process.env = previous;
    await database.close();
  }
});
