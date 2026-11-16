import test from "node:test";
import assert from "node:assert/strict";
import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { connectedClient } from "../../../../dist/features/mcp/services/connectedClient.service.js";

async function response(error) {
  const client = connectedClient(
    {
      callTool: async () => ({
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error }) }],
      }),
    },
    async () => {},
  );
  return client.callTool("edit_parameters", {}, {});
}

test("MCP adapter retains only the validated parameter diagnostic fields", async () => {
  const error = {
    code: "INVALID_PARAMETERS",
    message: "Value is below minimum.",
    details: {
      path: "parameters.width.value",
      binding: "width",
      parameterId: "width",
      reason: "Below minimum",
      field: "value",
      diagnostic: "BINDING_CONFLICT",
      line: 2,
      column: 4,
      stack: "private",
      token: "secret",
    },
  };
  const result = await response(error);
  const { stack, token, ...expectedDetails } = error.details;
  void stack;
  void token;
  assert.deepEqual(result.error, { ...error, details: expectedDetails });
  for (const details of [
    { reason: "x".repeat(201) },
    { line: "2" },
    { path: {} },
  ]) {
    assert.equal(
      (await response({ ...error, details })).error.details,
      undefined,
    );
  }
  assert.equal(
    (
      await response({
        code: "RENDER_FAILED",
        message: "failed",
        details: error.details,
      })
    ).error.details,
    undefined,
  );
});

test("oversized or malformed MCP errors do not enter the client error contract", async () => {
  const oversized = await response({
    code: "INVALID_PARAMETERS",
    message: "x".repeat(CAD_LIMITS.toolResultBytes),
  });
  assert.equal(oversized.isError, true);
  assert.equal(oversized.error, undefined);
  assert.equal((await response({ code: 42, message: "bad" })).error, undefined);
});
