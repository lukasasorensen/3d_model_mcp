import type {
  ModelSourceDocument,
  ParameterControlsEvent,
} from "@theoryfoundry/contracts";
import type {
  CadMcpClient,
  ChatOrchestratorOptions,
} from "@theoryfoundry/gateway";

export interface WorkingModelRuntime {
  client: CadMcpClient;
  repository: {
    readModelSource(
      projectId: string,
      revision: string,
    ): Promise<ModelSourceDocument>;
  };
  browserRenderer: NonNullable<ChatOrchestratorOptions["browserRenderer"]>;
}

export interface WorkingModelDependencies {
  authenticate(request: Request): Promise<{ id: string } | Response>;
  withRuntime<T>(
    ownerId: string,
    action: (runtime: WorkingModelRuntime) => Promise<T>,
  ): Promise<T>;
}

export type WorkingModelEvent = ParameterControlsEvent extends infer Event
  ? Event extends { requestId: string }
    ? Omit<Event, "requestId" | "sessionId" | "sequence">
    : never
  : never;
