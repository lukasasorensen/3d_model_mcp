import { CadDomainError } from "@theoryfoundry/runtime";
import assert from "node:assert/strict";
import test from "node:test";
import { POST as restoreRevision } from "../src/app/v1/projects/[projectId]/revisions/[revisionId]/restore/route";
import { isCadDomainError } from "../src/shared/errors/cadErrors.util";

test("restore route enforces exact same-origin requests", async () => {
  const response = await restoreRevision(
    new Request("http://localhost/v1", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    }),
    {
      params: Promise.resolve({
        projectId: "demo-project",
        revisionId: "revision-1",
      }),
    },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "ORIGIN_DENIED",
      message: "The request origin is not allowed.",
    },
  });
});

test("project read errors distinguish hidden projects from operational failures", () => {
  assert.equal(
    isCadDomainError(
      new CadDomainError("PROJECT_NOT_FOUND", "missing"),
      "PROJECT_NOT_FOUND",
    ),
    true,
  );
  assert.equal(
    isCadDomainError(new Error("database unavailable"), "PROJECT_NOT_FOUND"),
    false,
  );
});
