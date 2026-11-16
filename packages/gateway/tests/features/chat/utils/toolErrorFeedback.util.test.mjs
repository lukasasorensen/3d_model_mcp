import test from "node:test";
import assert from "node:assert/strict";
import { toolErrorFeedback } from "../../../../dist/features/chat/utils/toolErrorFeedback.util.js";

const empty = new Set();

test("parameter feedback preserves bounded actionable value and body diagnostics", () => {
  for (const tool of ["edit_parameters", "propose_model_source"]) {
    const error = {
      code: "INVALID_PARAMETERS",
      message: "Invalid parameters or model body.",
      details: {
        path: "parameters.width.value",
        parameterId: "width",
        binding: "width",
        field: "value",
        diagnostic: "BINDING_CONFLICT",
        reason: "Managed binding is assigned in the body.",
        line: 2,
        column: 4,
      },
    };
    assert.deepEqual(toolErrorFeedback(tool, error, empty), error);
  }
  assert.deepEqual(
    toolErrorFeedback(
      "edit_parameters",
      {
        code: "INVALID_TOOL_INPUT",
        message: "Tool input failed strict schema validation.",
        details: {
          path: "operations.0",
          reason: "Each ID may be targeted once.",
        },
      },
      empty,
    ).details,
    { path: "operations.0", reason: "Each ID may be targeted once." },
  );
});

test("feedback strips unrelated metadata and redacts credentials, paths and known source", () => {
  const token = "provider-secret";
  const source = "cube([secret, 10, 5]);";
  const result = toolErrorFeedback(
    "edit_parameters",
    {
      code: "INVALID_PARAMETERS",
      message: `Invalid ${source}: ${token}`,
      details: {
        reason: `Cannot use /private/tmp/sensitive.scad ${token} abcdefghijklmnopqrstuvwxyz123456`,
        path: "parameters.width.value",
        source,
        stack: "/private/secret",
        token,
      },
    },
    new Set([source]),
    (value) => value.replaceAll(token, "[redacted]"),
  );
  const text = JSON.stringify(result);
  for (const secret of [
    token,
    source,
    "/private",
    "abcdefghijklmnopqrstuvwxyz123456",
  ])
    assert.ok(!text.includes(secret), text);
  assert.deepEqual(Object.keys(result.details).sort(), ["path", "reason"]);
  assert.equal(result.details.path, "parameters.width.value");
});

test("unrelated errors, malformed or oversized diagnostics retain generic feedback", () => {
  for (const error of [
    {
      code: "INTERNAL_ERROR",
      message: "database secret",
      details: { reason: "secret" },
    },
    { code: "INVALID_PARAMETERS", message: "x".repeat(501) },
    {
      code: "INVALID_PARAMETERS",
      message: "bad",
      details: { reason: "x".repeat(201) },
    },
    { code: "INVALID_PARAMETERS", message: "bad", details: { line: -1 } },
    {
      code: "INVALID_PARAMETERS",
      message: "bad",
      details: { binding: "not an identifier" },
    },
    { code: "INVALID_PARAMETERS", message: "bad", details: { path: {} } },
  ])
    assert.equal(
      toolErrorFeedback("edit_parameters", error, empty).message,
      "The CAD tool rejected the request safely.",
    );
  assert.equal(
    toolErrorFeedback(
      "validate_and_render",
      { code: "INVALID_PARAMETERS", message: "secret" },
      empty,
    ).message,
    "The CAD tool rejected the request safely.",
  );
});

test("validated UUID parameter IDs remain actionable while known credentials are redacted", () => {
  const id = "fa2f8b20-2dcd-4c5c-bc3d-a99233629e93";
  const error = {
    code: "INVALID_PARAMETERS",
    message: "Value is below minimum.",
    details: {
      parameterId: id,
      path: `parameters.${id}.value`,
      field: "value",
    },
  };
  assert.deepEqual(
    toolErrorFeedback("edit_parameters", error, empty).details,
    error.details,
  );
  const protectedResult = toolErrorFeedback(
    "edit_parameters",
    error,
    new Set([id]),
  );
  assert.ok(!JSON.stringify(protectedResult).includes(id));
  assert.equal(
    toolErrorFeedback(
      "edit_parameters",
      { ...error, details: { path: "/private/tmp/secret" } },
      empty,
    ).details,
    undefined,
  );
});
