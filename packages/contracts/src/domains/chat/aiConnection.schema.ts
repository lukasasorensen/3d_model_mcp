import * as z from "zod/v4";

export const AI_LIMITS = Object.freeze({
  outputTokens: 8192,
  invocationBytes: 8 * 1024 * 1024,
  resultBytes: 512 * 1024,
  providerStreamBytes: 8 * 1024 * 1024,
  heartbeatMs: 10_000,
  offlineMs: 35_000,
  leaseMs: 30_000,
  pollMs: 20_000,
});
export const aiProviderSchema = z.enum([
  "anthropic",
  "openai",
  "google",
  "ollama",
  "openai-compatible",
]);
export const modelIdSchema = z.string().trim().min(1).max(200);
export const aiConnectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    provider: aiProviderSchema,
    location: z.enum(["hosted", "local"]),
    model: modelIdSchema,
    endpoint: z.string().url().max(2000).optional(),
    companionId: z.string().uuid().optional(),
    token: z.string().min(1).max(4096).optional(),
    isDefault: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string): void =>
      ctx.addIssue({ code: "custom", message });
    if (value.location === "local") {
      if (!["ollama", "openai-compatible"].includes(value.provider))
        issue("This provider requires a hosted connection.");
      if (!value.companionId || value.endpoint || value.token)
        issue(
          "Local connections require a companion; configure endpoints and credentials on that computer.",
        );
    } else {
      if (value.provider === "ollama" || value.companionId)
        issue("Ollama requires a local companion.");
      if (
        value.provider === "openai-compatible"
          ? !value.endpoint
          : Boolean(value.endpoint)
      )
        issue("Only compatible hosted connections accept an endpoint.");
    }
  });
export const aiConnectionSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: aiProviderSchema,
  location: z.enum(["hosted", "local"]),
  model: modelIdSchema,
  endpoint: z.string().optional(),
  companionId: z.string().uuid().optional(),
  isDefault: z.boolean(),
  hasCredential: z.boolean(),
  status: z.enum(["ready", "offline", "credential-unavailable"]),
});
export const companionSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  provider: z.enum(["ollama", "openai-compatible"]),
  online: z.boolean(),
});
export const companionRegistrationSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    provider: z.enum(["ollama", "openai-compatible"]),
  })
  .strict();
export const modelResultSchema = z
  .object({
    content: z.string().max(AI_LIMITS.resultBytes),
    toolCalls: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            name: z.string().min(1).max(100),
            args: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const inferenceMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().max(AI_LIMITS.invocationBytes),
    toolCalls: modelResultSchema.shape.toolCalls.optional(),
    toolCallId: z.string().max(200).optional(),
  })
  .strict();
export const inferenceInputSchema = z
  .object({
    operation: z.literal("invoke"),
    model: modelIdSchema,
    messages: z.array(inferenceMessageSchema).max(64),
    tools: z
      .array(
        z
          .object({
            name: z.string().max(100),
            description: z.string().max(2000),
            parameters: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const aiFailureCodeSchema = z.enum([
  "AI_AUTHENTICATION",
  "AI_QUOTA",
  "AI_MODEL_UNSUPPORTED",
  "AI_OFFLINE",
  "AI_TIMEOUT",
  "AI_CONFIGURATION",
  "AI_PROVIDER_FAILURE",
  "AI_RESPONSE_TOO_LARGE",
]);
export const companionJobInputSchema = z.union([
  inferenceInputSchema,
  z.object({ operation: z.literal("models") }).strict(),
]);
export const companionJobResultSchema = z.union([
  z.object({ result: modelResultSchema }).strict(),
  z.object({ models: z.array(modelIdSchema).max(1000) }).strict(),
  z.object({ error: aiFailureCodeSchema }).strict(),
]);
export const companionClaimSchema = z
  .object({
    companionId: z.string().uuid(),
  })
  .strict();
export const companionLeaseSchema = z
  .object({
    companionId: z.string().uuid(),
    jobId: z.string().uuid(),
    lease: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const companionCompletionSchema = companionLeaseSchema
  .extend({
    output: companionJobResultSchema,
  })
  .strict();
export const companionJobSchema = z.object({
  id: z.string().uuid(),
  lease: z.string(),
  deadline: z.string(),
  input: companionJobInputSchema,
});
export const aiConnectionListSchema = z.object({
  connections: z.array(aiConnectionSummarySchema),
  companions: z.array(companionSummarySchema),
});
