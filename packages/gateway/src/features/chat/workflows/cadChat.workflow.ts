import {
  CAD_LIMITS,
  CHAT_LIMITS,
  exportReceiptSchema,
  type ChatEvent,
  type ChatRequest,
  type MetricSample,
  type ObservabilityEnvelope,
} from "@theoryfoundry/contracts";
import {
  ToolCallLimitExceededError,
  createAgent,
  tool,
  toolCallLimitMiddleware,
} from "langchain";
import { randomUUID } from "node:crypto";

import type { CadMcpToolResult } from "../cadClient.port.js";
import { type CadChatProvider } from "../chatProvider.port.js";

import type { ChatOrchestratorOptions, EventDraft } from "../chat.types.js";
import { CAD_TOOL_NAMES, toolSpecs } from "../chatTools.metadata.js";
import { ChatEvents } from "../services/chatEvents.service.js";
import {
  messageText,
  safeAssistantText,
  safeCode,
  utf8Bytes,
  utf8Chunks,
} from "../utils/assistantText.util.js";
import { projectStructuredEvents } from "../utils/structuredEvents.util.js";
export async function* streamCadChat(
  request: ChatRequest,
  options: ChatOrchestratorOptions & { provider: CadChatProvider },
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const requestId = (options.createId ?? randomUUID)();
  const clock = options.clock ?? ((): Date => new Date());
  const observability = options.createObservabilitySink?.();
  const observe = (event: ObservabilityEnvelope): void | undefined =>
    observability?.record(event);
  const metric = (sample: MetricSample): void | undefined =>
    observability?.metric?.(sample);
  observe({
    version: "1",
    timestamp: clock().toISOString(),
    level: "info",
    service: "gateway",
    event: "agent.turn",
    requestId,
    conversationId: request.sessionId,
    outcome: "started",
  });
  let toolRounds = 0;
  let candidateProposals = 0;
  let assistantOutputBytes = 0;
  let terminal = false;
  let terminalFailure:
    | "MCP_FAILURE"
    | "REPAIR_LIMIT_EXCEEDED"
    | "TOOL_RESULT_TOO_LARGE"
    | undefined;
  const sensitiveValues = new Set<string>([request.message]);
  const queue = new ChatEvents(
    requestId,
    request.sessionId,
    clock,
    observability,
  );
  const emit = (draft: EventDraft): void => queue.emit(draft);

  const executionAbort = new AbortController();
  const timeout = AbortSignal.timeout(
    Math.min(
      options.timeoutMs ?? CHAT_LIMITS.requestTimeoutMs,
      CHAT_LIMITS.requestTimeoutMs,
    ),
  );
  const combinedSignal = AbortSignal.any(
    signal
      ? [signal, timeout, executionAbort.signal]
      : [timeout, executionAbort.signal],
  );

  const producer = (async (): Promise<void> => {
    try {
      let discovered: string[];
      try {
        discovered = [
          ...(await options.client.listTools({ signal: combinedSignal })),
        ].sort();
      } catch {
        terminalFailure = "MCP_FAILURE";
        executionAbort.abort();
        throw new Error("MCP_FAILURE");
      }
      const expected = [...CAD_TOOL_NAMES].sort();
      if (JSON.stringify(discovered) !== JSON.stringify(expected)) {
        terminalFailure = "MCP_FAILURE";
        executionAbort.abort();
        throw new Error("MCP_FAILURE");
      }
      const tools = toolSpecs.map((spec) =>
        tool(
          async (rawInput, config) => {
            toolRounds += 1;
            if (toolRounds > CHAT_LIMITS.maxToolRounds)
              throw new ToolCallLimitExceededError(
                0,
                toolRounds,
                undefined,
                CHAT_LIMITS.maxToolRounds,
              );
            void config.toolCall;
            const toolCallId = `${requestId}-t${toolRounds}`;
            if (spec.name === "propose_model_source") {
              candidateProposals += 1;
              if (candidateProposals > CHAT_LIMITS.maxRepairAttempts + 1) {
                terminalFailure = "REPAIR_LIMIT_EXCEEDED";
                executionAbort.abort();
                throw new Error("REPAIR_LIMIT_EXCEEDED");
              }
            }
            const input: Record<string, unknown> = {
              ...(rawInput as Record<string, unknown>),
              projectId: request.projectId,
            };
            if (typeof input.source === "string")
              sensitiveValues.add(input.source);
            if (
              spec.name === "propose_model_source" ||
              spec.name === "restore_revision"
            )
              Object.assign(input, { requestId, toolCallId });
            emit({
              type: "tool_start",
              tool: spec.name,
              toolCallId,
              round: toolRounds,
            });
            let result: CadMcpToolResult;
            const toolStarted = performance.now();
            let unsubscribe: (() => void) | undefined;
            try {
              if (
                spec.name === "validate_and_render" &&
                typeof input.candidateId === "string" &&
                options.browserRenderer
              ) {
                unsubscribe = options.browserRenderer.subscribe(
                  input.candidateId,
                  request.sessionId,
                  (renderRequest) =>
                    emit({
                      type: "browser_render_request",
                      toolCallId,
                      ...renderRequest,
                    }),
                );
              }
              result = await options.client.callTool(spec.name, input, {
                signal: combinedSignal,
              });
            } catch {
              if (spec.name === "validate_and_render")
                metric({
                  name: "render_duration_ms",
                  value: Math.min(
                    performance.now() - toolStarted,
                    CHAT_LIMITS.requestTimeoutMs,
                  ),
                  labels: {
                    service: "gateway",
                    operation: "validate_and_render",
                    outcome: "failure",
                    diagnosticCode: "MCP_FAILURE",
                  },
                });
              emit({
                type: "tool_result",
                tool: spec.name,
                toolCallId,
                outcome: "error",
                code: "MCP_FAILURE",
              });
              if (!terminalFailure) terminalFailure = "MCP_FAILURE";
              throw new Error("MCP_FAILURE");
            } finally {
              unsubscribe?.();
            }
            if (result.isError || !result.structuredContent) {
              const code = safeCode(result.error?.code);
              if (spec.name === "validate_and_render")
                metric({
                  name: "render_duration_ms",
                  value: Math.min(
                    performance.now() - toolStarted,
                    CHAT_LIMITS.requestTimeoutMs,
                  ),
                  labels: {
                    service: "gateway",
                    operation: "validate_and_render",
                    outcome: "failure",
                    diagnosticCode: code,
                  },
                });
              emit({
                type: "tool_result",
                tool: spec.name,
                toolCallId,
                outcome: "error",
                code,
              });
              emit({
                type: "error",
                code:
                  code === "RENDER_FAILED"
                    ? "RENDERER_FAILURE"
                    : "CAD_TOOL_REJECTED",
                message:
                  code === "RENDER_FAILED"
                    ? "The renderer rejected the candidate safely."
                    : "The CAD tool rejected the request safely.",
                recoverable: true,
                toolCallId,
              });
              return JSON.stringify({
                error: {
                  code,
                  message: "The CAD tool rejected the request safely.",
                },
              });
            }
            let serialized: string;
            try {
              serialized = JSON.stringify(result.structuredContent);
            } catch {
              terminalFailure = "MCP_FAILURE";
              executionAbort.abort();
              throw new Error("MCP_FAILURE");
            }
            if (utf8Bytes(serialized) > CAD_LIMITS.toolResultBytes) {
              emit({
                type: "tool_result",
                tool: spec.name,
                toolCallId,
                outcome: "error",
                code: "ARTIFACT_LIMIT_EXCEEDED",
              });
              terminalFailure = "TOOL_RESULT_TOO_LARGE";
              executionAbort.abort();
              throw new Error("TOOL_RESULT_TOO_LARGE");
            }
            emit({
              type: "tool_result",
              tool: spec.name,
              toolCallId,
              outcome: "success",
            });
            if (spec.name === "validate_and_render") {
              const rejected =
                (
                  result.structuredContent.candidate as
                    { state?: unknown } | undefined
                )?.state === "REJECTED";
              metric({
                name: "render_duration_ms",
                value: Math.min(
                  performance.now() - toolStarted,
                  CHAT_LIMITS.requestTimeoutMs,
                ),
                labels: {
                  service: "gateway",
                  operation: "validate_and_render",
                  outcome: rejected ? "failure" : "success",
                  ...(rejected ? { diagnosticCode: "INVALID_CANDIDATE" } : {}),
                },
              });
            }
            if (spec.name === "restore_revision")
              metric({
                name: "recovery_action_count",
                value: 1,
                labels: {
                  service: "gateway",
                  operation: "restore_revision",
                  outcome: "success",
                },
              });
            const metricArtifacts = [
              ...((
                result.structuredContent.candidate as
                  { artifacts?: unknown[] } | undefined
              )?.artifacts ?? []),
              ...((
                result.structuredContent.revision as
                  { artifacts?: unknown[] } | undefined
              )?.artifacts ?? []),
              ...((
                result.structuredContent.state as
                  { artifacts?: unknown[] } | undefined
              )?.artifacts ?? []),
              ...(result.structuredContent.artifact
                ? [result.structuredContent.artifact]
                : []),
            ];
            for (const rawArtifact of metricArtifacts) {
              const triangleCount = (
                rawArtifact as { triangleCount?: unknown } | undefined
              )?.triangleCount;
              if (
                typeof triangleCount === "number" &&
                Number.isInteger(triangleCount) &&
                triangleCount >= 0 &&
                triangleCount <= CAD_LIMITS.previewTriangles
              )
                metric({
                  name: "artifact_triangles",
                  value: triangleCount,
                  labels: {
                    service: "gateway",
                    operation: "artifact",
                    outcome: "success",
                  },
                });
            }
            const modelSource = (
              result.structuredContent.model as { source?: unknown } | undefined
            )?.source;
            if (typeof modelSource === "string")
              sensitiveValues.add(modelSource);
            if (spec.name === "export_model") {
              const receipt = exportReceiptSchema.parse(
                result.structuredContent.export,
              );
              sensitiveValues.add(receipt.downloadUrl);
              emit({ type: "export_ready", export: receipt });
            }
            projectStructuredEvents(
              spec.name,
              toolCallId,
              result.structuredContent,
              emit,
            );
            return serialized;
          },
          {
            name: spec.name,
            description: spec.description,
            schema: spec.schema,
          },
        ),
      );

      const provider = options.provider;
      const agent = createAgent({
        model: provider.createModel(request, requestId),
        tools,
        systemPrompt:
          "Operate only through the supplied project-scoped CAD tools. Never claim a revision or artifact from prose. Use the authoritative IDs returned by tools.",
        middleware: [
          toolCallLimitMiddleware({
            runLimit: CHAT_LIMITS.maxToolRounds,
            exitBehavior: "error",
          }),
        ],
      });
      const run = await agent.streamEvents(
        { messages: [{ role: "user", content: request.message }] },
        { version: "v3", signal: combinedSignal },
      );
      const outputPromise = Promise.resolve(run.output);
      void outputPromise.catch(() => undefined);
      const protocolDrain = (async (): Promise<void> => {
        for await (const event of run) void event;
      })();
      void protocolDrain.catch(() => undefined);
      const toolDrain = (async (): Promise<void> => {
        for await (const call of run.toolCalls) {
          await Promise.allSettled([call.output, call.status, call.error]);
        }
      })();
      void toolDrain.catch(() => undefined);
      for await (const message of run.messages) {
        const output = await message.output;
        if ((output.tool_calls?.length ?? 0) === 0) {
          const remaining =
            CHAT_LIMITS.assistantOutputCharacters - assistantOutputBytes;
          const text = safeAssistantText(
            messageText(output.content),
            sensitiveValues,
            Math.max(0, remaining),
          );
          assistantOutputBytes += utf8Bytes(text);
          for (const delta of utf8Chunks(
            text,
            CHAT_LIMITS.assistantDeltaCharacters,
          ))
            emit({ type: "assistant_delta", delta });
        }
      }
      await Promise.all([outputPromise, protocolDrain, toolDrain]);
      emit({ type: "done", outcome: "completed", toolRounds });
      terminal = true;
    } catch (error) {
      const isToolLimit =
        toolRounds === CHAT_LIMITS.maxToolRounds ||
        error instanceof ToolCallLimitExceededError ||
        (error instanceof Error &&
          (error.name === "ToolCallLimitExceededError" ||
            /tool call limit/i.test(error.message)));
      let code:
        | "CANCELLED"
        | "REQUEST_TIMEOUT"
        | "TOOL_LIMIT_EXCEEDED"
        | "REPAIR_LIMIT_EXCEEDED"
        | "TOOL_RESULT_TOO_LARGE"
        | "MCP_FAILURE"
        | "PROVIDER_FAILURE";
      if (signal?.aborted) code = "CANCELLED";
      else if (terminalFailure) code = terminalFailure;
      else if (timeout.aborted) code = "REQUEST_TIMEOUT";
      else if (isToolLimit) code = "TOOL_LIMIT_EXCEEDED";
      else if (
        error instanceof Error &&
        error.message === "REPAIR_LIMIT_EXCEEDED"
      )
        code = "REPAIR_LIMIT_EXCEEDED";
      else if (error instanceof Error && error.message === "MCP_FAILURE")
        code = "MCP_FAILURE";
      else code = "PROVIDER_FAILURE";

      let message: string;
      switch (code) {
        case "CANCELLED":
          message = "The request was cancelled.";
          break;
        case "REQUEST_TIMEOUT":
          message = "The request exceeded its time limit.";
          break;
        case "TOOL_LIMIT_EXCEEDED":
          message = "The CAD tool-call limit was reached.";
          break;
        case "REPAIR_LIMIT_EXCEEDED":
          message = "The candidate repair limit was reached.";
          break;
        case "TOOL_RESULT_TOO_LARGE":
          message = "The CAD tool result exceeded its safe size limit.";
          break;
        case "MCP_FAILURE":
          message = "The CAD service is temporarily unavailable.";
          break;
        case "PROVIDER_FAILURE":
          message = "The chat provider failed safely.";
          break;
      }
      emit({ type: "error", code, message, recoverable: code !== "CANCELLED" });
      emit({
        type: "done",
        outcome: code === "CANCELLED" ? "cancelled" : "failed",
        toolRounds: Math.min(toolRounds, CHAT_LIMITS.maxToolRounds),
      });
      terminal = true;
    } finally {
      if (!terminal)
        emit({
          type: "done",
          outcome: "failed",
          toolRounds: Math.min(toolRounds, CHAT_LIMITS.maxToolRounds),
        });
      queue.end();
    }
  })();

  while (true) {
    const event = await queue.next();
    if (!event) break;
    yield event;
  }
  await producer;
}
