"use client";

import { projectStateSchema, revisionManifestSchema, type ArtifactManifest, type ChatEvent, type RevisionManifest } from "@rjls/contracts";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { ChatPane } from "./ChatPane";
import { RevisionHistory } from "./RevisionHistory";
import type { PreviewLoadState } from "./ModelViewer";
import { initialWorkspaceState, revisionLabel, validatedArtifactFor, workspaceReducer } from "@/lib/workspace-state";
import { streamChat } from "@/lib/stream-client";

const ModelViewer = dynamic(() => import("./ModelViewer").then((module) => module.ModelViewer), { ssr: false, loading: () => <div className="viewer-loading">Preparing 3D viewer…</div> });
const PROJECT_ID = "demo-project";
const SESSION_KEY = "rjls-cad-session";
const EXPORT_LIMIT = 25 * 1024 * 1024;
const activeObjectUrls = new Set<string>();

function newOpaqueId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }

async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function releaseObjectUrl(objectUrl: string): void {
  if (!activeObjectUrls.delete(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
}

export function trackObjectUrl(objectUrl: string): string {
  activeObjectUrls.add(objectUrl);
  return objectUrl;
}

export async function downloadValidatedExport(projectId: string, revisionLabelText: string, artifact: ArtifactManifest): Promise<void> {
  if (artifact.format !== "3mf" || artifact.mimeType !== "model/3mf" || artifact.byteSize > EXPORT_LIMIT) throw new Error("Export metadata failed validation.");
  const href = `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(artifact.sourceRevision)}/artifacts/${encodeURIComponent(artifact.artifactId)}`;
  const response = await fetch(href, { cache: "no-store" });
  if (!response.ok || response.headers.get("content-type") !== "model/3mf" || response.headers.get("x-rjls-artifact-revision") !== artifact.sourceRevision || response.headers.get("x-rjls-artifact-hash") !== artifact.hash) throw new Error("Export response failed validation.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.byteSize || bytes.byteLength > EXPORT_LIMIT || await digest(bytes) !== artifact.hash) throw new Error("Export integrity check failed.");
  const objectUrl = trackObjectUrl(URL.createObjectURL(new Blob([bytes], { type: artifact.mimeType })));
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `RJLS-${revisionLabelText}.3mf`;
    anchor.click();
  } finally {
    window.setTimeout(() => releaseObjectUrl(objectUrl), 0);
  }
}

export function shouldRestoreComposerFocus(wasActive: boolean, active: boolean, available: boolean): boolean {
  return wasActive && !active && available;
}

export function readinessFromProbe(response: Pick<Response, "ok">): "ready" | "unavailable" {
  return response.ok ? "ready" : "unavailable";
}

export function previewStatusLabel(hasPreview: boolean, loadState: PreviewLoadState): "Preview validated" | "Verifying preview" | "Preview unavailable" | "Blank project" {
  if (!hasPreview) return "Blank project";
  if (loadState === "ready") return "Preview validated";
  if (loadState === "loading") return "Verifying preview";
  return "Preview unavailable";
}

export function promotionStatusLabel(selectedLabel: string, hasSelectedRevision: boolean): string {
  return hasSelectedRevision
    ? `Updating—showing last-known-valid ${selectedLabel} until the promoted revision is verified for display.`
    : "Promoting the first validated revision. The viewer remains empty until it is verified for display.";
}

export function ModelWorkspace() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const [readiness, setReadiness] = useState<"checking" | "ready" | "unavailable">("checking");
  const [exportState, setExportState] = useState<"idle" | "preparing" | "failed" | "complete">("idle");
  const [restorePending, setRestorePending] = useState(false);
  const [previewLoadState, setPreviewLoadState] = useState<PreviewLoadState>("empty");
  const abortRef = useRef<AbortController>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastMessage = useRef("");
  const wasActive = useRef(false);
  const [sessionId, setSessionId] = useState("");

  const loadProject = useCallback(async () => {
    const [response, readinessResponse] = await Promise.all([
      fetch(`/v1/projects/${encodeURIComponent(PROJECT_ID)}`, { cache: "no-store" }),
      fetch("/v1/readiness", { cache: "no-store" }),
    ]);
    setReadiness(readinessFromProbe(readinessResponse));
    if (!response.ok) return false;
    const raw = await response.json() as { state?: unknown; revisions?: unknown };
    const project = projectStateSchema.safeParse(raw.state);
    const revisions = Array.isArray(raw.revisions) ? raw.revisions.map((item) => revisionManifestSchema.safeParse(item)) : [];
    if (!project.success || revisions.some((item) => !item.success)) return false;
    dispatch({ type: "hydrate", currentRevision: project.data.currentRevision, revisions: revisions.map((item) => item.data as RevisionManifest) });
    return true;
  }, []);

  useEffect(() => {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) setSessionId(existing);
    else {
      const created = newOpaqueId("session");
      sessionStorage.setItem(SESSION_KEY, created);
      setSessionId(created);
    }
    void loadProject();
    return () => abortRef.current?.abort();
  }, [loadProject]);

  const submit = useCallback(async (message: string) => {
    if (!sessionId) return;
    lastMessage.current = message;
    const requestId = newOpaqueId("turn");
    dispatch({ type: "submit", id: requestId, text: message });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({ version: "3", projectId: PROJECT_ID, sessionId, message }, controller.signal, (event: ChatEvent) => dispatch({ type: "event", event }));
      await loadProject();
    } catch (error) {
      if (controller.signal.aborted) {
        dispatch({ type: "local_error", message: "The request was cancelled. The current revision is unchanged." });
      } else dispatch({ type: "local_error", message: error instanceof Error ? error.message : "The request failed safely." });
    } finally {
      abortRef.current = undefined;
    }
  }, [loadProject, sessionId]);

  useLayoutEffect(() => {
    const available = readiness === "ready" && Boolean(sessionId);
    if (shouldRestoreComposerFocus(wasActive.current, state.active, available)) composerRef.current?.focus();
    wasActive.current = state.active;
  }, [readiness, sessionId, state.active]);

  const restore = async (revisionId: string) => {
    setRestorePending(true);
    try {
      const response = await fetch(`/v1/projects/${encodeURIComponent(PROJECT_ID)}/revisions/${encodeURIComponent(revisionId)}/restore`, { method: "POST" });
      const raw = await response.json() as { revision?: unknown };
      const revision = revisionManifestSchema.safeParse(raw.revision);
      if (!response.ok || !revision.success) throw new Error("Restore failed");
      dispatch({ type: "restored", revision: revision.data });
      await loadProject();
    } catch { dispatch({ type: "local_error", message: "The historical revision could not be restored safely." }); }
    finally { setRestorePending(false); }
  };

  const currentLabel = revisionLabel(state.revisions, state.currentRevision);
  const selectedLabel = revisionLabel(state.revisions, state.selectedRevision);
  const promotionPending = Boolean(state.pendingCurrentRevision);
  const selectedPreview = validatedArtifactFor(state.artifacts, state.revisions, state.selectedRevision, "stl");
  const currentExport = validatedArtifactFor(state.artifacts, state.revisions, state.currentRevision, "3mf");
  const previewBounds = selectedPreview?.boundingBox;
  const dimensions = previewBounds ? previewBounds.max.map((value, index) => Math.abs(value - previewBounds.min[index]).toFixed(1)).join(" × ") : "—";
  let readinessLabel = "Local runtime unavailable";
  if (readiness === "checking") readinessLabel = "Checking local project…";
  else if (readiness === "ready") readinessLabel = "Local runtime ready";

  let currentBadgeLabel = `Current · ${currentLabel}`;
  if (promotionPending) {
    currentBadgeLabel = state.selectedRevision
      ? `Updating · showing last-known-valid ${selectedLabel}`
      : "Promoting first revision";
  }

  const exportCurrent = async () => {
    if (!currentExport) return;
    setExportState("preparing");
    try { await downloadValidatedExport(PROJECT_ID, currentLabel, currentExport); setExportState("complete"); }
    catch { setExportState("failed"); }
  };

  return (
    <main className="app-shell" data-testid="cad-workspace">
      <a className="skip-link" href="#conversation-heading">Skip to conversation</a>
      <header className="app-header">
        <div className="brand-mark"><span aria-hidden="true">R</span><div><strong>RJLS Conversational CAD</strong><small>Precision workshop</small></div></div>
        <div className="header-status"><span className={`readiness-dot readiness-${readiness}`} aria-hidden="true" /><span>{readinessLabel}</span><code>mm · Z up</code></div>
      </header>

      <div className="workspace-grid">
        <section className="model-pane" aria-labelledby="model-heading">
          <div className="pane-heading">
            <div><p className="eyebrow">Model inspection</p><h1 id="model-heading">{state.selectedRevision ? `Inspecting ${selectedLabel}` : "No model yet"}</h1></div>
            <div className="revision-badges"><span className="current-badge">{currentBadgeLabel}</span>{!promotionPending && state.selectedRevision !== state.currentRevision && <span>Viewing · {selectedLabel}</span>}</div>
          </div>
          <div className="revision-rail" aria-hidden="true"><span className={state.active ? "rail-working" : ""} /></div>
          {promotionPending && <p className="notice" role="status">{promotionStatusLabel(selectedLabel, Boolean(state.selectedRevision))}</p>}
          <ModelViewer projectId={PROJECT_ID} artifact={selectedPreview} currentLabel={selectedLabel} updating={state.active} onLoadStateChange={setPreviewLoadState} />
          <div className="model-facts" aria-label="Model facts">
            <div><span>Revision</span><strong>{selectedLabel}</strong></div>
            <div><span>Bounds</span><strong>{dimensions} mm</strong></div>
            <div><span>Preview</span><strong>{selectedPreview ? `${(selectedPreview.byteSize / 1024).toFixed(1)} KiB · validated STL` : "Unavailable"}</strong></div>
            <div><span>State</span><strong>{previewStatusLabel(Boolean(selectedPreview), previewLoadState)}</strong></div>
          </div>
          <div className="model-actions">
            <RevisionHistory revisions={state.revisions} currentRevision={state.currentRevision} selectedRevision={state.selectedRevision} disabled={state.active || restorePending} onSelect={(revisionId) => dispatch({ type: "select_revision", revisionId })} onRestore={(revisionId) => void restore(revisionId)} />
            <button type="button" className="export-button" onClick={() => void exportCurrent()} disabled={!currentExport || state.active || exportState === "preparing"} aria-describedby="export-help">{exportState === "preparing" ? "Preparing 3MF…" : `Export ${currentLabel} as 3MF`}</button>
          </div>
          <p id="export-help" className="action-help">{currentExport ? `${currentLabel} · 3MF · millimeters · ${(currentExport.byteSize / 1024).toFixed(1)} KiB` : "A validated current 3MF artifact is required for export."}</p>
          {exportState === "failed" && <p role="alert" className="notice notice-error">The export could not be verified. No file was downloaded.</p>}
          {exportState === "complete" && <p role="status" className="notice notice-success">{currentLabel} · 3MF · millimeters downloaded.</p>}
        </section>

        <ChatPane turns={state.turns} hasCurrentRevision={Boolean(state.currentRevision)} active={state.active} available={readiness === "ready" && Boolean(sessionId)} onSubmit={(message) => void submit(message)} onCancel={() => abortRef.current?.abort()} onRetry={() => void submit(lastMessage.current)} composerRef={composerRef} />
      </div>
      {state.notice && <div className="global-notice" role="alert">{state.notice}</div>}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{state.announcement && <span key={state.announcement.key}>{state.announcement.text}</span>}</div>
    </main>
  );
}
