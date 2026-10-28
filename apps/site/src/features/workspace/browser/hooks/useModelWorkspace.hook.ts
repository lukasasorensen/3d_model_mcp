"use client";
import { exportFilename } from "@theoryfoundry/contracts";

import {
  BROWSER_RENDERER,
  projectListSchema,
  revisionManifestSchema,
  type ChatEvent,
  type ProjectSummary,
} from "@theoryfoundry/contracts";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  completeBrowserRender,
  useBrowserPresence,
  useBrowserRenderer,
} from "../../../browser-rendering/browser/index";
import { streamChat, useSidebarChat } from "../../../chat/browser/index";
import type { PreviewLoadState } from "../../../model-preview/browser/index";
import { useProjectEvents } from "../../../project-events/browser/index";
import { useMcpBrowserRenderer } from "../hooks/useMcpBrowserRenderer.hook";
import { createProjectSnapshotLoader } from "../services/projectSnapshotLoader.service";
import {
  initialWorkspaceState,
  workspaceReducer,
} from "../utils/workspaceState.util";

import {
  downloadGeneratedBytes,
  type DownloadFormat,
} from "../../../exports/browser/index";
import { fetchRevisionSource } from "../../../model-preview/browser/index";

import {
  newOpaqueId,
  shouldRestoreComposerFocus,
} from "../utils/workspacePresentation.util";
const SESSION_KEY_PREFIX = "theoryfoundry-cad-session:";
export function useModelWorkspace({
  projectId,
  localMcpBridgeEnabled = false,
  remoteMcpEnabled = false,
}: {
  projectId: string;
  localMcpBridgeEnabled?: boolean;
  remoteMcpEnabled?: boolean;
}) {
  const { renderPreview, generateDownload } = useBrowserRenderer();
  const router = useRouter();
  const isSidebarChatEnabled = useSidebarChat();
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const [readiness, setReadiness] = useState<
    "checking" | "ready" | "unavailable"
  >("checking");
  const [downloadReceipt, setDownloadReceipt] = useState<
    { filename: string; hash: string } | undefined
  >();
  const [exportState, setExportState] = useState<
    "idle" | "preparing" | "failed" | "complete"
  >("idle");
  const [exportFormat, setExportFormat] = useState<DownloadFormat>("stl");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [previewLoadState, setPreviewLoadState] =
    useState<PreviewLoadState>("empty");
  const abortRef = useRef<AbortController | undefined>(undefined);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastMessage = useRef("");
  const wasActive = useRef(false);
  const [sessionId, setSessionId] = useState("");

  const snapshotLoader = useRef<
    ReturnType<typeof createProjectSnapshotLoader> | undefined
  >(undefined);
  useEffect(() => {
    const loader = createProjectSnapshotLoader(projectId, (snapshot) =>
      dispatch({ type: "hydrate", ...snapshot }),
    );
    snapshotLoader.current = loader;
    return () => {
      loader.close();
      if (snapshotLoader.current === loader) snapshotLoader.current = undefined;
    };
  }, [projectId]);
  const refreshProject = useCallback(
    () => snapshotLoader.current?.refresh() ?? Promise.resolve(false),
    [],
  );
  const { renderWake, syncStatus, presenceWake } = useProjectEvents(
    projectId,
    refreshProject,
  );

  const checkRuntime = useCallback(async () => {
    const [readinessResponse, rendererResponse] = await Promise.all([
      fetch("/v1/readiness", { cache: "no-store" }),
      fetch("/vendor/openscad/manifest.json", { cache: "force-cache" }),
    ]);
    let rendererReady = false;
    if (rendererResponse.ok) {
      const manifest = (await rendererResponse
        .json()
        .catch(() => undefined)) as
        | { openscadArchiveSha256?: string; bosl2ArchiveSha256?: string }
        | undefined;
      rendererReady =
        manifest?.openscadArchiveSha256 ===
          BROWSER_RENDERER.openscadArchiveSha256 &&
        manifest.bosl2ArchiveSha256 === BROWSER_RENDERER.bosl2ArchiveSha256;
    }
    setReadiness(
      readinessResponse.ok && rendererReady ? "ready" : "unavailable",
    );
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

  const {
    isRendering: isMcpRendering,
    status: mcpStatus,
    acquire: acquireRenderer,
    release: releaseRenderer,
  } = useMcpBrowserRenderer({
    projectId,
    sessionId,
    localEnabled: localMcpBridgeEnabled,
    remoteEnabled: remoteMcpEnabled,
    isAvailable:
      !restorePending && exportState !== "preparing" && readiness === "ready",
    renderWake,
  });

  useBrowserPresence({
    projectId,
    sessionId,
    ready: readiness === "ready",
    busy: isMcpRendering || restorePending || exportState === "preparing",
    localEnabled: localMcpBridgeEnabled,
    remoteEnabled: remoteMcpEnabled,
    presenceWake,
  });

  const submit = useCallback(
    async (message: string) => {
      if (!isSidebarChatEnabled || !sessionId || !(await acquireRenderer()))
        return;
      releaseRenderer();
      lastMessage.current = message;
      const requestId = newOpaqueId("turn");
      dispatch({ type: "submit", id: requestId, text: message });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamChat(
          { version: "3", projectId, sessionId, message },
          controller.signal,
          async (event: ChatEvent) => {
            if (
              event.type === "revision" &&
              (event.status === "current" ||
                event.status === "candidate_promoted")
            )
              void refreshProject();
            else dispatch({ type: "event", event });
            if (event.type === "export_ready") {
              const anchor = document.createElement("a");
              anchor.href = event.export.downloadUrl;
              anchor.download = event.export.filename;
              anchor.referrerPolicy = "no-referrer";
              anchor.click();
              setDownloadReceipt(event.export);
              setExportState("complete");
            } else if (event.type === "browser_render_request") {
              if (!(await acquireRenderer()))
                throw new Error("Browser renderer is busy.");
              try {
                await completeBrowserRender(renderPreview, event);
              } finally {
                releaseRenderer();
              }
            }
          },
        );
        await refreshProject();
      } catch (error) {
        if (controller.signal.aborted) {
          dispatch({
            type: "local_error",
            message:
              "The request was cancelled. The current revision is unchanged.",
          });
        } else
          dispatch({
            type: "local_error",
            message:
              error instanceof Error
                ? error.message
                : "The request failed safely.",
          });
      } finally {
        abortRef.current = undefined;
      }
    },
    [
      isSidebarChatEnabled,
      projectId,
      refreshProject,
      sessionId,
      state.revisions,
      acquireRenderer,
      releaseRenderer,
      renderPreview,
    ],
  );

  useEffect(() => {
    if (!isSidebarChatEnabled) abortRef.current?.abort();
  }, [isSidebarChatEnabled]);

  useLayoutEffect(() => {
    const available = readiness === "ready" && Boolean(sessionId);
    if (shouldRestoreComposerFocus(wasActive.current, state.active, available))
      composerRef.current?.focus();
    wasActive.current = state.active;
  }, [readiness, sessionId, state.active]);

  const restore = async (revisionId: string) => {
    if (!(await acquireRenderer())) return;
    setRestorePending(true);
    try {
      const response = await fetch(
        `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
        { method: "POST" },
      );
      const raw = (await response.json()) as { revision?: unknown };
      const revision = revisionManifestSchema.safeParse(raw.revision);
      if (!response.ok || !revision.success) throw new Error("Restore failed");
      await refreshProject();
    } catch {
      dispatch({
        type: "local_error",
        message: "The historical revision could not be restored safely.",
      });
    } finally {
      setRestorePending(false);
      releaseRenderer();
    }
  };

  const currentLabel = revisionLabel(state.revisions, state.currentRevision);
  const selectedLabel = revisionLabel(state.revisions, state.selectedRevision);
  const promotionPending = Boolean(state.pendingCurrentRevision);
  const selectedManifest = state.revisions.find(
    (revision) => revision.revisionId === state.selectedRevision,
  );
  const currentManifest = state.revisions.find(
    (revision) => revision.revisionId === state.currentRevision,
  );
  const dimensions =
    selectedManifest?.geometry?.dimensions
      .map((value) => Number(value.toFixed(2)))
      .join(" × ") ?? "—";
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
      const source = await fetchRevisionSource(
        projectId,
        currentManifest.revisionId,
        currentManifest.sourceHash,
      );
      const generated = await generateDownload(source, exportFormat);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(generated.bytes),
          ),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const filename = exportFilename(
        projects.find((project) => project.projectId === projectId)?.name ??
          "model",
        projectId,
        currentManifest.revisionId,
        hash,
        generated.extension,
      );
      downloadGeneratedBytes(generated.bytes, generated.mimeType, filename);
      setDownloadReceipt({ filename, hash });
      setExportState("complete");
    } catch {
      setExportState("failed");
    } finally {
      releaseRenderer();
    }
  };

  return {
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
  };
}

import { revisionLabel } from "../utils/workspaceRevision.util";
