import { randomUUID } from "node:crypto";
import {
  CHAT_LIMITS,
  BROWSER_RENDERER,
  CAD_LIMITS,
  artifactManifestSchema,
  chatEventSchema,
  exportModelInputSchema,
  getProjectStateInputSchema,
  listRevisionsInputSchema,
  promoteCandidateInputSchema,
  proposeModelSourceInputSchema,
  readModelSourceInputSchema,
  restoreRevisionInputSchema,
  validateAndRenderInputSchema,
  type ChatEvent,
  type ChatRequest,
  type MetricSample,
  type ObservabilityEnvelope,
} from "@rjls/contracts";
import type { CadToolName } from "@rjls/mcp";
import { ToolCallLimitExceededError, createAgent, tool, toolCallLimitMiddleware } from "langchain";
import type * as z from "zod/v4";

import type { CadMcpClient, CadMcpToolResult } from "./cad-client.js";
import { DeterministicMockCadProvider, type CadChatProvider } from "./provider.js";

export const CAD_TOOL_NAMES = [
  "get_project_state", "read_model_source", "propose_model_source", "validate_and_render",
  "promote_candidate", "export_model", "list_revisions", "restore_revision",
] as const satisfies readonly CadToolName[];

type EventDraft = ChatEvent extends infer Event ? Event extends ChatEvent ? Omit<Event, "version" | "requestId" | "sessionId" | "sequence" | "timestamp"> : never : never;

class EventQueue {
  private values: ChatEvent[] = [];
  private waiting: Array<(event: ChatEvent | undefined) => void> = [];
  private ended = false;
  push(event: ChatEvent): void {
    const wake = this.waiting.shift();
    if (wake) wake(event);
    else this.values.push(event);
  }
  end(): void { this.ended = true; for (const wake of this.waiting.splice(0)) wake(undefined); }
  async next(): Promise<ChatEvent | undefined> {
    const value = this.values.shift();
    if (value) return value;
    if (this.ended) return undefined;
    return new Promise((resolve) => this.waiting.push(resolve));
  }
}

function safeCode(value: unknown): string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : "MCP_FAILURE";
}

function safeAssistantText(value: string, sensitiveValues: ReadonlySet<string>, maxBytes: number): string {
  let safe = value;
  for (const sensitive of sensitiveValues) if (sensitive.length >= 4) safe = safe.split(sensitive).join("[redacted]");
  safe = safe
    .replace(/(?:\/Users|\/home|\/private|\/tmp|\/var)\/[\w./-]+/g, "[redacted-path]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g, "[redacted-token]");
  return truncateUtf8(safe, maxBytes);
}

function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function utf8Chunks(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8Bytes(character);
    if (chunk && bytes + characterBytes > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += characterBytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") return part.text;
    return "";
  }).join("");
}

function projectStructuredEvents(toolName: CadToolName, toolCallId: string, result: Record<string, unknown>, emit: (draft: EventDraft) => void): void {
  const candidate = result.candidate as { candidateId?: string; state?: string } | undefined;
  if (candidate?.candidateId) {
    let status: "candidate_created" | "candidate_validated" | "candidate_rejected" | undefined;
    if (candidate.state === "CREATED") status = "candidate_created";
    else if (candidate.state === "VALID") status = "candidate_validated";
    else if (candidate.state === "REJECTED") status = "candidate_rejected";
    if (status) emit({ type: "revision", status, toolCallId, candidateId: candidate.candidateId });
  }
  const revision = result.revision as { revisionId?: string; candidateId?: string; artifacts?: unknown[] } | undefined;
  if (revision?.revisionId) {
    emit({ type: "revision", status: toolName === "promote_candidate" ? "candidate_promoted" : "current", toolCallId, revisionId: revision.revisionId, candidateId: revision.candidateId });
    for (const raw of revision.artifacts ?? []) {
      const parsed = artifactManifestSchema.safeParse(raw);
      if (parsed.success) emit({ type: "artifact", toolCallId, artifactId: parsed.data.artifactId, revisionId: parsed.data.sourceRevision, format: parsed.data.format, mimeType: parsed.data.mimeType, hash: parsed.data.hash, byteSize: parsed.data.byteSize });
    }
  }
  const state = result.state as { currentRevision?: string | null; artifacts?: unknown[] } | undefined;
  if (state?.currentRevision) {
    emit({ type: "revision", status: "current", toolCallId, revisionId: state.currentRevision });
    for (const raw of state.artifacts ?? []) {
      const parsed = artifactManifestSchema.safeParse(raw);
      if (parsed.success) emit({ type: "artifact", toolCallId, artifactId: parsed.data.artifactId, revisionId: parsed.data.sourceRevision, format: parsed.data.format, mimeType: parsed.data.mimeType, hash: parsed.data.hash, byteSize: parsed.data.byteSize });
    }
  }
  const artifact = artifactManifestSchema.safeParse(result.artifact);
  if (artifact.success) emit({ type: "artifact", toolCallId, artifactId: artifact.data.artifactId, revisionId: artifact.data.sourceRevision, format: artifact.data.format, mimeType: artifact.data.mimeType, hash: artifact.data.hash, byteSize: artifact.data.byteSize });
}

const toolSpecs = [
  { name: "get_project_state", description: "Inspect authoritative current CAD state.", schema: getProjectStateInputSchema },
  { name: "read_model_source", description: "Read canonical source for a revision.", schema: readModelSourceInputSchema },
  { name: "propose_model_source", description: "Propose bounded OpenSCAD source against a parent revision.", schema: proposeModelSourceInputSchema.omit({ requestId: true, toolCallId: true }) },
  { name: "validate_and_render", description: "Validate and render a candidate using the standard profile.", schema: validateAndRenderInputSchema },
  { name: "promote_candidate", description: "Atomically promote a valid candidate.", schema: promoteCandidateInputSchema },
  { name: "export_model", description: "Authorize browser-side 3MF generation for the current revision.", schema: exportModelInputSchema },
  { name: "list_revisions", description: "List authoritative revision history.", schema: listRevisionsInputSchema },
  { name: "restore_revision", description: "Restore a historical revision as a new current child.", schema: restoreRevisionInputSchema.omit({ requestId: true, toolCallId: true }) },
] as const satisfies ReadonlyArray<{ name: CadToolName; description: string; schema: z.ZodType }>;

export interface ChatOrchestratorOptions {
  client: CadMcpClient;
  provider?: CadChatProvider;
  createId?: () => string;
  clock?: () => Date;
  timeoutMs?: number;
  createObservabilitySink?: () => { record(event: ObservabilityEnvelope): void; metric?(sample: MetricSample): void };
  browserRenderer?: {
    subscribe(candidateId: string, sessionId: string, callback: (request: {
      jobId: string; token: string; purpose: "candidate"; candidateId: string; source: string;
      sourceHash: string; format: "stl"; deadline: string;
    }) => void): () => void;
  };
}

export async function* streamCadChat(request: ChatRequest, options: ChatOrchestratorOptions, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const requestId = (options.createId ?? randomUUID)();
  const clock = options.clock ?? (() => new Date());
  const observability = options.createObservabilitySink?.();
  const observe = (event: ObservabilityEnvelope) => observability?.record(event);
  const metric = (sample: MetricSample) => observability?.metric?.(sample);
  observe({ version: "1", timestamp: clock().toISOString(), level: "info", service: "gateway", event: "agent.turn", requestId, conversationId: request.sessionId, outcome: "started" });
  let sequence = 0;
  let toolRounds = 0;
  let candidateProposals = 0;
  let assistantOutputBytes = 0;
  let terminal = false;
  let terminalDiagnosticCode: string | undefined;
  let terminalFailure: "MCP_FAILURE" | "REPAIR_LIMIT_EXCEEDED" | "TOOL_RESULT_TOO_LARGE" | undefined;
  const sensitiveValues = new Set<string>([request.message]);
  const queue = new EventQueue();
  const emit = (draft: EventDraft) => {
    const event = chatEventSchema.parse({ ...draft, version: "3", requestId, sessionId: request.sessionId, sequence: sequence++, timestamp: clock().toISOString() });
    queue.push(event);
    const outcome = event.type === "done"
      ? event.outcome === "completed" ? "success" : event.outcome === "cancelled" ? "cancelled" : "failure"
      : event.type === "error" || (event.type === "tool_result" && event.outcome === "error") ? "failure" : "success";
    observe({
      version: "1", timestamp: event.timestamp, level: outcome === "failure" ? "error" : "info", service: "gateway",
      event: `chat.${event.type}`, requestId: event.requestId, conversationId: event.sessionId, outcome,
      ...("toolCallId" in event ? { toolCallId: event.toolCallId } : {}),
      ...("candidateId" in event && event.candidateId ? { candidateId: event.candidateId } : {}),
      ...("revisionId" in event && event.revisionId ? { revisionId: event.revisionId } : {}),
      ...("artifactId" in event ? { artifactId: event.artifactId } : {}),
      ...(event.type === "error" || (event.type === "tool_result" && event.outcome === "error") ? { diagnosticCode: event.code } : {}),
    });
    if (event.type === "error") terminalDiagnosticCode = event.code;
    if (event.type === "revision" && event.status === "candidate_rejected") metric({ name: "invalid_candidate_count", value: 1, labels: { service: "gateway", operation: "validate_and_render", outcome: "failure", diagnosticCode: "INVALID_CANDIDATE" } });
    if (event.type === "tool_result" && event.outcome === "error" && event.code === "STALE_REVISION") metric({ name: "promotion_conflict_count", value: 1, labels: { service: "gateway", operation: "promote_candidate", outcome: "failure", diagnosticCode: "STALE_REVISION" } });
    if (event.type === "artifact") metric({ name: "artifact_bytes", value: event.byteSize, labels: { service: "gateway", operation: "artifact", outcome: "success" } });
    if (event.type === "done") {
      const terminalOutcome = event.outcome === "completed" ? "success" : event.outcome === "cancelled" ? "cancelled" : "failure";
      metric({ name: "request_count", value: 1, labels: { service: "gateway", operation: "chat", outcome: terminalOutcome, ...(terminalDiagnosticCode ? { diagnosticCode: terminalDiagnosticCode } : {}) } });
      metric({ name: "tool_rounds", value: event.toolRounds, labels: { service: "gateway", operation: "chat", outcome: terminalOutcome, ...(terminalDiagnosticCode ? { diagnosticCode: terminalDiagnosticCode } : {}) } });
      if (event.outcome === "failed") metric({ name: "request_failure", value: 1, labels: { service: "gateway", operation: "chat", outcome: "failure", ...(terminalDiagnosticCode ? { diagnosticCode: terminalDiagnosticCode } : {}) } });
      if (terminalDiagnosticCode === "REQUEST_TIMEOUT") metric({ name: "timeout_count", value: 1, labels: { service: "gateway", operation: "chat", outcome: "failure", diagnosticCode: "REQUEST_TIMEOUT" } });
      if (terminalDiagnosticCode === "CANCELLED") metric({ name: "cancel_count", value: 1, labels: { service: "gateway", operation: "chat", outcome: "cancelled", diagnosticCode: "CANCELLED" } });
    }
    if (event.type === "revision" && (event.status === "candidate_validated" || event.status === "candidate_rejected") && event.candidateId) {
      observe({
        version: "1", timestamp: event.timestamp, level: event.status === "candidate_validated" ? "info" : "error", service: "renderer",
        event: "render.completed", requestId: event.requestId, conversationId: event.sessionId, toolCallId: event.toolCallId,
        jobId: `${event.candidateId}-render`, candidateId: event.candidateId,
        outcome: event.status === "candidate_validated" ? "success" : "failure",
      });
    }
  };
  const executionAbort = new AbortController();
  const timeout = AbortSignal.timeout(Math.min(options.timeoutMs ?? CHAT_LIMITS.requestTimeoutMs, CHAT_LIMITS.requestTimeoutMs));
  const combinedSignal = AbortSignal.any(signal ? [signal, timeout, executionAbort.signal] : [timeout, executionAbort.signal]);

  const producer = (async () => {
    try {
      let discovered: string[];
      try { discovered = [...await options.client.listTools({ signal: combinedSignal })].sort(); }
      catch { terminalFailure = "MCP_FAILURE"; executionAbort.abort(); throw new Error("MCP_FAILURE"); }
      const expected = [...CAD_TOOL_NAMES].sort();
      if (JSON.stringify(discovered) !== JSON.stringify(expected)) {
        terminalFailure = "MCP_FAILURE";
        executionAbort.abort();
        throw new Error("MCP_FAILURE");
      }
      const tools = toolSpecs.map((spec) => tool(async (rawInput, config) => {
        toolRounds += 1;
        if (toolRounds > CHAT_LIMITS.maxToolRounds) throw new ToolCallLimitExceededError(0, toolRounds, undefined, CHAT_LIMITS.maxToolRounds);
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
        const input: Record<string, unknown> = { ...(rawInput as Record<string, unknown>), projectId: request.projectId };
        if (typeof input.source === "string") sensitiveValues.add(input.source);
        if (spec.name === "propose_model_source" || spec.name === "restore_revision") Object.assign(input, { requestId, toolCallId });
        emit({ type: "tool_start", tool: spec.name, toolCallId, round: toolRounds });
        let result: CadMcpToolResult;
        const toolStarted = performance.now();
        let unsubscribe: (() => void) | undefined;
        try {
          if (spec.name === "validate_and_render" && typeof input.candidateId === "string" && options.browserRenderer) {
            unsubscribe = options.browserRenderer.subscribe(input.candidateId, request.sessionId, (renderRequest) => emit({
              type: "browser_render_request",
              toolCallId,
              ...renderRequest,
            }));
          }
          result = await options.client.callTool(spec.name, input, { signal: combinedSignal });
        } catch {
          if (spec.name === "validate_and_render") metric({ name: "render_duration_ms", value: Math.min(performance.now() - toolStarted, CHAT_LIMITS.requestTimeoutMs), labels: { service: "gateway", operation: "validate_and_render", outcome: "failure", diagnosticCode: "MCP_FAILURE" } });
          emit({ type: "tool_result", tool: spec.name, toolCallId, outcome: "error", code: "MCP_FAILURE" });
          if (!terminalFailure) terminalFailure = "MCP_FAILURE";
          throw new Error("MCP_FAILURE");
        } finally {
          unsubscribe?.();
        }
        if (result.isError || !result.structuredContent) {
          const code = safeCode(result.error?.code);
          if (spec.name === "validate_and_render") metric({ name: "render_duration_ms", value: Math.min(performance.now() - toolStarted, CHAT_LIMITS.requestTimeoutMs), labels: { service: "gateway", operation: "validate_and_render", outcome: "failure", diagnosticCode: code } });
          emit({ type: "tool_result", tool: spec.name, toolCallId, outcome: "error", code });
          emit({ type: "error", code: code === "RENDER_FAILED" ? "RENDERER_FAILURE" : "CAD_TOOL_REJECTED", message: code === "RENDER_FAILED" ? "The renderer rejected the candidate safely." : "The CAD tool rejected the request safely.", recoverable: true, toolCallId });
          return JSON.stringify({ error: { code, message: "The CAD tool rejected the request safely." } });
        }
        let serialized: string;
        try { serialized = JSON.stringify(result.structuredContent); }
        catch { terminalFailure = "MCP_FAILURE"; executionAbort.abort(); throw new Error("MCP_FAILURE"); }
        if (utf8Bytes(serialized) > CAD_LIMITS.toolResultBytes) {
          emit({ type: "tool_result", tool: spec.name, toolCallId, outcome: "error", code: "ARTIFACT_LIMIT_EXCEEDED" });
          terminalFailure = "TOOL_RESULT_TOO_LARGE";
          executionAbort.abort();
          throw new Error("TOOL_RESULT_TOO_LARGE");
        }
        emit({ type: "tool_result", tool: spec.name, toolCallId, outcome: "success" });
        if (spec.name === "validate_and_render") {
          const rejected = (result.structuredContent.candidate as { state?: unknown } | undefined)?.state === "REJECTED";
          metric({ name: "render_duration_ms", value: Math.min(performance.now() - toolStarted, CHAT_LIMITS.requestTimeoutMs), labels: { service: "gateway", operation: "validate_and_render", outcome: rejected ? "failure" : "success", ...(rejected ? { diagnosticCode: "INVALID_CANDIDATE" } : {}) } });
        }
        if (spec.name === "restore_revision") metric({ name: "recovery_action_count", value: 1, labels: { service: "gateway", operation: "restore_revision", outcome: "success" } });
        const metricArtifacts = [
          ...(((result.structuredContent.candidate as { artifacts?: unknown[] } | undefined)?.artifacts) ?? []),
          ...(((result.structuredContent.revision as { artifacts?: unknown[] } | undefined)?.artifacts) ?? []),
          ...(((result.structuredContent.state as { artifacts?: unknown[] } | undefined)?.artifacts) ?? []),
          ...(result.structuredContent.artifact ? [result.structuredContent.artifact] : []),
        ];
        for (const rawArtifact of metricArtifacts) {
          const triangleCount = (rawArtifact as { triangleCount?: unknown } | undefined)?.triangleCount;
          if (typeof triangleCount === "number" && Number.isInteger(triangleCount) && triangleCount >= 0 && triangleCount <= CAD_LIMITS.previewTriangles) metric({ name: "artifact_triangles", value: triangleCount, labels: { service: "gateway", operation: "artifact", outcome: "success" } });
        }
        const modelSource = (result.structuredContent.model as { source?: unknown } | undefined)?.source;
        if (typeof modelSource === "string") sensitiveValues.add(modelSource);
        const exportRequest = result.structuredContent.export as { revision?: unknown; source?: unknown; sourceHash?: unknown; format?: unknown } | undefined;
        if (spec.name === "export_model" && typeof exportRequest?.revision === "string" && typeof exportRequest.source === "string" && typeof exportRequest.sourceHash === "string" && exportRequest.format === "3mf") {
          sensitiveValues.add(exportRequest.source);
          emit({
            type: "browser_render_request",
            toolCallId,
            jobId: `${toolCallId}-export`,
            token: `${randomUUID()}${randomUUID()}`.replaceAll("-", ""),
            purpose: "export",
            revisionId: exportRequest.revision,
            source: exportRequest.source,
            sourceHash: exportRequest.sourceHash,
            format: "3mf",
            deadline: new Date(clock().getTime() + BROWSER_RENDERER.timeoutMs).toISOString(),
          });
        }
        projectStructuredEvents(spec.name, toolCallId, result.structuredContent, emit);
        return serialized;
      }, { name: spec.name, description: spec.description, schema: spec.schema }));

      const provider = options.provider ?? new DeterministicMockCadProvider();
      const agent = createAgent({
        model: provider.createModel(request, requestId),
        tools,
        systemPrompt: "Operate only through the supplied project-scoped CAD tools. Never claim a revision or artifact from prose. Use the authoritative IDs returned by tools.",
        middleware: [toolCallLimitMiddleware({ runLimit: CHAT_LIMITS.maxToolRounds, exitBehavior: "error" })],
      });
      const run = await agent.streamEvents({ messages: [{ role: "user", content: request.message }] }, { version: "v3", signal: combinedSignal });
      const outputPromise = Promise.resolve(run.output);
      void outputPromise.catch(() => undefined);
      const protocolDrain = (async () => { for await (const event of run) void event; })();
      void protocolDrain.catch(() => undefined);
      const toolDrain = (async () => {
        for await (const call of run.toolCalls) {
          await Promise.allSettled([call.output, call.status, call.error]);
        }
      })();
      void toolDrain.catch(() => undefined);
      for await (const message of run.messages) {
        const output = await message.output;
        if ((output.tool_calls?.length ?? 0) === 0) {
          const remaining = CHAT_LIMITS.assistantOutputCharacters - assistantOutputBytes;
          const text = safeAssistantText(messageText(output.content), sensitiveValues, Math.max(0, remaining));
          assistantOutputBytes += utf8Bytes(text);
          for (const delta of utf8Chunks(text, CHAT_LIMITS.assistantDeltaCharacters)) emit({ type: "assistant_delta", delta });
        }
      }
      await Promise.all([outputPromise, protocolDrain, toolDrain]);
      emit({ type: "done", outcome: "completed", toolRounds });
      terminal = true;
    } catch (error) {
      const isToolLimit = toolRounds === CHAT_LIMITS.maxToolRounds || error instanceof ToolCallLimitExceededError || (error instanceof Error && (error.name === "ToolCallLimitExceededError" || /tool call limit/i.test(error.message)));
      let code: "CANCELLED" | "REQUEST_TIMEOUT" | "TOOL_LIMIT_EXCEEDED" | "REPAIR_LIMIT_EXCEEDED" | "TOOL_RESULT_TOO_LARGE" | "MCP_FAILURE" | "PROVIDER_FAILURE";
      if (signal?.aborted) code = "CANCELLED";
      else if (terminalFailure) code = terminalFailure;
      else if (timeout.aborted) code = "REQUEST_TIMEOUT";
      else if (isToolLimit) code = "TOOL_LIMIT_EXCEEDED";
      else if (error instanceof Error && error.message === "REPAIR_LIMIT_EXCEEDED") code = "REPAIR_LIMIT_EXCEEDED";
      else if (error instanceof Error && error.message === "MCP_FAILURE") code = "MCP_FAILURE";
      else code = "PROVIDER_FAILURE";

      let message: string;
      switch (code) {
        case "CANCELLED": message = "The request was cancelled."; break;
        case "REQUEST_TIMEOUT": message = "The request exceeded its time limit."; break;
        case "TOOL_LIMIT_EXCEEDED": message = "The CAD tool-call limit was reached."; break;
        case "REPAIR_LIMIT_EXCEEDED": message = "The candidate repair limit was reached."; break;
        case "TOOL_RESULT_TOO_LARGE": message = "The CAD tool result exceeded its safe size limit."; break;
        case "MCP_FAILURE": message = "The CAD service is temporarily unavailable."; break;
        case "PROVIDER_FAILURE": message = "The chat provider failed safely."; break;
      }
      emit({ type: "error", code, message, recoverable: code !== "CANCELLED" });
      emit({ type: "done", outcome: code === "CANCELLED" ? "cancelled" : "failed", toolRounds: Math.min(toolRounds, CHAT_LIMITS.maxToolRounds) });
      terminal = true;
    } finally {
      if (!terminal) emit({ type: "done", outcome: "failed", toolRounds: Math.min(toolRounds, CHAT_LIMITS.maxToolRounds) });
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
