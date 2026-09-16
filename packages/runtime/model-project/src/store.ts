import type { CandidateRecord, RevisionManifest, CreateProjectInput, UpdateProjectInput } from "@rjls/contracts";

import type { ProjectState, ProjectSummary } from "./project-types.js";

/** Project persistence scoped to one authenticated owner. */
export interface ModelProjectStore {
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(input: UpdateProjectInput): Promise<ProjectSummary>;
  getProjectState(projectId: string): Promise<ProjectState>;
  listProjects(): Promise<ProjectSummary[]>;
  readValidatedCandidateSource(projectId: string, candidateId: string): Promise<{ candidateId: string; source: string; sourceHash: string }>;
  readModelSource(projectId: string, revision?: string): Promise<{ revision: string; source: string; sourceHash: string }>;
  listRevisions(projectId: string): Promise<RevisionManifest[]>;
  proposeModelSource(input: {
    projectId: string;
    parentRevision: string | null;
    source: string;
    requestId: string;
    toolCallId: string;
  }): Promise<CandidateRecord>;
  validateAndRender(input: {
    projectId: string;
    candidateId: string;
    previewProfile: "standard";
    signal?: AbortSignal;
  }): Promise<CandidateRecord>;
  promoteCandidate(input: {
    projectId: string;
    candidateId: string;
    expectedParentRevision: string | null;
    signal?: AbortSignal;
  }): Promise<RevisionManifest>;
  getExportMetadata(projectId: string, revision: string, format: "3mf"): Promise<{ revision: string; source: string; sourceHash: string; format: "3mf" }>;
  restoreRevision(input: {
    projectId: string;
    revision: string;
    requestId: string;
    toolCallId: string;
    signal?: AbortSignal;
  }): Promise<RevisionManifest>;
}
