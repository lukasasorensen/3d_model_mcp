import {
  BaseChatModel,
  type BindToolsInput,
} from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import type { Runnable } from "@langchain/core/runnables";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import {
  AI_LIMITS,
  AiConnectionError,
  inferenceInputSchema,
  modelResultSchema,
} from "@theoryfoundry/contracts";
import type { ProviderConnection } from "../../../domains/models/index.js";

export class RelayChatModel extends BaseChatModel {
  private tools: BindToolsInput[] = [];
  constructor(private readonly connection: ProviderConnection) {
    super({ maxRetries: 0 });
  }
  _llmType(): string {
    return "theoryfoundry-companion";
  }
  override bindTools(tools: BindToolsInput[]): Runnable {
    const model = new RelayChatModel(this.connection);
    model.tools = [...tools];
    return model;
  }
  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
  ): Promise<ChatResult> {
    const input = inferenceInputSchema.parse({
      operation: "invoke",
      model: this.connection.model,
      messages: messages.map((message) => ({
        role: ToolMessage.isInstance(message)
          ? "tool"
          : AIMessage.isInstance(message)
            ? "assistant"
            : message.getType() === "system"
              ? "system"
              : "user",
        content:
          typeof message.content === "string"
            ? message.content
            : message.content
                .map((part) =>
                  typeof part === "string"
                    ? part
                    : "text" in part
                      ? String(part.text)
                      : "",
                )
                .join(""),
        ...(ToolMessage.isInstance(message)
          ? { toolCallId: message.tool_call_id }
          : {}),
        ...(AIMessage.isInstance(message) && message.tool_calls?.length
          ? {
              toolCalls: message.tool_calls.map(({ id, name, args }) => ({
                id: id ?? name,
                name,
                args,
              })),
            }
          : {}),
      })),
      tools: this.tools.map((tool) => {
        const fn = convertToOpenAITool(tool).function;
        return {
          name: fn.name,
          description: fn.description ?? "",
          parameters: fn.parameters,
        };
      }),
    });
    if (Buffer.byteLength(JSON.stringify(input)) > AI_LIMITS.invocationBytes)
      throw new AiConnectionError("AI_MODEL_UNSUPPORTED");
    const result = modelResultSchema.parse(
      await this.connection.invoke!(input, options.signal),
    );
    const message = new AIMessage({
      content: result.content,
      tool_calls: result.toolCalls.map((call) => ({
        ...call,
        type: "tool_call" as const,
      })),
    });
    return { generations: [{ text: result.content, message }] };
  }
}
