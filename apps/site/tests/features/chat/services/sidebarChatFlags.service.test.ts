import assert from "node:assert/strict";
import test from "node:test";
import { getSidebarChatFlags } from "../../../../src/features/chat/services/sidebarChatFlags.service";
import { DISABLED_CHAT_FLAGS } from "../../../../src/features/chat/utils/sidebarChatFlags.util";

const environment = {
  UNLEASH_FRONTEND_API_URL: "https://flags.example/api/frontend",
  UNLEASH_FRONTEND_API_TOKEN: "test-token",
};

test("unconfigured chat defaults hidden and mock without network access", async () => {
  assert.deepEqual(
    await getSidebarChatFlags("user", {}, async () => {
      throw new Error("unexpected network");
    }),
    DISABLED_CHAT_FLAGS,
  );
});

for (const visible of [false, true])
  for (const real of [false, true]) {
    test(`independent chat decisions: visible=${visible}, real=${real}`, async () => {
      const flags = await getSidebarChatFlags(
        "owner-1",
        environment,
        async (input, init) => {
          const url = new URL(String(input));
          assert.equal(url.searchParams.get("userId"), "owner-1");
          assert.equal(url.searchParams.get("appName"), "theoryfoundry-cad");
          assert.equal(init?.cache, "no-store");
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            "test-token",
          );
          return Response.json({
            toggles: [
              { name: "sidebar-chat-enabled", enabled: visible },
              { name: "sidebar-chat-real-ai", enabled: real },
            ],
          });
        },
      );
      assert.deepEqual(flags, {
        isSidebarChatEnabled: visible,
        isRealAiEnabled: real,
      });
    });
  }

test("omitted flags evaluate to false", async () => {
  assert.deepEqual(
    await getSidebarChatFlags("user", environment, async () =>
      Response.json({ toggles: [] }),
    ),
    DISABLED_CHAT_FLAGS,
  );
});

test("incomplete configuration and operational failures are preserved", async () => {
  await assert.rejects(
    getSidebarChatFlags("user", {
      UNLEASH_FRONTEND_API_URL: environment.UNLEASH_FRONTEND_API_URL,
    }),
    /incomplete/,
  );
  await assert.rejects(
    getSidebarChatFlags(
      "user",
      environment,
      async () => new Response(null, { status: 401 }),
    ),
    /unavailable/,
  );
  await assert.rejects(
    getSidebarChatFlags("user", environment, async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  for (const payload of [
    {},
    { toggles: [{}] },
    { toggles: [{ name: "sidebar-chat-enabled", enabled: "true" }] },
  ]) {
    await assert.rejects(
      getSidebarChatFlags("user", environment, async () =>
        Response.json(payload),
      ),
      /Invalid/,
    );
  }
});
