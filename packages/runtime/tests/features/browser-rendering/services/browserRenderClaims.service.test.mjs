import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { claimMcpBrowserRender } from "../../../../dist/features/browser-rendering/services/browserRenderClaims.service.js";
test("render claims persist only a token hash and record one successful claim", async () => {
  let storedHash;
  let recorded = 0;
  const jobs = {
    async claim(projectId, sessionId, tokenHash) {
      assert.equal(projectId, "project-1");
      assert.equal(sessionId, "session-1");
      storedHash = tokenHash;
      return { jobId: "job-1", candidateId: "candidate-1", source: "cube(1);" };
    },
  };
  const result = await claimMcpBrowserRender(
    jobs,
    "project-1",
    "session-1",
    () => {
      recorded += 1;
    },
  );
  assert.equal(
    storedHash,
    createHash("sha256").update(result.token).digest("hex"),
  );
  assert.notEqual(storedHash, result.token);
  assert.equal(result.purpose, "candidate");
  assert.equal(result.format, "stl");
  assert.equal(recorded, 1);
});

test("empty and failed claims emit no success event and preserve operational errors", async () => {
  const record = () => assert.fail("unsuccessful claim must not be recorded");
  assert.equal(
    await claimMcpBrowserRender(
      { claim: async () => undefined },
      "project-1",
      "session-1",
      record,
    ),
    undefined,
  );
  const failure = new Error("storage unavailable");
  await assert.rejects(
    claimMcpBrowserRender(
      {
        claim: async () => {
          throw failure;
        },
      },
      "project-1",
      "session-1",
      record,
    ),
    (error) => error === failure,
  );
});
