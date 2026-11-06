import { ChatOpenAI } from "@langchain/openai";
import { randomUUID } from "node:crypto";
import { ChatOllama } from "@langchain/ollama";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  AI_LIMITS,
  modelResultSchema,
  safeAiError,
  type CompanionJobInput,
  type CompanionJobResult,
  type InferenceInput,
} from "@theoryfoundry/contracts";
import type {
  CompanionEndpoint,
  LocalAiModels,
} from "../../domains/ai/index.js";

function messages(input: InferenceInput): BaseMessage[] {
  return input.messages.map((message) => {
    if (message.role === "tool")
      return new ToolMessage({
        content: message.content,
        tool_call_id: message.toolCallId ?? "",
      });
    if (message.role === "assistant")
      return new AIMessage({
        content: message.content,
        tool_calls: (message.toolCalls ?? []).map((call) => ({
          ...call,
          type: "tool_call" as const,
        })),
      });
    return message.role === "system"
      ? new SystemMessage(message.content)
      : new HumanMessage(message.content);
  });
}
export function createLocalAiModels(
  endpoint: CompanionEndpoint,
  request: typeof fetch = fetch,
): LocalAiModels {
  const localFetch: typeof fetch = async (input, init) => {
    const outbound = new Request(input, init);
    const url = new URL(outbound.url);
    if (url.origin !== new URL(endpoint.endpoint).origin)
      throw new Error("Invalid local endpoint.");
    if (!endpoint.token) outbound.headers.delete("authorization");
    return request(outbound, { redirect: "error" });
  };
  return {
    async execute(
      input: CompanionJobInput,
      signal: AbortSignal,
    ): Promise<CompanionJobResult> {
      try {
        if (input.operation === "models") {
          const url = new URL(
            endpoint.provider === "ollama"
              ? "/api/tags"
              : `${endpoint.endpoint.replace(/\/$/, "")}/models`,
            endpoint.endpoint,
          );
          const response = await localFetch(url, {
            signal,
            headers: endpoint.token
              ? { authorization: `Bearer ${endpoint.token}` }
              : {},
          });
          if (!response.ok) throw { status: response.status };
          const reader = response.body?.getReader();
          let text = "";
          let size = 0;
          const decoder = new TextDecoder();
          try {
            while (reader) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > AI_LIMITS.resultBytes) throw new Error();
              text += decoder.decode(part.value, { stream: true });
            }
          } finally {
            await reader?.cancel();
          }
          const raw = JSON.parse(text + decoder.decode()) as {
            models?: { name: string }[];
            data?: { id: string }[];
          };
          return {
            models:
              (endpoint.provider === "ollama"
                ? raw.models?.map((model) => model.name)
                : raw.data?.map((model) => model.id)
              )?.slice(0, 1000) ?? [],
          };
        }
        const model =
          endpoint.provider === "ollama"
            ? new ChatOllama({
                baseUrl: endpoint.endpoint,
                model: input.model,
                numPredict: AI_LIMITS.outputTokens,
                maxRetries: 0,
                fetch: localFetch,
                ...(endpoint.token
                  ? { headers: { authorization: `Bearer ${endpoint.token}` } }
                  : {}),
              })
            : new ChatOpenAI({
                model: input.model,
                apiKey: endpoint.token ?? "local-no-auth",
                maxTokens: AI_LIMITS.outputTokens,
                maxRetries: 0,
                streamUsage: false,
                configuration: {
                  baseURL: endpoint.endpoint,
                  fetch: localFetch,
                },
              });
        const bound = model.bindTools(
          input.tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        );
        const output = await bound.invoke(messages(input), { signal });
        const content =
          typeof output.content === "string"
            ? output.content
            : output.content
                .map((part) =>
                  typeof part === "string"
                    ? part
                    : "text" in part
                      ? String(part.text)
                      : "",
                )
                .join("");
        const result = modelResultSchema.parse({
          content: endpoint.token
            ? content.split(endpoint.token).join("[redacted]")
            : content,
          toolCalls: (output.tool_calls ?? []).map((call) => ({
            id: call.id ?? randomUUID(),
            name: call.name,
            args: call.args,
          })),
        });
        if (
          endpoint.token &&
          JSON.stringify(result.toolCalls).includes(endpoint.token)
        )
          throw new Error();
        if (Buffer.byteLength(JSON.stringify(result)) > AI_LIMITS.resultBytes)
          throw new Error();
        return { result };
      } catch (error) {
        return { error: safeAiError(error).code };
      }
    },
  };
}
