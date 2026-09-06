"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { localMcpBrowserRenderJobSchema, remoteMcpBrowserRenderJobSchema } from "@rjls/contracts";
import { BrowserRenderLease } from "./browser-render-lease";
import { completeLocalMcpBrowserRender, completeRemoteMcpBrowserRender } from "./browser-renderer";

export function useMcpBrowserRenderer(options: {
  projectId: string; sessionId: string; localEnabled: boolean; remoteEnabled: boolean;
  isAvailable: boolean; renderWake: number;
}) {
  const { projectId, sessionId, localEnabled, remoteEnabled, isAvailable, renderWake } = options;
  const lease = useRef(new BrowserRenderLease());
  const [isRendering, setIsRendering] = useState(false);
  const [status, setStatus] = useState("");
  const acquire = useCallback(() => lease.current.acquireForeground(), []);
  const tryBackground = useCallback(() => lease.current.tryBackground(), []);
  const pumpRef = useRef<() => void>(() => undefined);
  const release = useCallback(() => { lease.current.release(); pumpRef.current(); }, []);
  useEffect(() => { pumpRef.current(); }, [renderWake]);

  useEffect(() => {
    if ((!localEnabled && !remoteEnabled) || !sessionId || !isAvailable) return;
    let stopped = false;
    let running = false;
    let pending = false;
    const controller = new AbortController();

    const claim = async () => {
      if (running) { pending = true; return; }
      if (stopped || document.visibilityState !== "visible" || !tryBackground()) return;
      running = true; pending = false;
      try {
        const headers = { "x-rjls-session-id": sessionId };
        if (remoteEnabled) {
          const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/mcp-render-jobs/claim`, { method: "POST", headers, signal: controller.signal, cache: "no-store" });
          if (response.status === 200) {
            const parsed = remoteMcpBrowserRenderJobSchema.parse((await response.json()).job);
            pending = true;
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
            pending = true;
            setIsRendering(true); setStatus("Validating a model requested by local Codex…");
            await completeLocalMcpBrowserRender(parsed, sessionId, controller.signal);
            setStatus("Local Codex validation finished.");
          } else if (response.status !== 204) throw new Error("Local rendering is unavailable.");
        }
      } catch {
        if (!stopped) setStatus("MCP rendering is unavailable. Keep this project visible and retry from Codex.");
      } finally {
        lease.current.release(); running = false; setIsRendering(false);
        if (pending && !stopped) void claim();
      }
    };
    const wake = () => { void claim(); };
    pumpRef.current = wake;
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => { stopped = true; pumpRef.current = () => undefined; document.removeEventListener("visibilitychange", wake); controller.abort(); };
  }, [projectId, sessionId, localEnabled, remoteEnabled, isAvailable, tryBackground]);
  return { isRendering, status, acquire, release };
}
