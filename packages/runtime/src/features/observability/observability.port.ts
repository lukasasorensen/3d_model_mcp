import type {
  MetricSample,
  ObservabilityEnvelope,
} from "@theoryfoundry/contracts";
import type {
  ReferenceEnvironmentEvidence,
  RequestObservabilitySnapshot,
  VerificationEvidenceBundle,
} from "./observability.types.js";
export interface ObservabilitySink {
  record(raw: ObservabilityEnvelope): void;
  metric(raw: MetricSample): void;
  probeDependency(input: {
    available: boolean;
    requestId: string;
    timestamp: string;
  }): "ready" | "unavailable";
  bundle(environment: ReferenceEnvironmentEvidence): VerificationEvidenceBundle;
  snapshot(): RequestObservabilitySnapshot;
}

export interface RuntimeObservability {
  createRequestSink(): ObservabilitySink;
  snapshot(): readonly RequestObservabilitySnapshot[];
  drain(): readonly RequestObservabilitySnapshot[];
}
