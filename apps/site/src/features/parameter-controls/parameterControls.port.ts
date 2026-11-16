import type {
  CadMcpClient,
  ChatOrchestratorOptions,
} from "@theoryfoundry/gateway";

export interface ParameterControlsRuntime {
  client: CadMcpClient;
  browserRenderer: NonNullable<ChatOrchestratorOptions["browserRenderer"]>;
}

export interface ParameterControlsDependencies {
  authenticate(request: Request): Promise<{ id: string } | Response>;
  withRuntime<T>(
    ownerId: string,
    action: (runtime: ParameterControlsRuntime) => Promise<T>,
  ): Promise<T>;
}
