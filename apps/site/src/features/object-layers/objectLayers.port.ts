import type {
  CadMcpClient,
  ChatOrchestratorOptions,
} from "@theoryfoundry/gateway";

export interface ObjectLayersRuntime {
  client: CadMcpClient;
  browserRenderer: NonNullable<ChatOrchestratorOptions["browserRenderer"]>;
}

export interface ObjectLayersDependencies {
  authenticate(request: Request): Promise<{ id: string } | Response>;
  withRuntime<T>(
    ownerId: string,
    action: (runtime: ObjectLayersRuntime) => Promise<T>,
  ): Promise<T>;
}
