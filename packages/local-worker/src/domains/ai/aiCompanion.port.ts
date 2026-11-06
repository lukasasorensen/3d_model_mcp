import type {
  CompanionJobInput,
  CompanionJobResult,
} from "@theoryfoundry/contracts";
export interface CompanionEndpoint {
  provider: "ollama" | "openai-compatible";
  endpoint: string;
  token?: string;
}
export interface LocalAiModels {
  execute(
    input: CompanionJobInput,
    signal: AbortSignal,
  ): Promise<CompanionJobResult>;
}
export interface CompanionApi {
  send(
    action: "register" | "claim" | "heartbeat" | "complete",
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
}
