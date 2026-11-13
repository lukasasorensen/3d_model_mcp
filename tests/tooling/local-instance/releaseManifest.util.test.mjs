import test from "node:test";
import assert from "node:assert/strict";
import { publishedRelease } from "../../../tooling/local-instance/releaseManifest.util.mjs";
const manifest = {
  version: "0.8.0",
  workerVersion: "0.3.0",
  postgresMajor: 18,
  appImage: `ghcr.io/lukasasorensen/theoryfoundry-local-app@sha256:${"a".repeat(64)}`,
  toolingImage: `ghcr.io/lukasasorensen/theoryfoundry-local-tooling@sha256:${"b".repeat(64)}`,
  postgresImage: `postgres@sha256:${"c".repeat(64)}`,
};
test("release candidates require matching versions and trusted digest-pinned images", () => {
  assert.deepEqual(publishedRelease(manifest, "0.8.0", "0.3.0"), manifest);
  for (const change of [
    { version: "0.9.0" },
    { workerVersion: "0.4.0" },
    { postgresMajor: 17 },
    { appImage: "theoryfoundry/local-app:0.8.0" },
    { postgresImage: undefined },
    { toolingImage: `untrusted.example/tooling@sha256:${"b".repeat(64)}` },
    { unexpected: true },
  ])
    assert.throws(() =>
      publishedRelease({ ...manifest, ...change }, "0.8.0", "0.3.0"),
    );
});
