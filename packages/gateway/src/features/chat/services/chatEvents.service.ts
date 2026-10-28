import { chatEventSchema, type ChatEvent } from "@theoryfoundry/contracts";
import type { ChatOrchestratorOptions, EventDraft } from "../chat.types.js";
export class ChatEvents {
  private values: ChatEvent[] = [];
  private waiting: Array<(event: ChatEvent | undefined) => void> = [];
  private ended = false;
  push(event: ChatEvent): void {
    const wake = this.waiting.shift();
    if (wake) wake(event);
    else this.values.push(event);
  }
  end(): void {
    this.ended = true;
    for (const wake of this.waiting.splice(0)) wake(undefined);
  }
  async next(): Promise<ChatEvent | undefined> {
    const value = this.values.shift();
    if (value) return value;
    if (this.ended) return undefined;
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private sequence = 0;
  private terminalDiagnosticCode: string | undefined;
  constructor(
    private readonly requestId: string,
    private readonly sessionId: string,
    private readonly clock: () => Date,
    private readonly observability:
      | ReturnType<
          NonNullable<ChatOrchestratorOptions["createObservabilitySink"]>
        >
      | undefined,
  ) {}
  emit(draft: EventDraft): void {
    const event = chatEventSchema.parse({
      ...draft,
      version: "3",
      requestId: this.requestId,
      sessionId: this.sessionId,
      sequence: this.sequence++,
      timestamp: this.clock().toISOString(),
    });
    this.push(event);
    const outcome =
      event.type === "done"
        ? event.outcome === "completed"
          ? "success"
          : event.outcome === "cancelled"
            ? "cancelled"
            : "failure"
        : event.type === "error" ||
            (event.type === "tool_result" && event.outcome === "error")
          ? "failure"
          : "success";
    this.observability?.record({
      version: "1",
      timestamp: event.timestamp,
      level: outcome === "failure" ? "error" : "info",
      service: "gateway",
      event: `chat.${event.type}`,
      requestId: event.requestId,
      conversationId: event.sessionId,
      outcome,
      ...("toolCallId" in event ? { toolCallId: event.toolCallId } : {}),
      ...("candidateId" in event && event.candidateId
        ? { candidateId: event.candidateId }
        : {}),
      ...("revisionId" in event && event.revisionId
        ? { revisionId: event.revisionId }
        : {}),
      ...("artifactId" in event ? { artifactId: event.artifactId } : {}),
      ...(event.type === "error" ||
      (event.type === "tool_result" && event.outcome === "error")
        ? { diagnosticCode: event.code }
        : {}),
    });
    if (event.type === "error") this.terminalDiagnosticCode = event.code;
    if (event.type === "revision" && event.status === "candidate_rejected")
      this.observability?.metric?.({
        name: "invalid_candidate_count",
        value: 1,
        labels: {
          service: "gateway",
          operation: "validate_and_render",
          outcome: "failure",
          diagnosticCode: "INVALID_CANDIDATE",
        },
      });
    if (
      event.type === "tool_result" &&
      event.outcome === "error" &&
      event.code === "STALE_REVISION"
    )
      this.observability?.metric?.({
        name: "promotion_conflict_count",
        value: 1,
        labels: {
          service: "gateway",
          operation: "promote_candidate",
          outcome: "failure",
          diagnosticCode: "STALE_REVISION",
        },
      });
    if (event.type === "artifact")
      this.observability?.metric?.({
        name: "artifact_bytes",
        value: event.byteSize,
        labels: {
          service: "gateway",
          operation: "artifact",
          outcome: "success",
        },
      });
    if (event.type === "done") {
      const terminalOutcome =
        event.outcome === "completed"
          ? "success"
          : event.outcome === "cancelled"
            ? "cancelled"
            : "failure";
      this.observability?.metric?.({
        name: "request_count",
        value: 1,
        labels: {
          service: "gateway",
          operation: "chat",
          outcome: terminalOutcome,
          ...(this.terminalDiagnosticCode
            ? { diagnosticCode: this.terminalDiagnosticCode }
            : {}),
        },
      });
      this.observability?.metric?.({
        name: "tool_rounds",
        value: event.toolRounds,
        labels: {
          service: "gateway",
          operation: "chat",
          outcome: terminalOutcome,
          ...(this.terminalDiagnosticCode
            ? { diagnosticCode: this.terminalDiagnosticCode }
            : {}),
        },
      });
      if (event.outcome === "failed")
        this.observability?.metric?.({
          name: "request_failure",
          value: 1,
          labels: {
            service: "gateway",
            operation: "chat",
            outcome: "failure",
            ...(this.terminalDiagnosticCode
              ? { diagnosticCode: this.terminalDiagnosticCode }
              : {}),
          },
        });
      if (this.terminalDiagnosticCode === "REQUEST_TIMEOUT")
        this.observability?.metric?.({
          name: "timeout_count",
          value: 1,
          labels: {
            service: "gateway",
            operation: "chat",
            outcome: "failure",
            diagnosticCode: "REQUEST_TIMEOUT",
          },
        });
      if (this.terminalDiagnosticCode === "CANCELLED")
        this.observability?.metric?.({
          name: "cancel_count",
          value: 1,
          labels: {
            service: "gateway",
            operation: "chat",
            outcome: "cancelled",
            diagnosticCode: "CANCELLED",
          },
        });
    }
    if (
      event.type === "revision" &&
      (event.status === "candidate_validated" ||
        event.status === "candidate_rejected") &&
      event.candidateId
    ) {
      this.observability?.record({
        version: "1",
        timestamp: event.timestamp,
        level: event.status === "candidate_validated" ? "info" : "error",
        service: "renderer",
        event: "render.completed",
        requestId: event.requestId,
        conversationId: event.sessionId,
        toolCallId: event.toolCallId,
        jobId: `${event.candidateId}-render`,
        candidateId: event.candidateId,
        outcome: event.status === "candidate_validated" ? "success" : "failure",
      });
    }
  }
}
