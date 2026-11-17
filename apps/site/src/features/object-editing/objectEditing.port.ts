import type {
  CadMcpClient,
  ChatOrchestratorOptions,
} from "@theoryfoundry/gateway";

export interface ObjectEditingRuntime {
  client: CadMcpClient;
  browserRenderer: NonNullable<ChatOrchestratorOptions["browserRenderer"]>;
}

export interface ObjectEditingDependencies {
  authenticate(request: Request): Promise<{ id: string } | Response>;
  withRuntime<T>(
    ownerId: string,
    action: (runtime: ObjectEditingRuntime) => Promise<T>,
  ): Promise<T>;
}
