import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { createPostgresFixture } from "../../fixtures/postgres.fixture.mjs";
import {
  AiConnectionsRepository,
  AiCompanionRelayRepository,
} from "../../../dist/infrastructure/ai/index.js";

test("saved AI connections and companion jobs preserve isolation, leases, cancellation and erasure", async (t) => {
  const fixture = await createPostgresFixture();
  t.after(() => fixture.close());
  const previous = {
    keys: process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEYS,
    id: process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEY_ID,
  };
  process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEYS = JSON.stringify({
    test: randomBytes(32).toString("base64"),
  });
  process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEY_ID = "test";
  t.after(() => {
    for (const [key, value] of [
      ["THEORYFOUNDRY_AI_ENCRYPTION_KEYS", previous.keys],
      ["THEORYFOUNDRY_AI_ENCRYPTION_KEY_ID", previous.id],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const pool = {
    query: async (sql, params) => {
      const result = await fixture.pool.query(sql, params);
      return {
        ...result,
        rowCount: result.rows.length || result.affectedRows || 0,
      };
    },
    connect: async () => ({ query: pool.query, release() {} }),
  };
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified) VALUES ('a','A','a@example.test',true),('b','B','b@example.test',true)`,
  );
  const store = new AiConnectionsRepository(pool);
  const relay = new AiCompanionRelayRepository(pool);
  const hosted = {
    name: "Cloud",
    provider: "openai",
    location: "hosted",
    model: "test-model",
    token: "never-return-this-token",
    isDefault: true,
  };
  const first = await store.save("a", hosted);
  const second = await store.save("a", { ...hosted, name: "Second" });
  assert.equal((await store.read("a")).id, second);
  assert.equal(
    (await store.list("a")).connections.filter((item) => item.isDefault).length,
    1,
  );
  assert.ok(!JSON.stringify(await store.list("a")).includes(hosted.token));
  assert.ok(!(await store.read("a", first)).credential.includes(hosted.token));
  await assert.rejects(store.read("b", first), { code: "AI_CONFIGURATION" });
  await assert.rejects(store.save("b", hosted, first), {
    code: "AI_CONFIGURATION",
  });
  await assert.rejects(store.remove("b", first), { code: "AI_CONFIGURATION" });
  const device = { id: randomUUID(), name: "Computer", provider: "ollama" };
  const secret = randomBytes(32).toString("hex");
  await relay.register("a", device, secret);
  await assert.rejects(relay.authorize("b", device.id, secret), {
    code: "AI_AUTHENTICATION",
  });
  await assert.rejects(relay.authorize("a", device.id, "wrong"), {
    code: "AI_AUTHENTICATION",
  });
  await assert.rejects(
    store.save("b", {
      name: "Local",
      provider: "ollama",
      location: "local",
      model: "qwen",
      companionId: device.id,
      isDefault: false,
    }),
    { code: "AI_CONFIGURATION" },
  );
  const localId = await store.save("a", {
    name: "Local",
    provider: "ollama",
    location: "local",
    model: "qwen",
    companionId: device.id,
    isDefault: false,
  });
  const local = await store.read("a", localId);
  const start = (signal = new AbortController().signal) => {
    const done = relay.execute("a", local, { operation: "models" }, signal);
    void done.catch(() => {});
    return done;
  };
  const completed = start();
  const claimed = await relay.claim(
    "a",
    device.id,
    new AbortController().signal,
  );
  assert.ok(claimed);
  assert.equal(
    await relay.heartbeat("b", device.id, claimed.id, claimed.lease),
    false,
  );
  assert.equal(
    await relay.heartbeat("a", device.id, claimed.id, claimed.lease),
    true,
  );
  const output = { models: ["qwen"] };
  await relay.complete("a", device.id, claimed.id, claimed.lease, output);
  await relay.complete("a", device.id, claimed.id, claimed.lease, output);
  await assert.rejects(
    relay.complete("a", device.id, claimed.id, claimed.lease, {
      models: ["different"],
    }),
    { code: "AI_TIMEOUT" },
  );
  assert.deepEqual(await completed, output);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT input,output FROM ai_inference_jobs WHERE id=$1",
        [claimed.id],
      )
    ).rows[0],
    { input: null, output: null },
  );
  const cancel = new AbortController();
  const cancelled = start(cancel.signal);
  const job = await relay.claim("a", device.id, new AbortController().signal);
  cancel.abort();
  await assert.rejects(cancelled);
  assert.equal(await relay.heartbeat("a", device.id, job.id, job.lease), false);
  await assert.rejects(
    relay.complete("a", device.id, job.id, job.lease, output),
    { code: "AI_TIMEOUT" },
  );
  const expired = start();
  const expiring = await relay.claim(
    "a",
    device.id,
    new AbortController().signal,
  );
  await pool.query(
    "UPDATE ai_inference_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [expiring.id],
  );
  await assert.rejects(expired, { code: "AI_OFFLINE" });
  await pool.query(
    "UPDATE ai_companions SET last_seen_at=clock_timestamp()-interval '1 minute'",
  );
  assert.equal(
    (await store.list("a")).connections.find((item) => item.id === localId)
      .status,
    "offline",
  );
  await assert.rejects(start(), { code: "AI_OFFLINE" });
  process.env.THEORYFOUNDRY_AI_ENCRYPTION_KEYS = "{}";
  assert.equal(
    (await store.list("a")).connections.find((item) => item.id === first)
      .status,
    "credential-unavailable",
  );
  await pool.query('DELETE FROM "user" WHERE id=$1', ["a"]);
  for (const table of ["ai_connections", "ai_companions", "ai_inference_jobs"])
    assert.equal((await pool.query(`SELECT * FROM ${table}`)).rows.length, 0);
});
