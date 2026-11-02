import assert from "node:assert/strict";
import test from "node:test";
import { localWorkerEnabled } from "../../../dist/shared/utils/localWorkerPolicy.util.js";

for (const remote of [undefined, "0", "1", "true"])
  for (const worker of [undefined, "0", "1", "true"])
    test(`local worker availability: remote=${remote}, worker=${worker}`, () => {
      assert.equal(
        localWorkerEnabled({
          THEORYFOUNDRY_REMOTE_MCP_ENABLED: remote,
          THEORYFOUNDRY_LOCAL_WORKER_ENABLED: worker,
        }),
        remote === "1" && worker === "1",
      );
    });
