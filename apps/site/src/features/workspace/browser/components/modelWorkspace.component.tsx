"use client";
import type { JSX } from "react";

import dynamic from "next/dynamic";
import { ChatPane } from "../../../chat/browser/index";
import { ModelSourcePanel } from "../../../model-preview/browser/index";
import { ConnectToCodex } from "../../../onboarding/browser/index";
import { RevisionHistory } from "./revisionHistory.component";

import { type DownloadFormat } from "../../../exports/browser/index";

import { useModelWorkspace } from "../hooks/useModelWorkspace.hook";
import {
  previewStatusLabel,
  promotionStatusLabel,
} from "../utils/workspacePresentation.util";
const ModelViewer = dynamic(
  () =>
    import("../../../model-preview/browser/index").then(
      (module) => module.ModelViewer,
    ),
  {
    ssr: false,
    loading: () => <div className="viewer-loading">Preparing 3D viewer…</div>,
  },
);
export function ModelWorkspace({
  projectId,
  localMcpBridgeEnabled = false,
  remoteMcpEnabled = false,
  codexOrigin,
}: {
  projectId: string;
  localMcpBridgeEnabled?: boolean;
  remoteMcpEnabled?: boolean;
  codexOrigin?: string | undefined;
}): JSX.Element {
  const {
    router,
    isSidebarChatEnabled,
    state,
    dispatch,
    readiness,
    downloadReceipt,
    exportState,
    setExportState,
    exportFormat,
    setExportFormat,
    projects,
    chatCollapsed,
    setChatCollapsed,
    restorePending,
    previewLoadState,
    setPreviewLoadState,
    abortRef,
    composerRef,
    lastMessage,
    sessionId,
    isMcpRendering,
    mcpStatus,
    submit,
    restore,
    currentLabel,
    selectedLabel,
    promotionPending,
    selectedManifest,
    currentManifest,
    dimensions,
    readinessLabel,
    currentBadgeLabel,
    exportCurrent,
    syncStatus,
  } = useModelWorkspace({
    projectId,
    localMcpBridgeEnabled,
    remoteMcpEnabled,
  });
  return (
    <main className="app-shell" data-testid="cad-workspace">
      <a
        className="skip-link"
        href={isSidebarChatEnabled ? "#conversation-heading" : "#model-heading"}
      >
        {isSidebarChatEnabled ? "Skip to conversation" : "Skip to model"}
      </a>
      <header className="app-header">
        <div className="brand-mark">
          <span aria-hidden="true">T</span>
          <div>
            <strong>TheoryFoundry Conversational CAD</strong>
            <small>Precision workshop</small>
          </div>
        </div>
        <div className="header-controls">
          {remoteMcpEnabled && codexOrigin && (
            <ConnectToCodex origin={codexOrigin} projectId={projectId} />
          )}
          <button
            type="button"
            onClick={() => router.push("/projects")}
            disabled={
              isMcpRendering ||
              state.active ||
              restorePending ||
              exportState === "preparing"
            }
          >
            All projects
          </button>
          <label className="project-selector">
            Project<span className="sr-only"> selector</span>
            <select
              value={projectId}
              onChange={(event) =>
                router.push(
                  `/projects/${encodeURIComponent(event.target.value)}`,
                )
              }
              disabled={
                isMcpRendering ||
                state.active ||
                restorePending ||
                exportState === "preparing"
              }
            >
              {projects.length === 0 && (
                <option value={projectId}>{projectId}</option>
              )}
              {projects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="header-status">
            <span
              className={`readiness-dot readiness-${readiness}`}
              aria-hidden="true"
            />
            <span>{readinessLabel}</span>
            <code>mm · Z up</code>
          </div>
        </div>
      </header>

      <div
        className={`workspace-grid ${!isSidebarChatEnabled ? "chat-hidden" : chatCollapsed ? "chat-collapsed" : ""}`}
      >
        <section className="model-pane" aria-labelledby="model-heading">
          <div className="pane-heading">
            <div>
              <p className="eyebrow">Model inspection</p>
              <h1 id="model-heading">
                {state.selectedRevision
                  ? `Inspecting ${selectedLabel}`
                  : "No model yet"}
              </h1>
            </div>
            <div className="revision-badges">
              <span className="current-badge">{currentBadgeLabel}</span>
              {!promotionPending &&
                state.selectedRevision !== state.currentRevision && (
                  <span>Viewing · {selectedLabel}</span>
                )}
            </div>
          </div>
          {syncStatus && (
            <p className="notice" role="status">
              {syncStatus}
            </p>
          )}
          {(localMcpBridgeEnabled || remoteMcpEnabled) && (
            <p className="notice" role="status">
              {mcpStatus ||
                "Ready for Codex. Keep this project tab visible during validation."}
            </p>
          )}
          <div className="revision-rail" aria-hidden="true">
            <span className={state.active ? "rail-working" : ""} />
          </div>
          {promotionPending && (
            <p className="notice" role="status">
              {promotionStatusLabel(
                selectedLabel,
                Boolean(state.selectedRevision),
              )}
            </p>
          )}
          <ModelViewer
            projectId={projectId}
            revisionId={selectedManifest?.revisionId}
            sourceHash={selectedManifest?.sourceHash}
            currentLabel={selectedLabel}
            updating={state.active}
            onLoadStateChange={setPreviewLoadState}
          />
          <div className="model-facts" aria-label="Model facts">
            <div>
              <span>Revision</span>
              <strong>{selectedLabel}</strong>
            </div>
            <div>
              <span>Bounds</span>
              <strong>{dimensions} mm</strong>
            </div>
            <div>
              <span>Preview</span>
              <strong>
                {selectedManifest ? "Browser-rendered STL" : "Unavailable"}
              </strong>
            </div>
            <div>
              <span>State</span>
              <strong>
                {previewStatusLabel(
                  Boolean(selectedManifest),
                  previewLoadState,
                )}
              </strong>
            </div>
          </div>
          <ModelSourcePanel
            projectId={projectId}
            revisionId={selectedManifest?.revisionId}
            sourceHash={selectedManifest?.sourceHash}
            revisionLabel={selectedLabel}
          />
          <div className="model-actions">
            <RevisionHistory
              revisions={state.revisions}
              currentRevision={state.currentRevision}
              selectedRevision={state.selectedRevision}
              disabled={
                isMcpRendering ||
                state.active ||
                restorePending ||
                previewLoadState !== "ready"
              }
              onSelect={(revisionId) =>
                dispatch({ type: "select_revision", revisionId })
              }
              onRestore={(revisionId) => void restore(revisionId)}
            />
            <div className="export-controls">
              <label htmlFor="export-format">Download format</label>
              <select
                id="export-format"
                value={exportFormat}
                onChange={(event) => {
                  setExportFormat(event.target.value as DownloadFormat);
                  setExportState("idle");
                }}
                disabled={
                  isMcpRendering ||
                  !currentManifest ||
                  state.active ||
                  exportState === "preparing"
                }
              >
                <option value="stl">STL</option>
                <option value="glb">GLB</option>
                <option value="3mf">3MF</option>
              </select>
              <button
                type="button"
                className="export-button"
                onClick={() => void exportCurrent()}
                disabled={
                  isMcpRendering ||
                  !currentManifest ||
                  state.active ||
                  exportState === "preparing"
                }
                aria-describedby="export-help"
              >
                {exportState === "preparing"
                  ? `Preparing ${exportFormat.toUpperCase()}…`
                  : `Download ${currentLabel}`}
              </button>
            </div>
          </div>
          <p id="export-help" className="action-help">
            {currentManifest
              ? `${currentLabel} · ${exportFormat.toUpperCase()} · generated locally in this browser`
              : "A current revision is required for export."}
          </p>
          {exportState === "failed" && (
            <p role="alert" className="notice notice-error">
              The export could not be verified. No file was downloaded.
            </p>
          )}
          {exportState === "complete" && (
            <p role="status" className="notice notice-success">
              Download started · {downloadReceipt?.filename} · SHA-256{" "}
              {downloadReceipt?.hash}
            </p>
          )}
        </section>

        {isSidebarChatEnabled && (
          <ChatPane
            turns={state.turns}
            hasCurrentRevision={Boolean(state.currentRevision)}
            active={state.active}
            available={
              !isMcpRendering &&
              !restorePending &&
              exportState !== "preparing" &&
              readiness === "ready" &&
              Boolean(sessionId)
            }
            collapsed={chatCollapsed}
            onToggleCollapsed={() => setChatCollapsed((value) => !value)}
            onSubmit={(message) => void submit(message)}
            onCancel={() => abortRef.current?.abort()}
            onRetry={() => void submit(lastMessage.current)}
            composerRef={composerRef}
          />
        )}
      </div>
      {state.notice && (
        <div className="global-notice" role="alert">
          {state.notice}
        </div>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {state.announcement && (
          <span key={state.announcement.key}>{state.announcement.text}</span>
        )}
      </div>
    </main>
  );
}
