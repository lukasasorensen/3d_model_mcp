import type {
  ObservabilityExporter,
  RequestObservabilitySnapshot,
} from "../observability.types.js";
import { ObservabilityEvidence } from "../services/observabilityEvidence.service.js";
export class RuntimeObservabilityStore {
  private readonly requests: ObservabilityEvidence[] = [];

  constructor(
    private readonly exporter?: ObservabilityExporter,
    private readonly retainedRequests = 128,
  ) {}

  createRequestSink = (): ObservabilityEvidence => {
    const evidence = new ObservabilityEvidence(this.exporter);
    this.requests.push(evidence);
    while (this.requests.length > this.retainedRequests) this.requests.shift();
    return evidence;
  };

  snapshot(): readonly RequestObservabilitySnapshot[] {
    return this.requests.map((request) => request.snapshot());
  }

  drain(): readonly RequestObservabilitySnapshot[] {
    const snapshots = this.snapshot();
    this.requests.splice(0);
    return snapshots;
  }
}
