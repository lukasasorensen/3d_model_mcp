import assert from "node:assert/strict";
import test from "node:test";
import {
  compareArchitectureBaselines,
  evaluateArchitectureBaseline,
  validateArchitectureBaseline,
} from "../../../tooling/architecture/architectureBaseline.policy.mjs";

const edge = {
  file: "packages/a/src/read.service.ts",
  rule: "layer-boundary",
  target: "packages/b/src/write.service.ts",
  owner: "THE-28",
  reason: "Legacy orchestration; replace with a workflow.",
};
const baseline = (violations) => ({
  version: 1,
  sourceCommit: "a".repeat(40),
  violations,
});

test("architecture exceptions can shrink but cannot transfer to new files, edges or rules", () => {
  const previous = baseline([edge]);
  assert.deepEqual(compareArchitectureBaselines(previous, previous), []);
  assert.deepEqual(compareArchitectureBaselines(baseline([]), previous), []);
  for (const update of [
    { file: "packages/a/src/new.service.ts" },
    { target: "packages/b/src/new.service.ts" },
    { rule: "public-api" },
  ]) {
    const findings = compareArchitectureBaselines(
      baseline([{ ...edge, ...update }]),
      previous,
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0], /added or retargeted/);
  }
  assert.match(
    compareArchitectureBaselines(
      { ...previous, sourceCommit: "b".repeat(40) },
      previous,
    )[0],
    /provenance/,
  );
});

test("new violations and resolved exceptions both fail with actionable file/edge diagnostics", () => {
  assert.deepEqual(evaluateArchitectureBaseline([edge], baseline([edge])), []);
  assert.match(
    evaluateArchitectureBaseline([], baseline([edge]))[0],
    /resolved\/stale.*remove/,
  );
  const finding = { ...edge, message: "Move sequencing into a workflow." };
  const result = evaluateArchitectureBaseline([finding], baseline([]));
  assert.ok(result[0].includes(edge.file) && result[0].includes(edge.target));
  assert.match(result[0], /workflow/);
});

test("malformed, ownerless and duplicate exceptions fail closed", () => {
  for (const input of [
    null,
    {},
    baseline([{}]),
    baseline([{ ...edge, owner: "" }]),
    baseline([edge, edge]),
  ])
    assert.throws(
      () => validateArchitectureBaseline(input),
      /baseline|exemption/,
    );
});
