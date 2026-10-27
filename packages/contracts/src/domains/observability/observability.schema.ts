import * as z from "zod/v4";
import { OBSERVABILITY_LIMITS } from "./observability.constants.js";
import { CONTRACT_VERSION } from "../../shared/version.constants.js";
import {
  observabilityLevelSchema,
  observabilityOutcomeSchema,
} from "./observability.enum.js";
import {
  requestIdSchema,
  opaqueIdSchema,
  toolCallIdSchema,
  candidateIdSchema,
  revisionIdSchema,
  artifactIdSchema,
} from "../cad/index.js";
import { CHAT_LIMITS } from "../chat/index.js";

const observabilityMetadataValueSchema = z.union([
  z.string().max(OBSERVABILITY_LIMITS.metadataValueCharacters),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const observabilityEnvelopeSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    timestamp: z.string().datetime({ offset: true }),
    level: observabilityLevelSchema,
    service: z.enum([
      "site",
      "gateway",
      "mcp",
      "model-project",
      "renderer",
      "runtime",
    ]),
    event: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_.-]*$/),
    requestId: requestIdSchema,
    conversationId: opaqueIdSchema.optional(),
    toolCallId: toolCallIdSchema.optional(),
    jobId: opaqueIdSchema.optional(),
    candidateId: candidateIdSchema.optional(),
    revisionId: revisionIdSchema.optional(),
    artifactId: artifactIdSchema.optional(),
    durationMs: z
      .number()
      .finite()
      .nonnegative()
      .max(CHAT_LIMITS.requestTimeoutMs)
      .optional(),
    outcome: observabilityOutcomeSchema,
    diagnosticCode: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    metadata: z
      .record(
        z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z][A-Za-z0-9]*$/),
        observabilityMetadataValueSchema,
      )
      .refine(
        (value) =>
          Object.keys(value).length <= OBSERVABILITY_LIMITS.metadataKeys,
        "too many metadata keys",
      )
      .optional(),
  })
  .strict();

export const metricSampleSchema = z
  .object({
    name: z.enum([
      "request_count",
      "request_failure",
      "tool_rounds",
      "render_duration_ms",
      "timeout_count",
      "cancel_count",
      "invalid_candidate_count",
      "promotion_conflict_count",
      "artifact_bytes",
      "artifact_triangles",
      "viewer_load_failure_count",
      "recovery_action_count",
      "observability_truncated_count",
    ]),
    value: z.number().finite().nonnegative(),
    labels: z
      .object({
        service: z.enum([
          "site",
          "gateway",
          "mcp",
          "model-project",
          "renderer",
          "runtime",
        ]),
        operation: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-z][a-z0-9_.-]*$/),
        outcome: observabilityOutcomeSchema,
        diagnosticCode: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Z][A-Z0-9_]*$/)
          .optional(),
      })
      .strict(),
  })
  .strict();
