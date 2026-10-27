import * as z from "zod/v4";
import { CHAT_CONTRACT_VERSION } from "../../shared/version.constants.js";
import {
  projectIdSchema,
  sessionIdSchema,
  requestIdSchema,
  toolCallIdSchema,
  candidateIdSchema,
  revisionIdSchema,
  artifactIdSchema,
  artifactFormatSchema,
  CAD_LIMITS,
  opaqueIdSchema,
  exportReceiptSchema,
} from "../cad/index.js";
import { CHAT_LIMITS } from "./chat.constants.js";
import { chatErrorCodeSchema } from "./chatError.enum.js";

export const chatRequestSchema = z
  .object({
    version: z.literal(CHAT_CONTRACT_VERSION),
    projectId: projectIdSchema,
    sessionId: sessionIdSchema,
    message: z.string().trim().min(1).max(CHAT_LIMITS.messageCharacters),
  })
  .strict();

const chatEventBase = {
  version: z.literal(CHAT_CONTRACT_VERSION),
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
};

const cadToolNameSchema = z.enum([
  "get_project_state",
  "read_model_source",
  "propose_model_source",
  "validate_and_render",
  "promote_candidate",
  "export_model",
  "list_revisions",
  "restore_revision",
]);

export const assistantDeltaEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("assistant_delta"),
    delta: z.string().min(1).max(CHAT_LIMITS.assistantDeltaCharacters),
  })
  .strict();

export const toolStartEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("tool_start"),
    tool: cadToolNameSchema,
    toolCallId: toolCallIdSchema,
    round: z.number().int().min(1).max(CHAT_LIMITS.maxToolRounds),
  })
  .strict();

export const toolResultEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("tool_result"),
    tool: cadToolNameSchema,
    toolCallId: toolCallIdSchema,
    outcome: z.enum(["success", "error"]),
    code: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
  })
  .strict();

export const revisionEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("revision"),
    status: z.enum([
      "candidate_created",
      "candidate_validated",
      "candidate_rejected",
      "candidate_promoted",
      "current",
    ]),
    toolCallId: toolCallIdSchema,
    candidateId: candidateIdSchema.optional(),
    revisionId: revisionIdSchema.optional(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.status.startsWith("candidate_") && !event.candidateId)
      context.addIssue({
        code: "custom",
        message: "candidate status requires candidateId",
      });
    if (
      (event.status === "candidate_promoted" || event.status === "current") &&
      !event.revisionId
    )
      context.addIssue({
        code: "custom",
        message: "current/promoted status requires revisionId",
      });
  });

export const artifactEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("artifact"),
    toolCallId: toolCallIdSchema,
    artifactId: artifactIdSchema,
    revisionId: revisionIdSchema,
    format: artifactFormatSchema,
    mimeType: z.enum(["model/stl", "model/3mf"]),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative().max(CAD_LIMITS.exportBytes),
  })
  .strict();

export const browserRenderRequestEventSchema = z
  .object({
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
  })
  .strict();

export const chatErrorEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("error"),
    code: chatErrorCodeSchema,
    message: z.string().min(1).max(CHAT_LIMITS.publicErrorCharacters),
    recoverable: z.boolean(),
    toolCallId: toolCallIdSchema.optional(),
  })
  .strict();

export const doneEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("done"),
    outcome: z.enum(["completed", "failed", "cancelled"]),
    toolRounds: z.number().int().nonnegative().max(CHAT_LIMITS.maxToolRounds),
  })
  .strict();

export const exportReadyEventSchema = z
  .object({
    ...chatEventBase,
    type: z.literal("export_ready"),
    export: exportReceiptSchema,
  })
  .strict();

export const chatEventSchema = z.union([
  exportReadyEventSchema,
  assistantDeltaEventSchema,
  toolStartEventSchema,
  toolResultEventSchema,
  revisionEventSchema,
  artifactEventSchema,
  browserRenderRequestEventSchema,
  chatErrorEventSchema,
  doneEventSchema,
]);
