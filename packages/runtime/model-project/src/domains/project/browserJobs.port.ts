import type {
  BrowserRenderCompletion,
  CandidateRenderRequest,
} from "@theoryfoundry/contracts";
import { type BrowserPresence } from "@theoryfoundry/contracts";
export interface RemoteRenderJobs {
  readonly ownerId: string;
  readonly deliveryMode: "remote-mcp" | "local-mcp";
  enqueue(id: string, request: CandidateRenderRequest): Promise<void>;
  claim(
    projectId: string,
    sessionId: string,
    tokenHash: string,
  ): Promise<RemoteRenderJob | undefined>;
  outcome(id: string): Promise<PersistedRenderOutcome | undefined>;
  cancel(id: string): Promise<void>;
  recover(): Promise<void>;
}
export interface RemoteRenderJob {
  createdAt: string;
  jobId: string;
  candidateId: string;
  source: string;
  sourceHash: string;
  deadline: string;
}
export interface PersistedRenderOutcome {
  deadline: Date;
  claim_deadline: Date | null;
  claimed_at: Date | null;
  state: string;
  completion: Pick<
    BrowserRenderCompletion,
    "outcome" | "diagnostics" | "provenance" | "geometry"
  > | null;
}
export interface BrowserPresenceStore {
  update(projectId: string, raw: BrowserPresence): Promise<void>;
  availability(
    projectId: string,
    mode: "local-mcp" | "remote-mcp" | "chat",
  ): Promise<"ready" | "busy" | "unavailable">;
}

import {
  type PreviewJob,
  type PreviewMetadata,
} from "@theoryfoundry/contracts";
export interface BrowserPreviewStore {
  readonly ownerId: string;
  sweep(): Promise<void>;
  enqueue(
    id: string,
    metadata: PreviewBinding,
    source: string,
    mode: "local-mcp" | "remote-mcp",
  ): Promise<void>;
  claim(
    projectId: string,
    sessionId: string,
    modes: string[],
  ): Promise<PreviewJob | undefined>;
  browserStatus(
    projectId: string,
    sessionId: string,
    jobId: string,
    token: string,
  ): Promise<"pending" | "completed" | "cancelled">;
  outcome(id: string): Promise<PersistedPreviewJob | undefined>;
  complete(raw: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}
type PreviewBinding = Omit<PreviewMetadata, "imageHash">;
export interface PersistedPreviewJob {
  id: string;
  metadata: PreviewBinding;
  source: string;
  state: string;
  completion: {
    png?: string;
    error?: string;
  } | null;
  deadline: Date;
  claim_deadline: Date;
  claimed_at: Date | null;
}
