import type {
  ArtifactManifest,
  Diagnostic,
  ProjectSummary,
} from "@theoryfoundry/contracts";

export interface ModelProposal {
  projectId: string;
  parentRevision: string | null;
  source: string;
  requestId: string;
  toolCallId: string;
}

export interface ProjectViews {
  active: ProjectSummary[];
  archived: ProjectSummary[];
}

export interface ProjectState {
  projectId: string;
  currentRevision: string | null;
  source: { hash: string; byteSize: number } | null;
  artifacts: ArtifactManifest[];
  diagnostics: Diagnostic[];
}

export type { ProjectSummary } from "@theoryfoundry/contracts";
