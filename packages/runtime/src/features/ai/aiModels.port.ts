import type {
  CadChatProvider,
  ProviderConnection,
} from "@theoryfoundry/gateway";
export interface AiModels {
  provider(connection: ProviderConnection): CadChatProvider;
  test(connection: ProviderConnection, signal: AbortSignal): Promise<void>;
  list(connection: ProviderConnection, signal: AbortSignal): Promise<string[]>;
}
