import {
  type ChatEvent,
  type ChatRequest,
  type MetricSample,
  type ObservabilityEnvelope,
} from "@theoryfoundry/contracts";

import type { CadMcpClient } from "./cadClient.port.js";
import { type CadChatProvider } from "./chatProvider.port.js";

export type EventDraft = ChatEvent extends infer Event
  ? Event extends ChatEvent
    ? Omit<
        Event,
        "version" | "requestId" | "sessionId" | "sequence" | "timestamp"
      >
    : never
  : never;

export interface ChatOrchestratorOptions {
  client: CadMcpClient;
  provider?: CadChatProvider;
  createId?: () => string;
  clock?: () => Date;
  timeoutMs?: number;
  createObservabilitySink?: () => {
    record(event: ObservabilityEnvelope): void;
    metric?(sample: MetricSample): void;
  };
  browserRenderer?: {
    subscribe(
      candidateId: string,
      sessionId: string,
      callback: (request: {
        jobId: string;
        token: string;
        purpose: "candidate";
        candidateId: string;
        source: string;
        sourceHash: string;
        format: "stl";
        deadline: string;
      }) => void,
    ): () => void;
  };
}

export interface ChatRouteOptions {
  allowedOrigin: string;
  getOrchestrator(request: ChatRequest): Promise<ChatOrchestratorOptions>;
}
