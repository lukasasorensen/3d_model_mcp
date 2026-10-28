import type { ChatEvent } from "@theoryfoundry/contracts";
export const provenance = {
  profile: "trusted-local-development" as const,
  renderer: "fixture",
  rendererVersion: "1",
  openscadVersion: "1",
  openscadBinaryHash: `sha256:${"a".repeat(64)}`,
  openscadHelpHash: `sha256:${"b".repeat(64)}`,
  bosl2Version: "1",
  bosl2Digest: `sha256:${"c".repeat(64)}`,
  imageDigest: `sha256:${"d".repeat(64)}`,
  commandPolicyVersion: "1",
  validationPolicyVersion: "1",
  attestation: {
    engine: "trusted-local-openscad" as const,
    mode: "trusted-local" as const,
    effectiveUid: 501,
    network: "host" as const,
    readOnlyRoot: false as const,
    capabilitiesDropped: false as const,
    noNewPrivileges: false as const,
    inputReadOnly: false as const,
    outputIsolated: false as const,
    resourceLimitsEnforced: false as const,
    seccompEnforced: false as const,
    memoryBytes: 0 as const,
    nanoCpus: 0 as const,
    pidsLimit: 0 as const,
  },
};

export function event(partial: Record<string, unknown>): ChatEvent {
  return {
    ...partial,
    version: "3",
    requestId: "request-1",
    sessionId: "session-1",
    sequence: 0,
    timestamp: "2026-08-05T00:00:00.000Z",
  } as ChatEvent;
}
