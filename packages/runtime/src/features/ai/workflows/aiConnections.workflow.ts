import { randomUUID } from "node:crypto";
import {
  AiConnectionError,
  type ChatRequest,
  type ModelResult,
} from "@theoryfoundry/contracts";
import type {
  CadChatProvider,
  ProviderConnection,
} from "@theoryfoundry/gateway";
import type {
  AiConnectionsStore,
  AiCompanionRelay,
} from "../../../domains/ai/index.js";
import { decryptAiCredential } from "../../../shared/utils/aiCredential.util.js";
import type { AiModels } from "../aiModels.port.js";

export class AiConnectionsWorkflow {
  constructor(
    private readonly store: AiConnectionsStore,
    private readonly relay: AiCompanionRelay,
    private readonly models: AiModels,
    private readonly publicFetch: (endpoint: string) => typeof fetch,
  ) {}
  private async resolve(
    owner: string,
    id: string | undefined,
    model: string | undefined,
    signal: AbortSignal,
    context?: { projectId: string; requestId: string },
  ): Promise<ProviderConnection> {
    const stored = await this.store.read(owner, id);
    const connection: ProviderConnection = {
      provider: stored.provider,
      model: model ?? stored.model,
    };
    if (stored.location === "local") {
      connection.invoke = async (input, callSignal): Promise<ModelResult> => {
        const output = await this.relay.execute(
          owner,
          stored,
          input,
          callSignal ? AbortSignal.any([signal, callSignal]) : signal,
          context,
        );
        if ("error" in output) throw new AiConnectionError(output.error);
        if (!("result" in output))
          throw new AiConnectionError("AI_PROVIDER_FAILURE");
        return output.result;
      };
    } else {
      if (!stored.credential) throw new AiConnectionError("AI_CONFIGURATION");
      connection.token = decryptAiCredential(
        stored.credential,
        owner,
        stored.id,
      );
      if (stored.endpoint) {
        connection.endpoint = stored.endpoint;
        connection.fetch = this.publicFetch(stored.endpoint);
      }
    }
    return connection;
  }
  async provider(
    owner: string,
    request: ChatRequest,
    signal: AbortSignal,
  ): Promise<CadChatProvider> {
    return this.models.provider(
      await this.resolve(owner, request.connectionId, request.model, signal, {
        projectId: request.projectId,
        requestId: randomUUID(),
      }),
    );
  }
  async test(
    owner: string,
    id: string,
    model: string | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    await this.models.test(
      await this.resolve(owner, id, model, signal),
      signal,
    );
  }
  async listModels(
    owner: string,
    id: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    const stored = await this.store.read(owner, id);
    if (stored.location === "local") {
      const output = await this.relay.execute(
        owner,
        stored,
        { operation: "models" },
        signal,
      );
      if ("error" in output) throw new AiConnectionError(output.error);
      if (!("models" in output))
        throw new AiConnectionError("AI_PROVIDER_FAILURE");
      return output.models;
    }
    return this.models.list(
      await this.resolve(owner, id, undefined, signal),
      signal,
    );
  }
}
