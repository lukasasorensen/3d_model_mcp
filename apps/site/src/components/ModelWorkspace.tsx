"use client";
import { exportFilename } from "@rjls/contracts";

import { BROWSER_RENDERER, projectListSchema, revisionManifestSchema, type ChatEvent, type ProjectSummary } from "@rjls/contracts";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { ChatPane } from "./ChatPane";
import { ModelSourcePanel } from "./ModelSourcePanel";
import { RevisionHistory } from "./RevisionHistory";
import type { PreviewLoadState } from "./ModelViewer";
import { initialWorkspaceState, revisionLabel, workspaceReducer } from "@/lib/workspace-state";
import { createProjectSnapshotLoader } from "@/lib/project-snapshot-loader";
import { useBrowserPresence } from "@/lib/use-browser-presence";
import { useProjectEvents } from "@/lib/use-project-events";
import { useMcpBrowserRenderer } from "@/lib/use-mcp-browser-renderer";
import { streamChat } from "@/lib/stream-client";
import { completeBrowserRender, downloadGeneratedBytes, fetchRevisionSource, generateDownload, type DownloadFormat } from "@/lib/browser-renderer";

const ModelViewer = dynamic(() => import("./ModelViewer").then((module) => module.ModelViewer), { ssr: false, loading: () => <div className="viewer-loading">Preparing 3D viewer…</div> });
const SESSION_KEY_PREFIX = "rjls-cad-session:";
const activeObjectUrls = new Set<string>();

function newOpaqueId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }

export function releaseObjectUrl(objectUrl: string): void {
  if (!activeObjectUrls.delete(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
}

export function trackObjectUrl(objectUrl: string): string {
  activeObjectUrls.add(objectUrl);
  return objectUrl;
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

export function ModelWorkspace({ projectId, localMcpBridgeEnabled = false, remoteMcpEnabled = false }: { projectId: string; localMcpBridgeEnabled?: boolean; remoteMcpEnabled?: boolean }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const [readiness, setReadiness] = useState<"checking" | "ready" | "unavailable">("checking");
  const [downloadReceipt, setDownloadReceipt] = useState<{filename:string;hash:string} | undefined>();
  const [exportState, setExportState] = useState<"idle" | "preparing" | "failed" | "complete">("idle");
  const [exportFormat, setExportFormat] = useState<DownloadFormat>("stl");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [previewLoadState, setPreviewLoadState] = useState<PreviewLoadState>("empty");
  const abortRef = useRef<AbortController | undefined>(undefined);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastMessage = useRef("");
  const wasActive = useRef(false);
  const [sessionId, setSessionId] = useState("");

  const snapshotLoader = useRef<ReturnType<typeof createProjectSnapshotLoader> | undefined>(undefined);
  useEffect(() => {
    const loader = createProjectSnapshotLoader(projectId, (snapshot) => dispatch({ type: "hydrate", ...snapshot }));
    snapshotLoader.current = loader;
    return () => { loader.close(); if (snapshotLoader.current === loader) snapshotLoader.current = undefined; };
  }, [projectId]);
  const refreshProject = useCallback(() => snapshotLoader.current?.refresh() ?? Promise.resolve(false), []);
  const { renderWake, syncStatus, presenceWake } = useProjectEvents(projectId, refreshProject);

  const checkRuntime = useCallback(async () => {
    const [readinessResponse, rendererResponse] = await Promise.all([
      fetch("/v1/readiness", { cache: "no-store" }),
      fetch("/vendor/openscad/manifest.json", { cache: "force-cache" }),
    ]);
    let rendererReady = false;
    if (rendererResponse.ok) {
      const manifest = await rendererResponse.json().catch(() => undefined) as { openscadArchiveSha256?: string; bosl2ArchiveSha256?: string } | undefined;
      rendererReady = manifest?.openscadArchiveSha256 === BROWSER_RENDERER.openscadArchiveSha256 && manifest.bosl2ArchiveSha256 === BROWSER_RENDERER.bosl2ArchiveSha256;
    }
    setReadiness(readinessResponse.ok && rendererReady ? "ready" : "unavailable");
  }, []);

  const refreshProjects = useCallback(async () => {
    const response = await fetch("/v1/projects", { cache: "no-store" });
    if (!response.ok) return;
    const parsed = projectListSchema.safeParse(await response.json());
    if (!parsed.success) return;
    setProjects(parsed.data.projects);
  }, [projectId]);

  useEffect(() => {
    const sessionKey = `${SESSION_KEY_PREFIX}${projectId}`;
    const existing = sessionStorage.getItem(sessionKey);
    if (existing) setSessionId(existing);
    else {
      const created = newOpaqueId("session");
      sessionStorage.setItem(sessionKey, created);
      setSessionId(created);
    }
    void Promise.all([refreshProject(), refreshProjects(), checkRuntime()]);
    return () => abortRef.current?.abort();
  }, [checkRuntime, projectId, refreshProject, refreshProjects]);

  const { isRendering: isMcpRendering, status: mcpStatus, acquire: acquireRenderer, release: releaseRenderer } = useMcpBrowserRenderer({
    projectId, sessionId, localEnabled: localMcpBridgeEnabled, remoteEnabled: remoteMcpEnabled,
    isAvailable: !restorePending && exportState !== "preparing" && readiness === "ready",
    renderWake,
  });

  useBrowserPresence({ projectId, sessionId, ready: readiness === "ready", busy: isMcpRendering || restorePending || exportState === "preparing", localEnabled: localMcpBridgeEnabled, remoteEnabled: remoteMcpEnabled, presenceWake });

  const submit = useCallback(async (message: string) => {
    if (!sessionId || !(await acquireRenderer())) return;
    releaseRenderer();
    lastMessage.current = message;
    const requestId = newOpaqueId("turn");
    dispatch({ type: "submit", id: requestId, text: message });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat({ version: "3", projectId, sessionId, message }, controller.signal, async (event: ChatEvent) => {
        if (event.type === "revision" && (event.status === "current" || event.status === "candidate_promoted")) void refreshProject();
        else dispatch({ type: "event", event });
        if (event.type === "export_ready") {
          const anchor=document.createElement("a"); anchor.href=event.export.downloadUrl; anchor.download=event.export.filename; anchor.referrerPolicy="no-referrer"; anchor.click();
          setDownloadReceipt(event.export); setExportState("complete");
        } else if (event.type === "browser_render_request") {
          if (!(await acquireRenderer())) throw new Error("Browser renderer is busy.");
          try { await completeBrowserRender(event); } finally { releaseRenderer(); }
        }
      });
      await refreshProject();
    } catch (error) {
      if (controller.signal.aborted) {
        dispatch({ type: "local_error", message: "The request was cancelled. The current revision is unchanged." });
      } else dispatch({ type: "local_error", message: error instanceof Error ? error.message : "The request failed safely." });
    } finally {
      abortRef.current = undefined;
    }
  }, [projectId, refreshProject, sessionId, state.revisions, acquireRenderer, releaseRenderer]);

  useLayoutEffect(() => {
    const available = readiness === "ready" && Boolean(sessionId);
    if (shouldRestoreComposerFocus(wasActive.current, state.active, available)) composerRef.current?.focus();
    wasActive.current = state.active;
  }, [readiness, sessionId, state.active]);

  const restore = async (revisionId: string) => {
    if (!(await acquireRenderer())) return;
    setRestorePending(true);
    try {
      const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/restore`, { method: "POST" });
      const raw = await response.json() as { revision?: unknown };
      const revision = revisionManifestSchema.safeParse(raw.revision);
      if (!response.ok || !revision.success) throw new Error("Restore failed");
      await refreshProject();
    } catch { dispatch({ type: "local_error", message: "The historical revision could not be restored safely." }); }
    finally { setRestorePending(false); releaseRenderer(); }
  };

  const currentLabel = revisionLabel(state.revisions, state.currentRevision);
  const selectedLabel = revisionLabel(state.revisions, state.selectedRevision);
  const promotionPending = Boolean(state.pendingCurrentRevision);
  const selectedManifest = state.revisions.find((revision) => revision.revisionId === state.selectedRevision);
  const currentManifest = state.revisions.find((revision) => revision.revisionId === state.currentRevision);
  const dimensions = selectedManifest?.geometry?.dimensions.map(value => Number(value.toFixed(2))).join(" × ") ?? "—";
  let readinessLabel = "CAD runtime unavailable";
  if (readiness === "checking") readinessLabel = "Checking CAD project…";
  else if (readiness === "ready") readinessLabel = "CAD runtime ready";

  let currentBadgeLabel = `Current · ${currentLabel}`;
  if (promotionPending) {
    currentBadgeLabel = state.selectedRevision
      ? `Updating · showing last-known-valid ${selectedLabel}`
      : "Promoting first revision";
  }

  const exportCurrent = async () => {
    if (!currentManifest || !(await acquireRenderer())) return;
    setExportState("preparing");
    try {
      const source = await fetchRevisionSource(projectId, currentManifest.revisionId, currentManifest.sourceHash);
      const generated = await generateDownload(source, exportFormat);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(generated.bytes))), byte => byte.toString(16).padStart(2,"0")).join("");
      const filename = exportFilename(projects.find(project => project.projectId === projectId)?.name ?? "model",projectId,currentManifest.revisionId,hash,generated.extension);
      downloadGeneratedBytes(generated.bytes, generated.mimeType, filename);
      setDownloadReceipt({filename,hash});
      setExportState("complete");
    }
    catch { setExportState("failed"); }
    finally { releaseRenderer(); }
  };

  return (
    <main className="app-shell" data-testid="cad-workspace">
      <a className="skip-link" href="#conversation-heading">Skip to conversation</a>
      <header className="app-header">
        <div className="brand-mark"><span aria-hidden="true">R</span><div><strong>RJLS Conversational CAD</strong><small>Precision workshop</small></div></div>
        <div className="header-controls">
          <button type="button" onClick={() => router.push("/projects")} disabled={isMcpRendering || state.active || restorePending || exportState === "preparing"}>All projects</button>
          <label className="project-selector">Project<span className="sr-only"> selector</span><select value={projectId} onChange={(event) => router.push(`/projects/${encodeURIComponent(event.target.value)}`)} disabled={isMcpRendering || state.active || restorePending || exportState === "preparing"}>{projects.length === 0 && <option value={projectId}>{projectId}</option>}{projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.name}</option>)}</select></label>
          <div className="header-status"><span className={`readiness-dot readiness-${readiness}`} aria-hidden="true" /><span>{readinessLabel}</span><code>mm · Z up</code></div>
        </div>
      </header>

      <div className={`workspace-grid ${chatCollapsed ? "chat-collapsed" : ""}`}>
        <section className="model-pane" aria-labelledby="model-heading">
          <div className="pane-heading">
            <div><p className="eyebrow">Model inspection</p><h1 id="model-heading">{state.selectedRevision ? `Inspecting ${selectedLabel}` : "No model yet"}</h1></div>
            <div className="revision-badges"><span className="current-badge">{currentBadgeLabel}</span>{!promotionPending && state.selectedRevision !== state.currentRevision && <span>Viewing · {selectedLabel}</span>}</div>
          </div>
          {syncStatus && <p className="notice" role="status">{syncStatus}</p>}
          {(localMcpBridgeEnabled || remoteMcpEnabled) && <p className="notice" role="status">{mcpStatus || "Ready for Codex. Keep this project tab visible during validation."}</p>}
          <div className="revision-rail" aria-hidden="true"><span className={state.active ? "rail-working" : ""} /></div>
          {promotionPending && <p className="notice" role="status">{promotionStatusLabel(selectedLabel, Boolean(state.selectedRevision))}</p>}
          <ModelViewer projectId={projectId} revisionId={selectedManifest?.revisionId} sourceHash={selectedManifest?.sourceHash} currentLabel={selectedLabel} updating={state.active} onLoadStateChange={setPreviewLoadState} />
          <div className="model-facts" aria-label="Model facts">
            <div><span>Revision</span><strong>{selectedLabel}</strong></div>
            <div><span>Bounds</span><strong>{dimensions} mm</strong></div>
            <div><span>Preview</span><strong>{selectedManifest ? "Browser-rendered STL" : "Unavailable"}</strong></div>
            <div><span>State</span><strong>{previewStatusLabel(Boolean(selectedManifest), previewLoadState)}</strong></div>
          </div>
          <ModelSourcePanel projectId={projectId} revisionId={selectedManifest?.revisionId} sourceHash={selectedManifest?.sourceHash} revisionLabel={selectedLabel} />
          <div className="model-actions">
            <RevisionHistory revisions={state.revisions} currentRevision={state.currentRevision} selectedRevision={state.selectedRevision} disabled={isMcpRendering || state.active || restorePending || previewLoadState !== "ready"} onSelect={(revisionId) => dispatch({ type: "select_revision", revisionId })} onRestore={(revisionId) => void restore(revisionId)} />
            <div className="export-controls">
              <label htmlFor="export-format">Download format</label>
              <select id="export-format" value={exportFormat} onChange={(event) => { setExportFormat(event.target.value as DownloadFormat); setExportState("idle"); }} disabled={isMcpRendering || !currentManifest || state.active || exportState === "preparing"}><option value="stl">STL</option><option value="glb">GLB</option><option value="3mf">3MF</option></select>
              <button type="button" className="export-button" onClick={() => void exportCurrent()} disabled={isMcpRendering || !currentManifest || state.active || exportState === "preparing"} aria-describedby="export-help">{exportState === "preparing" ? `Preparing ${exportFormat.toUpperCase()}…` : `Download ${currentLabel}`}</button>
            </div>
          </div>
          <p id="export-help" className="action-help">{currentManifest ? `${currentLabel} · ${exportFormat.toUpperCase()} · generated locally in this browser` : "A current revision is required for export."}</p>
          {exportState === "failed" && <p role="alert" className="notice notice-error">The export could not be verified. No file was downloaded.</p>}
          {exportState === "complete" && <p role="status" className="notice notice-success">Download started · {downloadReceipt?.filename} · SHA-256 {downloadReceipt?.hash}</p>}
        </section>

        <ChatPane turns={state.turns} hasCurrentRevision={Boolean(state.currentRevision)} active={state.active} available={!isMcpRendering && !restorePending && exportState !== "preparing" && readiness === "ready" && Boolean(sessionId)} collapsed={chatCollapsed} onToggleCollapsed={() => setChatCollapsed((value) => !value)} onSubmit={(message) => void submit(message)} onCancel={() => abortRef.current?.abort()} onRetry={() => void submit(lastMessage.current)} composerRef={composerRef} />
      </div>
      {state.notice && <div className="global-notice" role="alert">{state.notice}</div>}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{state.announcement && <span key={state.announcement.key}>{state.announcement.text}</span>}</div>
    </main>
  );
}
