import test from "node:test";
import assert from "node:assert/strict";
import { applyParameterValues } from "../../../../../src/features/parameter-controls/browser/services/parameterTransport.service";
import type { ApplyParameterValues } from "@theoryfoundry/contracts";

const input: ApplyParameterValues = {
  parentRevision: "r1",
  requestId: "request",
  sessionId: "session",
  operations: [{ op: "set_value", id: "width", value: 30 }],
};
const saved = {
  type: "saved",
  revision: "r2",
  requestId: "request",
  sessionId: "session",
  sequence: 0,
};
void test("parameter stream rejects missing terminal events, identity/sequence mismatches, trailing events and oversized frames", async () => {
  const original = globalThis.fetch;
  try {
    for (const body of [
      "",
      "{}\n",
      JSON.stringify({ ...saved, sessionId: "other" }) + "\n",
      JSON.stringify({ ...saved, requestId: "other" }) + "\n",
      JSON.stringify({ ...saved, sequence: 1 }) + "\n",
      JSON.stringify(saved),
      JSON.stringify(saved) + "\n" + JSON.stringify(saved) + "\n",
      "x".repeat(2_000_001),
    ]) {
      globalThis.fetch = async (): Promise<Response> => new Response(body);
      await assert.rejects(
        applyParameterValues(
          "project",
          input,
          new AbortController().signal,
          () => {},
        ),
      );
    }
    let received = 0;
    globalThis.fetch = async (_, options): Promise<Response> => {
      assert.equal(options?.method, "POST");
      assert.equal(JSON.parse(String(options?.body)).parentRevision, "r1");
      return new Response(JSON.stringify(saved) + "\n");
    };
    await applyParameterValues(
      "project",
      input,
      new AbortController().signal,
      () => {
        received++;
      },
    );
    assert.equal(received, 1);
  } finally {
    globalThis.fetch = original;
  }
});
