"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { localMcpBrowserRenderJobSchema, remoteMcpBrowserRenderJobSchema } from "@rjls/contracts";
import { BrowserRenderLease } from "./browser-render-lease";
import { completeLocalMcpBrowserRender, completeRemoteMcpBrowserRender } from "./browser-renderer";

export function useMcpBrowserRenderer(options: {
  projectId: string; sessionId: string; localEnabled: boolean; remoteEnabled: boolean;
  isAvailable: boolean; refreshProject: (signal?: AbortSignal) => Promise<boolean>;
}) {
  const { projectId, sessionId, localEnabled, remoteEnabled, isAvailable, refreshProject } = options;
  const lease = useRef(new BrowserRenderLease());
  const [isRendering, setIsRendering] = useState(false);
  const [status, setStatus] = useState("");
  const acquire = useCallback(() => lease.current.acquireForeground(), []);
  const tryBackground = useCallback(() => lease.current.tryBackground(), []);
  const release = useCallback(() => lease.current.release(), []);

  useEffect(() => {
    if ((!localEnabled && !remoteEnabled) || !sessionId || !isAvailable) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const schedule = () => { if (!stopped) timer = setTimeout(() => void poll(), 1_000); };
    const poll = async () => {
      if (stopped || document.visibilityState !== "visible" || !tryBackground()) { schedule(); return; }
      try {
        await refreshProject(controller.signal);
        const headers = { "x-rjls-session-id": sessionId };
        if (remoteEnabled) {
          const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/mcp-render-jobs/claim`, { method: "POST", headers, signal: controller.signal, cache: "no-store" });
          if (response.status === 200) {
            const parsed = remoteMcpBrowserRenderJobSchema.parse((await response.json()).job);
            setIsRendering(true); setStatus("Validating a model requested by Codex…");
            await completeRemoteMcpBrowserRender(parsed, sessionId, controller.signal);
            setStatus("Codex validation finished. Waiting for a revision update.");
            return;
          }
          if (response.status !== 204) throw new Error("Remote rendering is unavailable.");
        }
        if (localEnabled) {
          const response = await fetch(`/v1/local-mcp/browser-renders/next?projectId=${encodeURIComponent(projectId)}`, { headers, signal: controller.signal, cache: "no-store" });
          if (response.status === 200) {
            const parsed = localMcpBrowserRenderJobSchema.parse((await response.json()).job);
            setIsRendering(true); setStatus("Validating a model requested by local Codex…");
            await completeLocalMcpBrowserRender(parsed, sessionId, controller.signal);
            setStatus("Local Codex validation finished.");
          } else if (response.status !== 204) throw new Error("Local rendering is unavailable.");
        }
      } catch {
        if (!stopped) setStatus("MCP rendering is unavailable. Keep this project visible and retry from Codex.");
      } finally {
        release(); setIsRendering(false); schedule();
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [projectId, sessionId, localEnabled, remoteEnabled, isAvailable, refreshProject, tryBackground, release]);
  return { isRendering, status, acquire, release };
}
