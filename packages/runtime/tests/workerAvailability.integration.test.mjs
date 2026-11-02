import assert from "node:assert/strict";
import test from "node:test";
import { handleWorkerValidationRequest } from "../dist/workerValidation.composition.js";
import { handleWorkerPreviewSourceRequest } from "../dist/workerPreviewSource.composition.js";
import { handleWorkerExportRequest } from "../dist/workerExport.composition.js";

const operations = [
  ...["begin", "status", "complete", "cancel"].flatMap((action) => [
    [
      `validation/${action}`,
      (request) => handleWorkerValidationRequest(request, action),
    ],
    [
      `exports/${action}`,
      (request) => handleWorkerExportRequest(request, action),
    ],
  ]),
  ["preview/source", handleWorkerPreviewSourceRequest],
];

test("configured worker APIs gate every direct request before authentication or body reads", async () => {
  const keys = [
    "THEORYFOUNDRY_REMOTE_MCP_ENABLED",
    "THEORYFOUNDRY_LOCAL_WORKER_ENABLED",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const remote of ["0", "1"])
      for (const worker of ["0", "1"]) {
        process.env[keys[0]] = remote;
        process.env[keys[1]] = worker;
        for (const [path, handle] of operations) {
          const request = new Request(`https://cad.example/v1/worker/${path}`, {
            method: "POST",
            headers: {
              cookie: "session=browser-cookie",
              "content-type": "application/json",
            },
            body: "{invalid JSON",
          });
          const response = await handle(request);
          assert.equal(
            response.status,
            remote === "1" && worker === "1" ? 401 : 404,
            `${path}: ${remote}/${worker}`,
          );
          assert.equal(request.bodyUsed, false);
          assert.equal(response.headers.get("cache-control"), "no-store");
          if (response.status === 404)
            assert.deepEqual(await response.json(), {
              error: { code: "NOT_FOUND" },
            });
          else assert.ok(response.headers.get("www-authenticate"));
        }
      }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
