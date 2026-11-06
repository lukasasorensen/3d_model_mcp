import type {
  AiProvider,
  InferenceInput,
  ModelResult,
} from "@theoryfoundry/contracts";

export interface ProviderConnection {
  provider: AiProvider;
  model: string;
  token?: string;
  endpoint?: string;
  fetch?: typeof fetch;
  invoke?: (
    input: InferenceInput,
    signal?: AbortSignal,
  ) => Promise<ModelResult>;
}
