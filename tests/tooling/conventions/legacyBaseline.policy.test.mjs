import assert from "node:assert/strict";
import test from "node:test";
import {
  compareBaselines,
  evaluateRecords,
  validateBaseline,
} from "../../../tooling/conventions/legacyBaseline.policy.mjs";

const file = "src/old-file.ts";
const record = {
  formatHash: "a".repeat(64),
  maxLines: 501,
  rules: ["filename"],
};
const baseline = (files) => ({
  version: 1,
  sourceCommit: "a".repeat(40),
  files,
});

test("allows only shrinking existing exemptions", () => {
  const original = baseline({ [file]: record });
  assert.deepEqual(compareBaselines(original, original), []);
  assert.deepEqual(compareBaselines(baseline({}), original), []);
  assert.deepEqual(
    compareBaselines(baseline({ [file]: { rules: ["filename"] } }), original),
    [],
  );
  for (const changed of [
    baseline({ "new.ts": record }),
    baseline({ [file]: { ...record, formatHash: "b".repeat(64) } }),
    baseline({ [file]: { ...record, maxLines: 502 } }),
    baseline({ [file]: { ...record, rules: ["filename", "test-placement"] } }),
  ])
    assert.ok(
      compareBaselines(changed, original).some((finding) =>
        /added|changed|increased/.test(finding),
      ),
    );
  assert.ok(
    compareBaselines(
      { ...original, sourceCommit: "b".repeat(40) },
      original,
    ).some((finding) => finding.includes("sourceCommit")),
  );
});

test("rejects malformed records instead of silently bypassing the ratchet", () => {
  for (const candidate of [
    null,
    {},
    baseline({ [file]: {} }),
    baseline({ [file]: { maxLines: "900" } }),
    baseline({ [file]: { rules: ["skip-all"] } }),
  ]) {
    assert.throws(() => validateBaseline(candidate), /baseline|legacy record/);
  }
});

test("reports actionable failures for changed legacy content and new violations", () => {
  const findings = evaluateRecords(
    {
      [file]: {
        ...record,
        formatHash: "b".repeat(64),
        maxLines: 502,
        rules: ["filename", "layer-suffix"],
      },
    },
    baseline({ [file]: record }),
  );
  assert.equal(findings.length, 3);
  assert.ok(findings.every((finding) => finding.startsWith(file)));
  assert.ok(findings.some((finding) => finding.includes("prettier --write")));
  assert.ok(
    findings.some((finding) => finding.includes("split by responsibility")),
  );
  assert.ok(findings.some((finding) => finding.includes("containing layer")));
  assert.deepEqual(
    evaluateRecords({ [file]: record }, baseline({ [file]: record })),
    [],
  );
});

test("requires resolved and removed files to shrink the baseline", () => {
  const original = baseline({ [file]: record });
  assert.equal(evaluateRecords({}, original).length, 3);
  assert.equal(evaluateRecords({}, original, "format").length, 1);
  assert.equal(evaluateRecords({}, original, "conventions").length, 2);
  assert.deepEqual(evaluateRecords({}, baseline({})), []);
});
