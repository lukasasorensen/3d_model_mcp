import {
  OBSERVABILITY_LIMITS,
  metricSampleSchema,
  observabilityEnvelopeSchema,
  type MetricSample,
  type ObservabilityEnvelope,
} from "@rjls/contracts";

const sensitivePattern = /(?:Bearer\s+\S+|(?:api|access|auth|secret|token|password)[_-]?[A-Za-z0-9]*\s*[:=]\s*\S+|(?:\/Users|\/home|\/private|\/tmp|\/var)\/[\w./-]+)/gi;

function redact(value: string): string {
  return value.replace(sensitivePattern, "[redacted]");
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export interface ReferenceEnvironmentEvidence {
  cpu: string;
  ramBytes: number;
  os: string;
  filesystem: string;
  containerEngine: string;
  containerContext: string;
  containerMode: string;
  cgroup: string;
  browser: string;
  openscadImageDigest: string;
  bosl2Pin: string;
  dependencyLockHash: string;
  validationPolicyHash: string;
  runTimestamp: string;
}

export interface VerificationEvidenceBundle {
  environment: ReferenceEnvironmentEvidence;
  records: readonly ObservabilityEnvelope[];
  metrics: readonly MetricSample[];
  readinessTransitions: readonly ObservabilityEnvelope[];
  redactionScan: { matches: 0 };
  volume: { records: number; serializedBytes: number; truncated: boolean };
}

export interface RequestObservabilitySnapshot {
  records: readonly ObservabilityEnvelope[];
  metrics: readonly MetricSample[];
  redactionScan: { matches: 0 };
  volume: { records: number; metrics: number; serializedBytes: number; truncated: boolean };
}

export interface ObservabilityExporter {
  record?(event: ObservabilityEnvelope): void;
  metric?(sample: MetricSample): void;
}

/**
 * Bounded, redacting evidence sink for local verification and production adapters.
 * It deliberately accepts structured metadata only; prompts, source, commands, and
 * environment dumps are not observability fields.
 */
export class ObservabilityEvidence {
  private readonly records: ObservabilityEnvelope[] = [];
  private readonly metrics: MetricSample[] = [];
  private truncated = false;
  private ready = true;
  private successfulRecoveryProbes = 0;
  private lastContext: Pick<ObservabilityEnvelope, "requestId" | "timestamp"> = { requestId: "observability-budget", timestamp: "1970-01-01T00:00:00.000Z" };

  constructor(private readonly exporter?: ObservabilityExporter) {}

  record(raw: ObservabilityEnvelope): void {
    if (this.truncated) return;
    const metadata = raw.metadata
      ? Object.fromEntries(Object.entries(raw.metadata).map(([key, value]) => [key, typeof value === "string" ? redact(value) : value]))
      : undefined;
    const event = observabilityEnvelopeSchema.parse({ ...raw, ...(metadata ? { metadata } : {}) });
    this.lastContext = { requestId: event.requestId, timestamp: event.timestamp };
    if (!this.hasReservedCapacity([...this.records, event], this.metrics, event)) {
      this.emitTruncation(event);
      return;
    }
    this.records.push(event);
    this.exporter?.record?.(event);
  }

  metric(raw: MetricSample): void {
    if (this.truncated) return;
    const sample = metricSampleSchema.parse(raw);
    if (!this.hasReservedCapacity(this.records, [...this.metrics, sample], this.lastContext)) {
      this.emitTruncation(this.lastContext);
      return;
    }
    this.metrics.push(sample);
    this.exporter?.metric?.(sample);
  }

  probeDependency(input: { available: boolean; requestId: string; timestamp: string }): "ready" | "unavailable" {
    if (!input.available) {
      this.successfulRecoveryProbes = 0;
      if (this.ready) {
        this.ready = false;
        this.record({ version: "1", timestamp: input.timestamp, level: "error", service: "runtime", event: "readiness.unavailable", requestId: input.requestId, outcome: "unavailable", diagnosticCode: "DEPENDENCY_UNAVAILABLE" });
      }
      return "unavailable";
    }
    if (!this.ready) {
      this.successfulRecoveryProbes += 1;
      if (this.successfulRecoveryProbes >= 2) {
        this.ready = true;
        this.successfulRecoveryProbes = 0;
        this.record({ version: "1", timestamp: input.timestamp, level: "info", service: "runtime", event: "readiness.ready", requestId: input.requestId, outcome: "success" });
      }
    }
    return this.ready ? "ready" : "unavailable";
  }

  bundle(environment: ReferenceEnvironmentEvidence): VerificationEvidenceBundle {
    const validatedEnvironment = {
      ...environment,
      runTimestamp: new Date(environment.runTimestamp).toISOString(),
    };
    const text = JSON.stringify({ records: this.records, metrics: this.metrics });
    if (sensitivePattern.test(text)) throw new Error("Observability redaction scan failed.");
    sensitivePattern.lastIndex = 0;
    return {
      environment: validatedEnvironment,
      records: [...this.records],
      metrics: [...this.metrics],
      readinessTransitions: this.records.filter((record) => record.event.startsWith("readiness.")),
      redactionScan: { matches: 0 },
      volume: { records: this.records.length, serializedBytes: serializedBytes({ records: this.records, metrics: this.metrics }), truncated: this.truncated },
    };
  }

  snapshot(): RequestObservabilitySnapshot {
    const text = JSON.stringify({ records: this.records, metrics: this.metrics });
    if (sensitivePattern.test(text)) throw new Error("Observability redaction scan failed.");
    sensitivePattern.lastIndex = 0;
    return {
      records: [...this.records],
      metrics: [...this.metrics],
      redactionScan: { matches: 0 },
      volume: { records: this.records.length, metrics: this.metrics.length, serializedBytes: serializedBytes({ records: this.records, metrics: this.metrics }), truncated: this.truncated },
    };
  }

  private truncationPair(context: Pick<ObservabilityEnvelope, "requestId" | "timestamp">): { event: ObservabilityEnvelope; metric: MetricSample } {
    return {
      event: observabilityEnvelopeSchema.parse({
        version: "1", timestamp: context.timestamp, level: "warning", service: "runtime",
        event: "observability.truncated", requestId: context.requestId, outcome: "failure",
        diagnosticCode: "OBSERVABILITY_VOLUME_LIMIT",
      }),
      metric: metricSampleSchema.parse({ name: "observability_truncated_count", value: 1, labels: { service: "runtime", operation: "observability", outcome: "failure", diagnosticCode: "OBSERVABILITY_VOLUME_LIMIT" } }),
    };
  }

  private hasReservedCapacity(records: readonly ObservabilityEnvelope[], metrics: readonly MetricSample[], context: Pick<ObservabilityEnvelope, "requestId" | "timestamp">): boolean {
    const reserved = this.truncationPair(context);
    return records.length + metrics.length + 2 <= OBSERVABILITY_LIMITS.recordsPerRequest
      && serializedBytes({ records: [...records, reserved.event], metrics: [...metrics, reserved.metric] }) <= OBSERVABILITY_LIMITS.serializedBytesPerRequest;
  }

  private emitTruncation(context: Pick<ObservabilityEnvelope, "requestId" | "timestamp">): void {
    if (this.truncated) return;
    this.truncated = true;
    const truncation = this.truncationPair(context);
    while (
      this.records.length + this.metrics.length + 2 > OBSERVABILITY_LIMITS.recordsPerRequest
      || serializedBytes({ records: [...this.records, truncation.event], metrics: [...this.metrics, truncation.metric] }) > OBSERVABILITY_LIMITS.serializedBytesPerRequest
    ) {
      if (this.metrics.length >= this.records.length && this.metrics.length > 0) this.metrics.pop();
      else if (this.records.length > 0) this.records.pop();
      else break;
    }
    this.records.push(truncation.event);
    this.metrics.push(truncation.metric);
    this.exporter?.record?.(truncation.event);
    this.exporter?.metric?.(truncation.metric);
  }
}

export class RuntimeObservabilityStore {
  private readonly requests: ObservabilityEvidence[] = [];

  constructor(private readonly exporter?: ObservabilityExporter, private readonly retainedRequests = 128) {}

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
