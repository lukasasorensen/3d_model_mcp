import type * as z from "zod/v4";
import type {
  aiConnectionInputSchema,
  aiConnectionSummarySchema,
  aiProviderSchema,
  companionJobInputSchema,
  companionJobResultSchema,
  companionSummarySchema,
  inferenceInputSchema,
  modelResultSchema,
  aiFailureCodeSchema,
} from "./aiConnection.schema.js";

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiConnectionInput = z.infer<typeof aiConnectionInputSchema>;
export type AiConnectionSummary = z.infer<typeof aiConnectionSummarySchema>;
export type CompanionSummary = z.infer<typeof companionSummarySchema>;
export type InferenceInput = z.infer<typeof inferenceInputSchema>;
export type ModelResult = z.infer<typeof modelResultSchema>;
export type CompanionJobInput = z.infer<typeof companionJobInputSchema>;
export type CompanionJobResult = z.infer<typeof companionJobResultSchema>;
export type AiFailureCode = z.infer<typeof aiFailureCodeSchema>;
