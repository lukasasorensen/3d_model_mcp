import * as z from "zod/v4";
import {
  RENDERER_ISOLATION_LIMITS,
  BROWSER_RENDERER,
} from "./cad.constants.js";

const productionAttestationSchema = z
  .object({
    engine: z.string().min(1).max(100),
    mode: z.enum(["rootless", "vm-backed"]),
    effectiveUid: z.number().int().positive(),
    network: z.literal("none"),
    readOnlyRoot: z.literal(true),
    capabilitiesDropped: z.literal(true),
    noNewPrivileges: z.literal(true),
    inputReadOnly: z.literal(true),
    outputIsolated: z.literal(true),
    resourceLimitsEnforced: z.literal(true),
    seccompEnforced: z.literal(true),
    memoryBytes: z.literal(RENDERER_ISOLATION_LIMITS.memoryBytes),
    nanoCpus: z.literal(RENDERER_ISOLATION_LIMITS.nanoCpus),
    pidsLimit: z.literal(RENDERER_ISOLATION_LIMITS.pidsLimit),
    openscadVersion: z.string().min(1).max(100),
    openscadBinaryHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    openscadHelpHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    bosl2Version: z.string().min(1).max(100),
    bosl2Digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

const trustedLocalAttestationSchema = z
  .object({
    engine: z.literal("trusted-local-openscad"),
    mode: z.literal("trusted-local"),
    effectiveUid: z.number().int().nonnegative(),
    network: z.literal("host"),
    readOnlyRoot: z.literal(false),
    capabilitiesDropped: z.literal(false),
    noNewPrivileges: z.literal(false),
    inputReadOnly: z.literal(false),
    outputIsolated: z.literal(false),
    resourceLimitsEnforced: z.literal(false),
    seccompEnforced: z.literal(false),
    memoryBytes: z.literal(0),
    nanoCpus: z.literal(0),
    pidsLimit: z.literal(0),
  })
  .strict();

const rendererProvenanceBase = {
  renderer: z.string().min(1).max(100),
  rendererVersion: z.string().min(1).max(100),
  openscadVersion: z.string().min(1).max(100),
  openscadBinaryHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  openscadHelpHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  bosl2Version: z.string().min(1).max(100),
  bosl2Digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  commandPolicyVersion: z.string().min(1).max(100),
  validationPolicyVersion: z.string().min(1).max(100),
};

export const rendererProvenanceSchema = z.discriminatedUnion("profile", [
  z
    .object({
      ...rendererProvenanceBase,
      profile: z.literal("production-oci"),
      attestation: productionAttestationSchema,
    })
    .strict(),
  z
    .object({
      ...rendererProvenanceBase,
      profile: z.literal("trusted-local-development"),
      attestation: trustedLocalAttestationSchema,
    })
    .strict(),
  z
    .object({
      profile: z.literal("browser-wasm"),
      renderer: z.literal("openscad-wasm"),
      rendererVersion: z.string().min(1).max(100),
      openscadVersion: z.literal(BROWSER_RENDERER.openscadVersion),
      openscadWasmHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      openscadGlueHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      bosl2Version: z.literal(BROWSER_RENDERER.bosl2Version),
      bosl2Digest: z.literal(`sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}`),
      backend: z.literal(BROWSER_RENDERER.backend),
      commandPolicyVersion: z.string().min(1).max(100),
      validationPolicyVersion: z.string().min(1).max(100),
    })
    .strict(),
]);
