import {
  type CandidateRecord,
  type CreateProjectInput,
  type Diagnostic,
  type GeometrySummary,
  type RendererProvenance,
  type RevisionManifest,
  type UpdateProjectInput,
} from "@theoryfoundry/contracts";
import type { ProjectSummary } from "./project.types.js";
export interface PersistedCandidate {
  candidate: CandidateRecord;
  source: string;
}
export interface PersistedRevision {
  manifest: RevisionManifest;
  source: string;
}
export interface ProjectPersistence {
  transaction<T>(
    operation: (transaction: ProjectPersistence) => Promise<T>,
  ): Promise<T>;
  requireProject(
    projectId: string,
    lock?: boolean,
  ): Promise<{
    currentRevision: string | null;
  }>;
  createProject(
    projectId: string,
    input: CreateProjectInput,
  ): Promise<ProjectSummary>;
  updateProject(raw: UpdateProjectInput): Promise<ProjectSummary>;
  listProjects(): Promise<ProjectSummary[]>;
  readCandidate(
    projectId: string,
    candidateId: string,
    lock?: boolean,
  ): Promise<PersistedCandidate>;
  readRevision(
    projectId: string,
    revisionId: string,
    lock?: boolean,
  ): Promise<PersistedRevision>;
  listRevisionHistory(
    projectId: string,
    currentRevision: string,
  ): Promise<RevisionManifest[]>;
  insertCandidate(input: {
    id: string;
    projectId: string;
    parentRevision: string | null;
    source: string;
    requestId: string;
    toolCallId: string;
    createdAt: Date;
  }): Promise<void>;
  markCandidateRunning(
    projectId: string,
    candidateId: string,
    attemptId: string,
    updatedAt: Date,
  ): Promise<void>;
  completeCandidateValidation(input: {
    projectId: string;
    candidateId: string;
    attemptId: string;
    state: "VALID" | "REJECTED" | "CREATED";
    diagnostics: Diagnostic[];
    renderer?: RendererProvenance;
    geometry?: GeometrySummary;
    validationPolicyVersion?: string;
    artifacts: CandidateRecord["artifacts"];
    updatedAt: Date;
    error?: {
      code: string;
      message: string;
      details: Readonly<Record<string, string | number | boolean | null>>;
    };
  }): Promise<void>;
  supersedeCandidate(candidateId: string, updatedAt: Date): Promise<void>;
  insertRevision(input: {
    id: string;
    projectId: string;
    parentRevision: string | null;
    restoredFromRevision?: string;
    source: string;
    sourceHash: string;
    sourceBytes: number;
    requestId: string;
    toolCallId: string;
    candidateId: string;
    validationPolicyVersion: string;
    diagnostics: Diagnostic[];
    renderer: RendererProvenance;
    geometry?: GeometrySummary;
    createdAt: Date;
  }): Promise<void>;
  insertRevisionArtifacts(
    revisionId: string,
    artifacts: RevisionManifest["artifacts"],
  ): Promise<void>;
  restoreRevisionArtifacts(
    revisionId: string,
    sourceRevisionId: string,
    artifacts: RevisionManifest["artifacts"],
  ): Promise<void>;
  advanceCurrentRevision(
    projectId: string,
    revisionId: string,
    updatedAt: Date,
  ): Promise<void>;
  markCandidatePromoted(candidateId: string, updatedAt: Date): Promise<void>;
}
export {};
