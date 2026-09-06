import assert from "node:assert/strict";
import test from "node:test";
import { createProjectEventStream } from "./project-event-stream";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("project streams scope events, resync on listener gaps, and release cancelled subscriptions", async () => {
  let listener: Parameters<Parameters<typeof createProjectEventStream>[0]["changes"]["subscribe"]>[0] = () => undefined;
  let released = false;
  let checks = 0;
  const abort = new AbortController();
  const response = await createProjectEventStream({
    request: new Request("http://localhost/events", { signal: abort.signal }), ownerId: "owner", projectId: "project",
    changes: { async subscribe(receive) { listener = receive; return () => { released = true; }; } },
    authorize: async () => { checks++; },
  });
  const reader = response.body!.getReader();
  const text = async () => new TextDecoder().decode((await reader.read()).value);
  assert.match(await text(), /ready/);
  listener({ kind: "project", ownerId: "other", projectId: "project" });
  listener({ kind: "project", ownerId: "owner", projectId: "other" });
  await tick(); assert.equal(checks, 1);
  listener({ kind: "project", ownerId: "owner", projectId: "project" });
  assert.match(await text(), /project-updated/);
  listener(null); assert.equal((await reader.read()).done, true);
  assert.equal(released, true);
});

test("project streams stop forwarding after authorization is revoked", async () => {
  let listener: Parameters<Parameters<typeof createProjectEventStream>[0]["changes"]["subscribe"]>[0] = () => undefined;
  let allowed = true;
  let released = false;
  const response = await createProjectEventStream({
    request: new Request("http://localhost/events"), ownerId: "owner", projectId: "project",
    changes: { async subscribe(receive) { listener = receive; return () => { released = true; }; } },
    authorize: async () => { if (!allowed) throw new Error("revoked"); },
  });
  const reader = response.body!.getReader(); await reader.read(); allowed = false;
  listener({ kind: "render", ownerId: "owner", projectId: "project", jobId: "secret-job" });
  assert.equal((await reader.read()).done, true); assert.equal(released, true);
});
