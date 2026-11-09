import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import {
  encryptAiCredential,
  decryptAiCredential,
} from "../../../dist/shared/utils/aiCredential.util.js";
import {
  isPublicAiAddress,
  resolvePublicAiEndpoint,
} from "../../../dist/shared/utils/publicAiEndpoint.util.js";

test("AI credentials bind ciphertext to owner/connection and support retained rotation keys", () => {
  const keys = {
    active: "first",
    keys: {
      first: randomBytes(32).toString("base64"),
      next: randomBytes(32).toString("base64"),
    },
  };
  const raw = encryptAiCredential(
    "test-provider-secret",
    "owner",
    "connection",
    keys,
  );
  assert.ok(!raw.includes("test-provider-secret"));
  assert.notEqual(
    raw,
    encryptAiCredential("test-provider-secret", "owner", "connection", keys),
  );
  assert.equal(
    decryptAiCredential(raw, "owner", "connection", {
      ...keys,
      active: "next",
    }),
    "test-provider-secret",
  );
  for (const [owner, connection, ring] of [
    ["other", "connection", keys],
    ["owner", "other", keys],
    ["owner", "connection", { active: "next", keys: { next: keys.keys.next } }],
  ]) {
    assert.throws(() => decryptAiCredential(raw, owner, connection, ring), {
      code: "AI_CONFIGURATION",
    });
  }
  const modified = JSON.parse(raw);
  modified.tag = randomBytes(16).toString("base64");
  assert.throws(
    () =>
      decryptAiCredential(
        JSON.stringify(modified),
        "owner",
        "connection",
        keys,
      ),
    { code: "AI_CONFIGURATION" },
  );
});
test("custom hosted endpoints reject private, mapped, mixed DNS and credential-bearing URLs", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.1.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    assert.equal(isPublicAiAddress(address), false, address);
  assert.equal(isPublicAiAddress("1.1.1.1"), true);
  assert.equal(isPublicAiAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "http://example.test/v1",
    "https://user:secret@example.test/v1",
    "https://example.test/v1#fragment",
    "https://127.0.0.1/v1",
  ])
    await assert.rejects(
      resolvePublicAiEndpoint(url, async () => [
        { address: "1.1.1.1", family: 4 },
      ]),
      { code: "AI_CONFIGURATION" },
    );
  await assert.rejects(
    resolvePublicAiEndpoint("https://example.test/v1", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
    { code: "AI_CONFIGURATION" },
  );
  assert.equal(
    (
      await resolvePublicAiEndpoint("https://example.test/v1", async () => [
        { address: "1.1.1.1", family: 4 },
      ])
    ).addresses[0].address,
    "1.1.1.1",
  );
});
