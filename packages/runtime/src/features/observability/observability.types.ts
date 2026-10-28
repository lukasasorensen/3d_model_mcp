import {
  type MetricSample,
  type ObservabilityEnvelope,
} from "@theoryfoundry/contracts";
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
  volume: {
    records: number;
    metrics: number;
    serializedBytes: number;
    truncated: boolean;
  };
}

export interface ObservabilityExporter {
  record?(event: ObservabilityEnvelope): void;
  metric?(sample: MetricSample): void;
}
