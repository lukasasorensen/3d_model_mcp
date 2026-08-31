import * as z from "zod/v4";

export const CONTRACT_VERSION = "1" as const;
export const CHAT_CONTRACT_VERSION = "3" as const;
export const PRODUCT_ID = "3d_model_mcp" as const;
export const BROWSER_RENDERER = Object.freeze({
  openscadVersion: "2026.07.20",
  openscadArchiveSha256: "8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd",
  openscadGlueSha256: "e458673d46d506d77b780c526d6e5492250f353d582057c6f912724a9586d86e",
  openscadWasmSha256: "c19a3a868991e86f76f22f254e04002db45f00c91f24e4c672cf93c859e80e19",
  bosl2Version: "v2.0.741",
  bosl2ArchiveSha256: "4fb7b58cbeadfe5f8c5a037d9e1392d774117d48423f95f4203aa367d8b1ea88",
  backend: "manifold",
  timeoutMs: 60_000,
});

export const CAD_LIMITS = Object.freeze({
  sourceBytes: 256 * 1024,
  previewBytes: 10 * 1024 * 1024,
  previewTriangles: 250_000,
  exportBytes: 25 * 1024 * 1024,
  diagnosticCount: 50,
  diagnosticMessageCharacters: 2_000,
  toolResultBytes: 512 * 1024,
});

export const RENDERER_ISOLATION_LIMITS = Object.freeze({
  memoryBytes: 512 * 1024 * 1024,
  nanoCpus: 1_000_000_000,
  pidsLimit: 128,
});

/** IDs are opaque workspace keys, never filesystem paths. */
export const opaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "must be an opaque ID, not a path");
export const projectIdSchema = opaqueIdSchema;
export const revisionIdSchema = opaqueIdSchema;
export const candidateIdSchema = opaqueIdSchema;
export const artifactIdSchema = opaqueIdSchema;
export const sessionIdSchema = opaqueIdSchema;
export const requestIdSchema = opaqueIdSchema;
export const toolCallIdSchema = opaqueIdSchema;

export const candidateStateSchema = z.enum([
  "CREATED",
  "RUNNING",
  "VALID",
  "REJECTED",
  "PROMOTED",
  "SUPERSEDED",
]);
export type CandidateState = z.infer<typeof candidateStateSchema>;

export const diagnosticSchema = z
  .object({
    code: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().max(CAD_LIMITS.diagnosticMessageCharacters),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  })
  .strict();
export type Diagnostic = z.infer<typeof diagnosticSchema>;

export const cadErrorCodeSchema = z.enum([
  "INVALID_TOOL_INPUT",
  "PROJECT_NOT_FOUND",
  "REVISION_NOT_FOUND",
  "CANDIDATE_NOT_FOUND",
  "ARTIFACT_NOT_FOUND",
  "INVALID_CANDIDATE_STATE",
  "STALE_REVISION",
  "SOURCE_TOO_LARGE",
  "FORBIDDEN_SOURCE_REFERENCE",
  "SOURCE_HASH_MISMATCH",
  "ARTIFACT_HASH_MISMATCH",
  "ARTIFACT_LIMIT_EXCEEDED",
  "POLICY_MISMATCH",
  "PROVENANCE_MISMATCH",
  "CORRUPT_PROJECT",
  "RENDER_FAILED",
  "BROWSER_RENDERER_UNAVAILABLE",
  "CANCELLED",
  "LOCK_TIMEOUT",
  "INTERNAL_ERROR",
]);
export const cadErrorSchema = z
  .object({
    code: cadErrorCodeSchema,
    message: z.string().min(1).max(500),
    details: z
      .record(z.string().max(80), z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]))
      .refine((value) => Object.keys(value).length <= 16, "too many error details")
      .optional(),
  })
  .strict();
export type CadError = z.infer<typeof cadErrorSchema>;

const productionAttestationSchema = z.object({
  engine: z.string().min(1).max(100),
  mode: z.enum(["rootless", "vm-backed"]),
  effectiveUid: z.number().int().positive(),
  network: z.literal("none"), readOnlyRoot: z.literal(true), capabilitiesDropped: z.literal(true),
  noNewPrivileges: z.literal(true), inputReadOnly: z.literal(true), outputIsolated: z.literal(true),
  resourceLimitsEnforced: z.literal(true), seccompEnforced: z.literal(true),
  memoryBytes: z.literal(RENDERER_ISOLATION_LIMITS.memoryBytes), nanoCpus: z.literal(RENDERER_ISOLATION_LIMITS.nanoCpus), pidsLimit: z.literal(RENDERER_ISOLATION_LIMITS.pidsLimit),
  openscadVersion: z.string().min(1).max(100),
  openscadBinaryHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  openscadHelpHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  bosl2Version: z.string().min(1).max(100),
  bosl2Digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

const trustedLocalAttestationSchema = z.object({
  engine: z.literal("trusted-local-openscad"), mode: z.literal("trusted-local"), effectiveUid: z.number().int().nonnegative(),
  network: z.literal("host"), readOnlyRoot: z.literal(false), capabilitiesDropped: z.literal(false),
  noNewPrivileges: z.literal(false), inputReadOnly: z.literal(false), outputIsolated: z.literal(false),
  resourceLimitsEnforced: z.literal(false), seccompEnforced: z.literal(false),
  memoryBytes: z.literal(0), nanoCpus: z.literal(0), pidsLimit: z.literal(0),
}).strict();

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
  z.object({ ...rendererProvenanceBase, profile: z.literal("production-oci"), attestation: productionAttestationSchema }).strict(),
  z.object({ ...rendererProvenanceBase, profile: z.literal("trusted-local-development"), attestation: trustedLocalAttestationSchema }).strict(),
  z.object({
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
  }).strict(),
]);
export type RendererProvenance = z.infer<typeof rendererProvenanceSchema>;

export function isProductionRendererProvenance(provenance: RendererProvenance): boolean {
  const parsed = rendererProvenanceSchema.safeParse(provenance);
  return parsed.success && parsed.data.profile === "production-oci";
}

export function isBrowserRendererProvenance(provenance: RendererProvenance): boolean {
  const parsed = rendererProvenanceSchema.safeParse(provenance);
  return parsed.success && parsed.data.profile === "browser-wasm";
}

export interface RenderedArtifact {
  format: "stl" | "3mf";
  bytes: Uint8Array;
  mimeType: "model/stl" | "model/3mf";
  triangleCount: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  tessellation: Record<string, string | number | boolean>;
}

export interface RenderValidationResult {
  outcome: "VALID" | "REJECTED";
  diagnostics: Diagnostic[];
  provenance: RendererProvenance;
  validationPolicyVersion: string;
  artifacts: RenderedArtifact[];
}

export interface CandidateRenderRequest {
  projectId: string;
  candidateId: string;
  source: string;
  sourceHash: string;
  previewProfile: "standard";
  signal?: AbortSignal;
}

/** Implementations validate the exact source hash through the configured rendering boundary. */
export interface CadRenderer {
  validateAndRender(request: CandidateRenderRequest): Promise<RenderValidationResult>;
}

export const boundingBoxSchema = z
  .object({
    min: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    max: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  })
  .strict();

export const artifactFormatSchema = z.enum(["stl", "3mf"]);
export const artifactManifestSchema = z
  .object({
    artifactId: artifactIdSchema,
    format: artifactFormatSchema,
    mimeType: z.enum(["model/stl", "model/3mf"]),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    units: z.literal("mm"),
    axisConvention: z.literal("right-handed-z-up"),
    boundingBox: boundingBoxSchema,
    sourceRevision: revisionIdSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    renderer: rendererProvenanceSchema,
    tessellation: z
      .record(z.string().max(80), z.union([z.string().max(200), z.number().finite(), z.boolean()]))
      .refine((value) => Object.keys(value).length <= 32, "too many tessellation settings"),
  })
  .strict();
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export const revisionManifestSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    projectId: projectIdSchema,
    revisionId: revisionIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    restoredFrom: revisionIdSchema.optional(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceBytes: z.number().int().nonnegative().max(CAD_LIMITS.sourceBytes),
    createdAt: z.string().datetime({ offset: true }),
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
    candidateId: candidateIdSchema,
    validationPolicyVersion: z.string().min(1).max(100),
    validationResult: z.literal("VALID"),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
    artifacts: z.array(artifactManifestSchema).max(8),
    renderer: rendererProvenanceSchema,
  })
  .strict();
export type RevisionManifest = z.infer<typeof revisionManifestSchema>;

export const candidateRecordSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceBytes: z.number().int().positive().max(CAD_LIMITS.sourceBytes),
    state: candidateStateSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
    validationPolicyVersion: z.string().min(1).max(100).optional(),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount).default([]),
    renderer: rendererProvenanceSchema.optional(),
    artifacts: z.array(artifactManifestSchema.omit({ sourceRevision: true })).max(8).default([]),
  })
  .strict();
export type CandidateRecord = z.infer<typeof candidateRecordSchema>;

export const getProjectStateInputSchema = z.object({ projectId: projectIdSchema }).strict();
export const readModelSourceInputSchema = z
  .object({ projectId: projectIdSchema, revision: revisionIdSchema.optional() })
  .strict();
export const proposeModelSourceInputSchema = z
  .object({
    projectId: projectIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    source: z.string().min(1).max(CAD_LIMITS.sourceBytes),
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
  })
  .strict();
export const validateAndRenderInputSchema = z
  .object({
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    previewProfile: z.literal("standard"),
  })
  .strict();
export const promoteCandidateInputSchema = z
  .object({
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    expectedParentRevision: revisionIdSchema.nullable(),
  })
  .strict();
export const exportModelInputSchema = z
  .object({ projectId: projectIdSchema, revision: revisionIdSchema, format: z.literal("3mf") })
  .strict();
export const listRevisionsInputSchema = z.object({ projectId: projectIdSchema }).strict();
export const restoreRevisionInputSchema = z
  .object({
    projectId: projectIdSchema,
    revision: revisionIdSchema,
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
  })
  .strict();

export const projectStateSchema = z
  .object({
    projectId: projectIdSchema,
    currentRevision: revisionIdSchema.nullable(),
    source: z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative() }).strict().nullable(),
    artifacts: z.array(artifactManifestSchema).max(8),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
  })
  .strict();
export const projectSummarySchema = z.object({ projectId: projectIdSchema }).strict();
export const projectListSchema = z.object({ projects: z.array(projectSummarySchema) }).strict();
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export const getProjectStateOutputSchema = z.object({ state: projectStateSchema }).strict();
export const readModelSourceOutputSchema = z
  .object({
    model: z.object({ revision: revisionIdSchema, source: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  })
  .strict();
export const proposeModelSourceOutputSchema = z.object({ candidate: candidateRecordSchema }).strict();
export const validateAndRenderOutputSchema = z.object({ candidate: candidateRecordSchema }).strict();
export const promoteCandidateOutputSchema = z.object({ revision: revisionManifestSchema }).strict();
export const exportModelOutputSchema = z.object({
  export: z.object({ revision: revisionIdSchema, source: z.string().min(1).max(CAD_LIMITS.sourceBytes), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), format: z.literal("3mf") }).strict(),
}).strict();
export const listRevisionsOutputSchema = z.object({ revisions: z.array(revisionManifestSchema) }).strict();
export const restoreRevisionOutputSchema = z.object({ revision: revisionManifestSchema }).strict();

export type ServiceName = "site" | "gateway" | "mcp" | "model-project" | "renderer" | "runtime";
export interface VersionedEnvelope<TType extends string, TPayload> {
  version: typeof CONTRACT_VERSION;
  type: TType;
  payload: TPayload;
}
export function createEnvelope<TType extends string, TPayload>(type: TType, payload: TPayload): VersionedEnvelope<TType, TPayload> {
  return { version: CONTRACT_VERSION, type, payload };
}

export const CHAT_LIMITS = Object.freeze({
  requestBytes: 32 * 1024,
  messageCharacters: 12_000,
  assistantDeltaCharacters: 4_000,
  assistantOutputCharacters: 32_000,
  publicErrorCharacters: 500,
  maxToolRounds: 8,
  maxRepairAttempts: 2,
  requestTimeoutMs: 120_000,
});

export const chatRequestSchema = z.object({
  version: z.literal(CHAT_CONTRACT_VERSION),
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  message: z.string().trim().min(1).max(CHAT_LIMITS.messageCharacters),
}).strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;

const chatEventBase = {
  version: z.literal(CHAT_CONTRACT_VERSION),
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
};
const cadToolNameSchema = z.enum([
  "get_project_state", "read_model_source", "propose_model_source", "validate_and_render",
  "promote_candidate", "export_model", "list_revisions", "restore_revision",
]);

export const assistantDeltaEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("assistant_delta"),
  delta: z.string().min(1).max(CHAT_LIMITS.assistantDeltaCharacters),
}).strict();
export const toolStartEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("tool_start"),
  tool: cadToolNameSchema,
  toolCallId: toolCallIdSchema,
  round: z.number().int().min(1).max(CHAT_LIMITS.maxToolRounds),
}).strict();
export const toolResultEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("tool_result"),
  tool: cadToolNameSchema,
  toolCallId: toolCallIdSchema,
  outcome: z.enum(["success", "error"]),
  code: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/).optional(),
}).strict();
export const revisionEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("revision"),
  status: z.enum(["candidate_created", "candidate_validated", "candidate_rejected", "candidate_promoted", "current"]),
  toolCallId: toolCallIdSchema,
  candidateId: candidateIdSchema.optional(),
  revisionId: revisionIdSchema.optional(),
}).strict().superRefine((event, context) => {
  if (event.status.startsWith("candidate_") && !event.candidateId) context.addIssue({ code: "custom", message: "candidate status requires candidateId" });
  if ((event.status === "candidate_promoted" || event.status === "current") && !event.revisionId) context.addIssue({ code: "custom", message: "current/promoted status requires revisionId" });
});
export const artifactEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("artifact"),
  toolCallId: toolCallIdSchema,
  artifactId: artifactIdSchema,
  revisionId: revisionIdSchema,
  format: artifactFormatSchema,
  mimeType: z.enum(["model/stl", "model/3mf"]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative().max(CAD_LIMITS.exportBytes),
}).strict();
export const browserRenderRequestEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("browser_render_request"),
  toolCallId: toolCallIdSchema,
  jobId: opaqueIdSchema,
  token: z.string().regex(/^[a-f0-9]{64}$/),
  purpose: z.enum(["candidate", "restore", "export"]),
  candidateId: candidateIdSchema.optional(),
  revisionId: revisionIdSchema.optional(),
  source: z.string().min(1).max(CAD_LIMITS.sourceBytes),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(["stl", "3mf"]),
  deadline: z.string().datetime({ offset: true }),
}).strict();

export const browserRenderCompletionSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  sessionId: sessionIdSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  outcome: z.enum(["VALID", "REJECTED"]),
  diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
  provenance: rendererProvenanceSchema.refine((value) => value.profile === "browser-wasm", "browser WASM provenance required"),
}).strict();
export type BrowserRenderCompletion = z.infer<typeof browserRenderCompletionSchema>;

/** Local-only handoff from the standalone MCP process to an open browser tab. */
export const localMcpBrowserRenderJobSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  jobId: opaqueIdSchema,
  projectId: projectIdSchema,
  candidateId: candidateIdSchema,
  token: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.string().min(1).max(CAD_LIMITS.sourceBytes),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.literal("stl"),
  createdAt: z.string().datetime({ offset: true }),
  deadline: z.string().datetime({ offset: true }),
}).strict();
export type LocalMcpBrowserRenderJob = z.infer<typeof localMcpBrowserRenderJobSchema>;

export const remoteMcpBrowserRenderJobSchema = localMcpBrowserRenderJobSchema.omit({ version: true, projectId: true, createdAt: true }).extend({ purpose: z.literal("candidate") });
export type RemoteMcpBrowserRenderJob = z.infer<typeof remoteMcpBrowserRenderJobSchema>;

export const chatErrorCodeSchema = z.enum([
  "INVALID_REQUEST", "ORIGIN_DENIED", "SESSION_MISMATCH", "PROVIDER_FAILURE", "MCP_FAILURE",
  "CAD_TOOL_REJECTED", "RENDERER_FAILURE", "TOOL_LIMIT_EXCEEDED", "REPAIR_LIMIT_EXCEEDED",
  "TOOL_RESULT_TOO_LARGE", "REQUEST_TIMEOUT", "CANCELLED", "INTERNAL_ERROR",
]);
export const chatErrorEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("error"),
  code: chatErrorCodeSchema,
  message: z.string().min(1).max(CHAT_LIMITS.publicErrorCharacters),
  recoverable: z.boolean(),
  toolCallId: toolCallIdSchema.optional(),
}).strict();
export const doneEventSchema = z.object({
  ...chatEventBase,
  type: z.literal("done"),
  outcome: z.enum(["completed", "failed", "cancelled"]),
  toolRounds: z.number().int().nonnegative().max(CHAT_LIMITS.maxToolRounds),
}).strict();
export const chatEventSchema = z.union([
  assistantDeltaEventSchema, toolStartEventSchema, toolResultEventSchema, revisionEventSchema,
  artifactEventSchema, browserRenderRequestEventSchema, chatErrorEventSchema, doneEventSchema,
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

export const OBSERVABILITY_LIMITS = Object.freeze({
  recordsPerRequest: 1_000,
  serializedBytesPerRequest: 1024 * 1024,
  metadataKeys: 24,
  metadataValueCharacters: 256,
});

export const observabilityLevelSchema = z.enum(["debug", "info", "warning", "error"]);
export const observabilityOutcomeSchema = z.enum(["started", "success", "failure", "cancelled", "unavailable"]);
const observabilityMetadataValueSchema = z.union([
  z.string().max(OBSERVABILITY_LIMITS.metadataValueCharacters),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const observabilityEnvelopeSchema = z.object({
  version: z.literal(CONTRACT_VERSION),
  timestamp: z.string().datetime({ offset: true }),
  level: observabilityLevelSchema,
  service: z.enum(["site", "gateway", "mcp", "model-project", "renderer", "runtime"]),
  event: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_.-]*$/),
  requestId: requestIdSchema,
  conversationId: opaqueIdSchema.optional(),
  toolCallId: toolCallIdSchema.optional(),
  jobId: opaqueIdSchema.optional(),
  candidateId: candidateIdSchema.optional(),
  revisionId: revisionIdSchema.optional(),
  artifactId: artifactIdSchema.optional(),
  durationMs: z.number().finite().nonnegative().max(CHAT_LIMITS.requestTimeoutMs).optional(),
  outcome: observabilityOutcomeSchema,
  diagnosticCode: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  metadata: z.record(z.string().min(1).max(64).regex(/^[a-z][A-Za-z0-9]*$/), observabilityMetadataValueSchema)
    .refine((value) => Object.keys(value).length <= OBSERVABILITY_LIMITS.metadataKeys, "too many metadata keys")
    .optional(),
}).strict();
export type ObservabilityEnvelope = z.infer<typeof observabilityEnvelopeSchema>;

export const metricSampleSchema = z.object({
  name: z.enum([
    "request_count", "request_failure", "tool_rounds", "render_duration_ms", "timeout_count",
    "cancel_count", "invalid_candidate_count", "promotion_conflict_count", "artifact_bytes",
    "artifact_triangles", "viewer_load_failure_count", "recovery_action_count", "observability_truncated_count",
  ]),
  value: z.number().finite().nonnegative(),
  labels: z.object({
    service: z.enum(["site", "gateway", "mcp", "model-project", "renderer", "runtime"]),
    operation: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_.-]*$/),
    outcome: observabilityOutcomeSchema,
    diagnosticCode: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  }).strict(),
}).strict();
export type MetricSample = z.infer<typeof metricSampleSchema>;
