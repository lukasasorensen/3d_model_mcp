import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/pglite";
import { schema } from "@theoryfoundry/model-project";
import { createConfiguredAuth } from "../../../dist/configuredAuth.composition.js";
import { PlatformInvitations } from "../../../dist/infrastructure/invitations/platformInvitation.service.js";
import { createPostgresFixture } from "../../fixtures/postgres.fixture.mjs";

test("invitation fixture isolates inherited deployment settings", async (t) => {
  for (const mode of ["development", "production"]) {
    await t.test(`inherited NODE_ENV=${mode}`, () => {
      const env = {
        ...process.env,
        NODE_ENV: mode,
        BETTER_AUTH_URL: "https://deployment.example.com",
        THEORYFOUNDRY_ALLOWED_ORIGIN: "https://deployment.example.com",
        THEORYFOUNDRY_REMOTE_MCP_ENABLED: "1",
      };
      // Start a fresh test runner, rather than inheriting its parent's worker context.
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(
        process.execPath,
        [
          "--test",
          "--test-reporter=tap",
          "--test-name-pattern=^platform invitations enforce",
          fileURLToPath(import.meta.url),
        ],
        { env, encoding: "utf8", timeout: 60_000 },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /# pass 1\b/);
    });
  }
});

test("platform invitations enforce admin access, validity and transactional credential creation", async (t) => {
  const fixture = await createPostgresFixture();
  const previous = { ...process.env };
  t.after(async () => {
    process.env = previous;
    await fixture.close();
  });
  Object.assign(process.env, {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "test-only-secret-not-for-production-123456789",
    BETTER_AUTH_URL: "http://localhost:3000",
    THEORYFOUNDRY_ALLOWED_ORIGIN: "http://localhost:3000",
    THEORYFOUNDRY_REMOTE_MCP_ENABLED: "1",
    THEORYFOUNDRY_SYSTEM_ADMIN_USER_IDS: "another, admin ",
    THEORYFOUNDRY_AUTH_ALLOW_SIGNUP: "0",
  });
  const db = drizzle(fixture.database, { schema });
  const auth = createConfiguredAuth({ db, pool: fixture.pool });
  const { password: policy } = await auth.$context;
  const service = new PlatformInvitations(db);
  await db
    .insert(schema.user)
    .values({ id: "admin", name: "Admin", email: "admin@example.com" });
  const email = "recipient@example.com";
  const name = "New member";
  const password = "a test-only long password";
  const accept = (token) => service.accept(token, name, password, policy);
  const issue = () => service.issue("admin", " Recipient@Example.com ");
  await assert.rejects(service.list("other"), { status: 403 });
  await assert.rejects(service.issue("other", email), { status: 403 });
  await assert.rejects(service.revoke("other", "x"), { status: 403 });
  await assert.rejects(service.issue("admin", "admin@example.com"), {
    status: 409,
  });
  const { token, id } = await issue();
  const [first] = await service.list("admin");
  assert.equal(first.id, id);
  assert.equal(first.email, email);
  assert.equal(first.creator, "admin@example.com");
  assert.equal(first.status, "pending");
  const [stored] = await db.select().from(schema.platformInvitation);
  assert.equal(
    stored.tokenDigest,
    createHash("sha256").update(token).digest("hex"),
  );
  assert.ok(
    Math.abs(stored.expiresAt - stored.createdAt - 7 * 86400000) < 1000,
  );
  await assert.rejects(issue(), { status: 409 });
  const { token: replacement } = await service.issue("admin", email, first.id);
  await assert.rejects(accept(token), { status: 410 });
  await assert.rejects(service.issue("admin", email, first.id), {
    status: 409,
  });
  await service.revoke("admin", (await service.list("admin"))[0].id);
  await assert.rejects(accept(replacement), { status: 410 });
  const { token: expiring } = await issue();
  await fixture.database.exec(
    "update platform_invitation set expires_at = now() - interval '1 second' where revoked_at is null",
  );
  await assert.rejects(accept(expiring), { status: 410 });
  const { token: fresh } = await issue();
  await assert.rejects(service.accept(fresh, name, "tiny", policy), {
    status: 400,
  });
  await fixture.database.exec(
    "alter table account add constraint fail_write check (provider_id != 'credential')",
  );
  await assert.rejects(accept(fresh));
  assert.equal((await service.list("admin"))[0].status, "pending");
  assert.equal((await db.select().from(schema.user)).length, 1);
  await fixture.database.exec("alter table account drop constraint fail_write");
  const results = await Promise.allSettled([accept(fresh), accept(fresh)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [
    "fulfilled",
    "rejected",
  ]);
  assert.equal((await db.select().from(schema.account)).length, 1);
  const signed = await auth.api.signInEmail({ body: { email, password } });
  assert.equal(signed.user.emailVerified, false);
  assert.equal((await service.list("admin"))[0].status, "accepted");
  await assert.rejects(issue(), { status: 409 });
  delete process.env.THEORYFOUNDRY_SYSTEM_ADMIN_USER_IDS;
  await assert.rejects(service.list("admin"), { status: 403 });
});
