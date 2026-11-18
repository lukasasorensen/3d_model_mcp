"use client";

import { useId, type JSX } from "react";

import dynamic from "next/dynamic";
import { ChatPane, ChatModelPicker } from "../../../chat/browser/index";
import { ModelSourcePanel } from "../../../model-preview/browser/index";
import {
  type HostedInstallations,
  ConnectToCodex,
} from "../../../onboarding/browser/index";
import { WorkspaceEditingControls } from "./workspaceEditingControls.component";
import { RevisionHistory } from "./revisionHistory.component";
import { WorkspaceStatusToast } from "./workspaceStatusToast.component";

import { WorkingEditingControls } from "../../../working-model/browser/index";
import { WorkspaceModelSummary } from "./workspaceModelSummary.component";

import { useWorkspaceSection } from "../hooks/useWorkspaceSection.hook";
import { useModelWorkspace } from "../hooks/useModelWorkspace.hook";
import { promotionStatusLabel } from "../utils/workspacePresentation.util";
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
  draftOwnerId,
  localMcpBridgeEnabled = false,
  remoteMcpEnabled = false,
  codexOrigin,
  localWorkerAvailable = false,
  installations,
}: {
  projectId: string;
  draftOwnerId?: string | undefined;
  localMcpBridgeEnabled?: boolean;
  remoteMcpEnabled?: boolean;
  codexOrigin?: string | undefined;
  localWorkerAvailable?: boolean;
  installations?: HostedInstallations | undefined;
}): JSX.Element {
  const projectSelectorId = useId();
  const {
    router,
    aiSelection,
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
    parameterPending,
    setParameterPending,
    acquireRenderer,
    releaseRenderer,
    refreshProject,
    renderParameters,
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
    workingModel,
  } = useModelWorkspace({
    projectId,
    draftOwnerId,
    localMcpBridgeEnabled,
    remoteMcpEnabled,
  });
  const { mobile, section, selectSection } =
    useWorkspaceSection(isSidebarChatEnabled);
  const exportFormatLabel = exportFormat.toUpperCase();
  const controlOptions = {
    projectId,
    currentRevision: state.currentRevision,
    selectedRevision: state.selectedRevision,
    selectedSourceHash: selectedManifest?.sourceHash,
    sessionId,
    disabled:
      state.active ||
      restorePending ||
      isMcpRendering ||
      exportState === "preparing" ||
      readiness !== "ready" ||
      !sessionId ||
      promotionPending,
    acquire: acquireRenderer,
    release: releaseRenderer,
    render: renderParameters,
    refresh: refreshProject,
  };
  const draftVisible = workingModel?.showingDraft === true;
  const previewBase = draftVisible
    ? state.revisions.find(
        (revision) => revision.revisionId === workingModel.parent,
      )
    : selectedManifest;
  const displayLabel = draftVisible ? "Working model" : selectedLabel;
  const draftDimensions = workingModel?.preview?.geometry.dimensions
    .map((value) => Number(value.toFixed(2)))
    .join(" × ");
  const renderViewport: Parameters<
    typeof WorkspaceEditingControls
  >[0]["renderViewport"] = (editing) => (
    <ModelViewer
      {...editing}
      projectId={projectId}
      revisionId={
        previewBase?.revisionId ??
        (draftVisible ? (workingModel.parent ?? undefined) : undefined)
      }
      sourceHash={
        previewBase?.sourceHash ??
        (draftVisible
          ? (workingModel.base?.objects.sourceHash ?? undefined)
          : undefined)
      }
      previewBytes={workingModel?.preview?.bytes}
      currentLabel={displayLabel}
      updating={state.active || parameterPending}
      onLoadStateChange={setPreviewLoadState}
    />
  );
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
            <strong>3d AI MCP Server | TheoryFoundry</strong>
          </div>
        </div>
        <div className="header-controls">
          {remoteMcpEnabled && codexOrigin && (
            <ConnectToCodex
              origin={codexOrigin}
              projectId={projectId}
              localWorkerAvailable={localWorkerAvailable}
              installations={installations}
            />
          )}
          <button
            type="button"
            onClick={() => {
              if (workingModel?.beforeLeave() !== false)
                router.push("/projects");
            }}
            disabled={
              parameterPending ||
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
              onChange={(event) => {
                if (workingModel?.beforeLeave() !== false)
                  router.push(
                    "/projects/" + encodeURIComponent(event.target.value),
                  );
              }}
              disabled={
                parameterPending ||
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
                {draftVisible
                  ? displayLabel
                  : state.selectedRevision
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
                    ? `Preparing ${exportFormatLabel}…`
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
            {workingModel && state.hydrated ? (
              <WorkingEditingControls
                key={projectId}
                draft={workingModel}
                projectId={projectId}
                revision={previewBase?.revisionId ?? null}
                previewReady={previewLoadState === "ready"}
                renderViewport={renderViewport}
              />
            ) : (
              <WorkspaceEditingControls
                key={projectId}
                {...controlOptions}
                hydrated={state.hydrated === true}
                onPending={setParameterPending}
                previewReady={previewLoadState === "ready"}
                renderViewport={renderViewport}
              />
            )}
            <WorkspaceModelSummary
              active={state.active}
              hasModel={Boolean(previewBase)}
              hasCurrent={Boolean(currentManifest)}
              dimensions={draftVisible ? (draftDimensions ?? "—") : dimensions}
              selectedLabel={displayLabel}
              {...{
                currentLabel,
                previewLoadState,
                parameterPending,
                isMcpRendering,
                exportFormat,
                setExportFormat,
                exportState,
                setExportState,
                exportCurrent,
              }}
            />
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
                parameterPending ||
                isMcpRendering ||
                state.active ||
                restorePending ||
                previewLoadState !== "ready"
              }
              onSelect={(revisionId) => {
                workingModel?.inspect();
                dispatch({ type: "select_revision", revisionId });
              }}
              restoreUnavailable={workingModel?.dirty ?? false}
              inspectUnavailable={workingModel?.saving ?? false}
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
            unavailableReason={
              aiSelection.real && !aiSelection.available
                ? "Choose an available AI connection and model."
                : undefined
            }
            connectionPicker={
              <ChatModelPicker ai={aiSelection} disabled={state.active} />
            }
            turns={state.turns}
            hasCurrentRevision={Boolean(state.currentRevision)}
            active={state.active}
            available={
              !parameterPending &&
              !workingModel?.dirty &&
              !isMcpRendering &&
              !restorePending &&
              exportState !== "preparing" &&
              readiness === "ready" &&
              aiSelection.available &&
              Boolean(sessionId)
            }
            collapsed={chatCollapsed && !mobile}
            onToggleCollapsed={() => setChatCollapsed((value) => !value)}
            onSubmit={(message) => void submit(message)}
            onCancel={() => abortRef.current?.abort()}
            onRetry={() => void submit(lastMessage.current, true)}
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
