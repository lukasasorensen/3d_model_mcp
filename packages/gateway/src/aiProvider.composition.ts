import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AiConnectionError, safeAiError } from "@theoryfoundry/contracts";
import {
  createHostedModel,
  RelayChatModel,
  type CadChatProvider,
} from "./features/chat/index.js";
import type { ProviderConnection } from "./domains/models/index.js";

export function createConnectionProvider(
  connection: ProviderConnection,
): CadChatProvider {
  return {
    id: connection.provider,
    redactText: (value) =>
      connection.token
        ? value.split(connection.token).join("[redacted]")
        : value,
    createModel: () => createConnectionModel(connection),
  };
}
export function createConnectionModel(
  connection: ProviderConnection,
): BaseChatModel {
  return connection.invoke
    ? new RelayChatModel(connection)
    : createHostedModel(connection);
}
export async function testConnectionProvider(
  connection: ProviderConnection,
  signal: AbortSignal,
): Promise<void> {
  try {
    const model = createConnectionModel(connection);
    const bound = model.bindTools?.([
      {
        type: "function",
        function: {
          name: "connection_check",
          description: "Verify the connection by returning the supplied code.",
          parameters: {
            type: "object",
            properties: { code: { type: "string", enum: ["ready"] } },
            required: ["code"],
            additionalProperties: false,
          },
        },
      },
    ]);
    if (!bound) throw new AiConnectionError("AI_MODEL_UNSUPPORTED");
    const output: unknown = await bound.invoke(
      "Call connection_check with code ready. Do not answer in prose.",
      { signal },
    );
    if (
      !output ||
      typeof output !== "object" ||
      !("tool_calls" in output) ||
      !Array.isArray(output.tool_calls) ||
      !output.tool_calls.some(
        (call: { name?: string; args?: { code?: unknown } }) =>
          call.name === "connection_check" && call.args?.code === "ready",
      )
    )
      throw new AiConnectionError("AI_MODEL_UNSUPPORTED");
  } catch (error) {
    throw safeAiError(error);
  }
}
