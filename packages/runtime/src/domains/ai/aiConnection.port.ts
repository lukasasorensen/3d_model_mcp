import type {
  AiConnectionInput,
  AiConnectionSummary,
  CompanionJobInput,
  CompanionJobResult,
  CompanionSummary,
} from "@theoryfoundry/contracts";

export interface StoredAiConnection extends AiConnectionInput {
  id: string;
  credential: string | null;
}
export interface AiConnectionsStore {
  list(ownerId: string): Promise<{
    connections: AiConnectionSummary[];
    companions: CompanionSummary[];
  }>;
  save(ownerId: string, input: AiConnectionInput, id?: string): Promise<string>;
  remove(ownerId: string, id: string): Promise<void>;
  read(ownerId: string, id?: string): Promise<StoredAiConnection>;
}
export interface AiCompanionRelay {
  execute(
    ownerId: string,
    connection: StoredAiConnection,
    input: CompanionJobInput,
    signal: AbortSignal,
    context?: { projectId: string; requestId: string },
  ): Promise<CompanionJobResult>;
}
