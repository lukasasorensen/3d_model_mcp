import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogle } from "@langchain/google";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AI_LIMITS, AiConnectionError } from "@theoryfoundry/contracts";
import type { ProviderConnection } from "../../../domains/models/index.js";

export function createHostedModel(
  connection: ProviderConnection,
): BaseChatModel {
  if (!connection.token) throw new AiConnectionError("AI_CONFIGURATION");
  const common = {
    model: connection.model,
    apiKey: connection.token,
    maxRetries: 0,
    maxTokens: AI_LIMITS.outputTokens,
  };
  switch (connection.provider) {
    case "anthropic":
      return new ChatAnthropic({
        ...common,
        clientOptions: {
          baseURL: "https://api.anthropic.com",
          ...(connection.fetch ? { fetch: connection.fetch } : {}),
        },
      });
    case "google":
      return new ChatGoogle({
        ...common,
        maxOutputTokens: AI_LIMITS.outputTokens,
        apiClient: {
          hasApiKey: () => true,
          getProjectId: async (): Promise<string> => {
            throw new AiConnectionError("AI_CONFIGURATION");
          },
          fetch: async (request): Promise<Response> => {
            if (
              new URL(request.url).hostname !==
              "generativelanguage.googleapis.com"
            )
              throw new AiConnectionError("AI_CONFIGURATION");
            request.headers.set("x-goog-api-key", connection.token!);
            return (connection.fetch ?? fetch)(request, { redirect: "error" });
          },
        },
      });
    case "openai":
    case "openai-compatible":
      return new ChatOpenAI({
        ...common,
        streamUsage: connection.provider === "openai",
        configuration: {
          baseURL:
            connection.provider === "openai"
              ? "https://api.openai.com/v1"
              : connection.endpoint,
          ...(connection.fetch ? { fetch: connection.fetch } : {}),
        },
      });
    default:
      throw new AiConnectionError("AI_CONFIGURATION");
  }
}
