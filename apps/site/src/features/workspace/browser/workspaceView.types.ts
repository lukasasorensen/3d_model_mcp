import type {
  ProjectSummary,
  RevisionManifest,
} from "@theoryfoundry/contracts";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { DownloadFormat } from "../../exports/browser/index";
import type { PreviewLoadState } from "../../model-preview/browser/index";
import type { WorkspaceAction, WorkspaceState } from "./workspaceState.types";

type ExportState = "idle" | "preparing" | "failed" | "complete";
export interface WorkspaceView {
  router: { push(href: string): void };
  isSidebarChatEnabled: boolean;
  state: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
  readiness: "checking" | "ready" | "unavailable";
  downloadReceipt: { filename: string; hash: string } | undefined;
  exportState: ExportState;
  setExportState: Dispatch<SetStateAction<ExportState>>;
  exportFormat: DownloadFormat;
  setExportFormat: Dispatch<SetStateAction<DownloadFormat>>;
  projects: ProjectSummary[];
  chatCollapsed: boolean;
  setChatCollapsed: Dispatch<SetStateAction<boolean>>;
  restorePending: boolean;
  previewLoadState: PreviewLoadState;
  setPreviewLoadState: Dispatch<SetStateAction<PreviewLoadState>>;
  abortRef: RefObject<AbortController | undefined>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  lastMessage: RefObject<string>;
  sessionId: string;
  isMcpRendering: boolean;
  mcpStatus: string;
  submit(message: string): Promise<void>;
  restore(revisionId: string): Promise<void>;
  currentLabel: string;
  selectedLabel: string;
  promotionPending: boolean;
  selectedManifest: RevisionManifest | undefined;
  currentManifest: RevisionManifest | undefined;
  dimensions: string;
  readinessLabel: string;
  currentBadgeLabel: string;
  exportCurrent(): Promise<void>;
  syncStatus: string;
}
