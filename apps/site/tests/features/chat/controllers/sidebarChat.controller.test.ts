import type { AuthenticatedUser } from "@theoryfoundry/runtime";
import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarChatHandler } from "../../../../src/features/chat/controllers/sidebarChat.controller";

const user = { id: "owner-1" } as AuthenticatedUser;
const request = new Request("http://localhost/v1/chat", { method: "POST" });

for (const visible of [false, true])
  for (const real of [false, true]) {
    test(`chat admission visible=${visible}, real=${real}`, async () => {
      let calls = 0;
      const handler = createSidebarChatHandler({
        authenticate: async () => user,
        getFlags: async (id) => {
          assert.equal(id, user.id);
          return { isSidebarChatEnabled: visible, isRealAiEnabled: real };
        },
        runMockChat: async (received, id) => {
          calls++;
          assert.equal(received, request);
          assert.equal(id, user.id);
          return new Response("mock");
        },
      });
      const response = await handler(request);
      assert.equal(response.status, !visible ? 404 : real ? 503 : 200);
      assert.equal(calls, visible && !real ? 1 : 0);
    });
  }

test("authentication precedes flags and flag outages never reach the runtime", async () => {
  const handler = createSidebarChatHandler({
    authenticate: async () => new Response(null, { status: 401 }),
    getFlags: async () => {
      throw new Error("must not evaluate");
    },
    runMockChat: async () => {
      throw new Error("must not execute");
    },
  });
  assert.equal((await handler(request)).status, 401);
  const unavailable = createSidebarChatHandler({
    authenticate: async () => user,
    getFlags: async () => {
      throw new Error("private infrastructure details");
    },
    runMockChat: async () => {
      throw new Error("must not execute");
    },
  });
  const response = await unavailable(request);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private infrastructure/);
});
