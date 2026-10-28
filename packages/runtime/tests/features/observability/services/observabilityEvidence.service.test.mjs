import {
  OBSERVABILITY_LIMITS,
  observabilityEnvelopeSchema,
} from "@theoryfoundry/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { ObservabilityEvidence } from "../../../../dist/index.js";
import { digest } from "../../../fixtures/canonicalDemo.fixture.mjs";
test("observability schemas reject cardinality and volume overflow emits one bounded marker", () => {
  assert.equal(
    observabilityEnvelopeSchema.safeParse({
      version: "1",
      timestamp: new Date().toISOString(),
      level: "info",
      service: "runtime",
      event: "bad",
      requestId: "request",
      outcome: "success",
      metadata: Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [`key${i}`, i]),
      ),
    }).success,
    false,
  );
  const evidence = new ObservabilityEvidence();
  for (let i = 0; i < OBSERVABILITY_LIMITS.recordsPerRequest + 20; i += 1) {
    if (i % 2 === 0)
      evidence.metric({
        name: "request_count",
        value: 1,
        labels: {
          service: "runtime",
          operation: "volume.test",
          outcome: "success",
        },
      });
    else
      evidence.record({
        version: "1",
        timestamp: "2026-08-06T06:00:00.000Z",
        level: "info",
        service: "runtime",
        event: "volume.test",
        requestId: "volume-request",
        outcome: "success",
        metadata: { index: i },
      });
  }
  const bundle = evidence.bundle({
    cpu: "fixture",
    ramBytes: 1,
    os: "fixture",
    filesystem: "fixture",
    containerEngine: "fixture",
    containerContext: "fixture",
    containerMode: "fixture",
    cgroup: "fixture",
    browser: "fixture",
    openscadImageDigest: digest("d"),
    bosl2Pin: digest("c"),
    dependencyLockHash: "a".repeat(64),
    validationPolicyHash: "b".repeat(64),
    runTimestamp: "2026-08-06T06:00:00.000Z",
  });
  const snapshot = evidence.snapshot();
  assert.equal(
    bundle.records.filter(
      (record) => record.event === "observability.truncated",
    ).length,
    1,
  );
  assert.equal(
    bundle.metrics.filter(
      (metric) => metric.name === "observability_truncated_count",
    ).length,
    1,
  );
  assert.ok(
    snapshot.volume.records + snapshot.volume.metrics <=
      OBSERVABILITY_LIMITS.recordsPerRequest,
  );
  assert.ok(
    snapshot.volume.serializedBytes <=
      OBSERVABILITY_LIMITS.serializedBytesPerRequest,
  );
  assert.ok(
    bundle.volume.serializedBytes <=
      OBSERVABILITY_LIMITS.serializedBytesPerRequest,
  );
});
