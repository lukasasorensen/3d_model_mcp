import { VALIDATION_POLICY_VERSION } from "@theoryfoundry/model-project";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
export const fixtureUrl = (name) =>
  new URL(`../../../../fixtures/canonical-demo/${name}`, import.meta.url);

export const canonical = {
  r1: JSON.parse(await readFile(fixtureUrl("create.json"), "utf8")),
  r2: JSON.parse(await readFile(fixtureUrl("edit-1.json"), "utf8")),
  r3: JSON.parse(await readFile(fixtureUrl("edit-2.json"), "utf8")),
  export: JSON.parse(await readFile(fixtureUrl("export.json"), "utf8")),
};

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export const digest = (character) => `sha256:${character.repeat(64)}`;

export const provenance = {
  profile: "production-oci",
  renderer: "g006-test-only-deterministic-fixture",
  rendererVersion: "1",
  openscadVersion: "fixture-openscad-2025.03.25",
  openscadBinaryHash: digest("a"),
  openscadHelpHash: digest("b"),
  bosl2Version: "fixture-bosl2-v2.0.741",
  bosl2Digest: digest("c"),
  imageDigest: digest("d"),
  commandPolicyVersion: "oci-command-v1",
  validationPolicyVersion: VALIDATION_POLICY_VERSION,
  attestation: {
    engine: "fixture-vm",
    mode: "vm-backed",
    effectiveUid: 1000,
    network: "none",
    readOnlyRoot: true,
    capabilitiesDropped: true,
    noNewPrivileges: true,
    inputReadOnly: true,
    outputIsolated: true,
    resourceLimitsEnforced: true,
    seccompEnforced: true,
    memoryBytes: 512 * 1024 * 1024,
    nanoCpus: 1_000_000_000,
    pidsLimit: 128,
    openscadVersion: "fixture-openscad-2025.03.25",
    openscadBinaryHash: digest("a"),
    openscadHelpHash: digest("b"),
    bosl2Version: "fixture-bosl2-v2.0.741",
    bosl2Digest: digest("c"),
  },
};
