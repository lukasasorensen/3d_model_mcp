import type {
  CandidateRecord,
  RevisionManifest,
} from "@theoryfoundry/contracts";
import type { ProjectSummary } from "../domains/project/index.js";
export interface DurableFiles {
  fsyncDirectory(path: string): Promise<void>;
  writeDurable(path: string, contents: string | Uint8Array): Promise<void>;
  writeAtomic(path: string, contents: string | Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
}
export interface FileLocks {
  withProjectLock<T>(
    projectId: string,
    lockName: string,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}
export interface FileRecords {
  ensureProject(projectId: string): Promise<void>;
  readProjectDetails(projectId: string): Promise<ProjectSummary>;
  readCurrent(projectId: string): Promise<string | null>;
  readManifest(
    projectId: string,
    revisionId: string,
  ): Promise<RevisionManifest>;
  readCandidate(
    projectId: string,
    candidateId: string,
  ): Promise<CandidateRecord>;
  reconcilePromotedCandidate(manifest: RevisionManifest): Promise<void>;
  updateCandidate(
    candidate: CandidateRecord,
    nextState: CandidateRecord["state"],
    patch?: Partial<CandidateRecord>,
  ): Promise<CandidateRecord>;
}
