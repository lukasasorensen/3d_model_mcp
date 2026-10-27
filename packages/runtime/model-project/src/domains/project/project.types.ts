import type { ArtifactManifest, Diagnostic } from "@theoryfoundry/contracts";

export interface ProjectState {
  projectId: string;
  currentRevision: string | null;
  source: { hash: string; byteSize: number } | null;
  artifacts: ArtifactManifest[];
  diagnostics: Diagnostic[];
}

export type { ProjectSummary } from "@theoryfoundry/contracts";
