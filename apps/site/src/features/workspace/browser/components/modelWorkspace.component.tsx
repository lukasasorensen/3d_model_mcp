"use client";
import { useId, type JSX } from "react";

import dynamic from "next/dynamic";
import { ChatPane } from "../../../chat/browser/index";
import { ModelSourcePanel } from "../../../model-preview/browser/index";
import { ConnectToCodex } from "../../../onboarding/browser/index";
import { RevisionHistory } from "./revisionHistory.component";
import { WorkspaceStatusToast } from "./workspaceStatusToast.component";

import { type DownloadFormat } from "../../../exports/browser/index";

import { useWorkspaceSection } from "../hooks/useWorkspaceSection.hook";
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
  localWorkerAvailable = false,
}: {
  projectId: string;
  localMcpBridgeEnabled?: boolean;
  remoteMcpEnabled?: boolean;
  codexOrigin?: string | undefined;
  localWorkerAvailable?: boolean;
}): JSX.Element {
  const projectSelectorId = useId();
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
  const { mobile, section, selectSection } =
    useWorkspaceSection(isSidebarChatEnabled);
  return (
    <main
      className="app-shell"
      data-testid="cad-workspace"
      data-section={section}
    >
      <a
        className="skip-link"
        href="#model-heading"
        onClick={() => selectSection("model", false)}
      >
        Skip to model
      </a>
      <header className="app-header">
        <div className="brand-mark">
          <span aria-hidden="true">T</span>
          <div>
            <strong>TheoryFoundry</strong>
          </div>
        </div>
        <div className="header-controls">
          {remoteMcpEnabled && codexOrigin && (
            <ConnectToCodex
              origin={codexOrigin}
              projectId={projectId}
              localWorkerAvailable={localWorkerAvailable}
            />
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
          <div className="project-selector">
            <label htmlFor={projectSelectorId}>
              Project<span className="sr-only"> selector</span>
            </label>
            <select
              id={projectSelectorId}
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
          </div>
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

      <nav className="workspace-sections" aria-label="Workspace sections">
        {(
          [
            "model",
            ...(isSidebarChatEnabled ? (["conversation"] as const) : []),
            "details",
          ] as const
        ).map((destination) => (
          <button
            id={`workspace-${destination}-button`}
            key={destination}
            type="button"
            aria-pressed={section === destination}
            aria-controls={
              destination === "conversation"
                ? "conversation-panel"
                : `${destination}-panel`
            }
            onClick={() => selectSection(destination)}
          >
            {destination === "model"
              ? "Model"
              : destination === "conversation"
                ? "Conversation"
                : "Details"}
          </button>
        ))}
      </nav>
      <div
        className={`workspace-grid ${!isSidebarChatEnabled ? "chat-hidden" : chatCollapsed && !mobile ? "chat-collapsed" : ""}`}
      >
        <section className="model-pane" aria-labelledby="model-heading">
          <div className="pane-heading">
            <div>
              <h1 id="model-heading" tabIndex={-1}>
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
          <div
            className="workspace-toasts"
            aria-label="Workspace notifications"
          >
            {[
              syncStatus,
              (localMcpBridgeEnabled || remoteMcpEnabled) &&
                (mcpStatus ||
                  "Ready for Codex. Keep this project tab visible during validation."),
              promotionPending &&
                promotionStatusLabel(
                  selectedLabel,
                  Boolean(state.selectedRevision),
                ),
              (state.active || restorePending || exportState === "preparing") &&
                (restorePending
                  ? "Restoring as a new revision…"
                  : exportState === "preparing"
                    ? `Preparing ${exportFormat.toUpperCase()}…`
                    : "Working on your request…"),
            ].map(
              (message, index) =>
                message && (
                  <WorkspaceStatusToast
                    key={`${index}:${message}`}
                    message={message}
                  />
                ),
            )}
          </div>
          {mobile && section !== "model" && previewLoadState === "error" && (
            <p className="notice notice-error" role="alert">
              The model preview could not be loaded.{" "}
              <button type="button" onClick={() => selectSection("model")}>
                View model
              </button>
            </p>
          )}
          {mobile &&
            isSidebarChatEnabled &&
            section !== "conversation" &&
            state.turns.at(-1)?.outcome === "failed" && (
              <p className="notice notice-error" role="alert">
                The last request failed.{" "}
                <button
                  type="button"
                  onClick={() => selectSection("conversation")}
                >
                  View conversation
                </button>
              </p>
            )}
          <div id="model-panel" className="model-primary">
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
                <span>Dimensions · mm</span>
                <strong>{dimensions}</strong>
              </div>
              <div>
                <span>Preview</span>
                <strong>
                  {previewStatusLabel(
                    Boolean(selectedManifest),
                    previewLoadState,
                  )}
                </strong>
              </div>
            </div>
            <div className="model-actions">
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
                    : `Download ${exportFormat.toUpperCase()} · ${currentLabel}`}
                </button>
              </div>
            </div>
            <p id="export-help" className="action-help">
              {currentManifest
                ? `${currentLabel} · ${exportFormat.toUpperCase()} · generated locally in this browser`
                : "A current revision is required for export."}
            </p>
          </div>
          {exportState === "failed" && (
            <p role="alert" className="notice notice-error">
              The export could not be verified. No file was downloaded.
            </p>
          )}
          {exportState === "complete" && (
            <div className="notice notice-success">
              <p role="status">
                Download started · {downloadReceipt?.filename}
              </p>
              <details>
                <summary>Download verification</summary>
                <p>SHA-256: {downloadReceipt?.hash}</p>
              </details>
            </div>
          )}
          <section
            id="details-panel"
            className="model-details"
            aria-label="Revision details"
          >
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
            <ModelSourcePanel
              projectId={projectId}
              revisionId={selectedManifest?.revisionId}
              sourceHash={selectedManifest?.sourceHash}
              revisionLabel={selectedLabel}
            />
          </section>
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
            collapsed={chatCollapsed && !mobile}
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
