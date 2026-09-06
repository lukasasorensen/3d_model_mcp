import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSnapshotLoader } from "./project-snapshot-loader";

const snapshot = () => Response.json({ state: { projectId: "project", currentRevision: null, source: null, artifacts: [], diagnostics: [] }, revisions: [] });

test("overlapping invalidations coalesce and suppress the superseded snapshot", async () => {
  const requests: Array<(response: Response) => void> = [];
  let hydrated = 0;
  const loader = createProjectSnapshotLoader("project", () => hydrated++, () => new Promise((resolve) => requests.push(resolve)));
  const initial = loader.refresh(); loader.refresh(); loader.refresh();
  assert.equal(requests.length, 1);
  requests[0]!(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2); assert.equal(hydrated, 0);
  requests[1]!(snapshot());
  assert.equal(await initial, true); assert.equal(hydrated, 1);
  loader.close();
});

test("unmounted project loaders abort requests and discard late responses", async () => {
  let resolve: (response: Response) => void = () => undefined;
  let signal: AbortSignal | null | undefined;
  const loader = createProjectSnapshotLoader("project", () => assert.fail("stale snapshot"), (_url, options) => {
    signal = options?.signal; return new Promise((done) => { resolve = done; });
  });
  const pending = loader.refresh(); loader.close();
  assert.equal(signal?.aborted, true); resolve(snapshot());
  assert.equal(await pending, false); assert.equal(await loader.refresh(), false);
});
