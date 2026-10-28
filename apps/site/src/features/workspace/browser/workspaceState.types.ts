import type {
  ArtifactManifest,
  ChatEvent,
  RevisionManifest,
} from "@theoryfoundry/contracts";
import type { ChatTurn } from "../../chat/browser/index";
export interface WorkspaceState {
  hydrated: boolean;
  currentRevision: string | null;
  pendingCurrentRevision: string | null;
  selectedRevision: string | null;
  revisions: RevisionManifest[];
  artifacts: Record<string, ArtifactManifest | StreamArtifact>;
  turns: ChatTurn[];
  active: boolean;
  candidateStatus: "idle" | "created" | "validated" | "rejected" | "promoting";
  notice: string;
  announcement: { key: string; text: string } | null;
  announcedKeys: readonly string[];
}
export interface StreamArtifact {
  artifactId: string;
  revisionId: string;
  format: "stl" | "3mf";
  mimeType: "model/stl" | "model/3mf";
  hash: string;
  byteSize: number;
}

export type WorkspaceAction =
  | {
      type: "hydrate";
      revisions: RevisionManifest[];
      currentRevision: string | null;
    }
  | { type: "submit"; id: string; text: string }
  | { type: "event"; event: ChatEvent }
  | { type: "local_error"; message: string }
  | { type: "select_revision"; revisionId: string }
  | { type: "restored"; revision: RevisionManifest };
