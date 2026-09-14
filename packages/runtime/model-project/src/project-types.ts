import type { ArtifactManifest, Diagnostic } from "@rjls/contracts";

export interface ProjectState {
  projectId: string;
  currentRevision: string | null;
  source: { hash: string; byteSize: number } | null;
  artifacts: ArtifactManifest[];
  diagnostics: Diagnostic[];
}

export interface ProjectSummary {
  projectId: string;
}
