"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { localMcpBrowserRenderJobSchema, remoteMcpBrowserRenderJobSchema, previewJobSchema, previewStatusSchema, exportJobSchema } from "@rjls/contracts";
import { ActivePreview } from "./active-preview";
import { completeModelPreview } from "./model-preview-renderer";
import { BrowserRenderLease } from "./browser-render-lease";
import { completeLocalMcpBrowserRender, completeRemoteMcpBrowserRender, generateDownload } from "./browser-renderer";

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
    if (!sessionId || !isAvailable) return;
    let activePreview: ActivePreview | undefined;
    let stopped = false;
    let running = false;
    let pending = false;
    const controller = new AbortController();

    const claim = async () => {
      if (running) { pending = true; activePreview?.invalidate(); return; }
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
            return;
          } else if (response.status !== 204) throw new Error("Local rendering is unavailable.");
        }
        const exportResponse = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/export-jobs/claim`, {method:"POST",headers,signal:controller.signal,cache:"no-store"});
        if(exportResponse.status===200) {
          pending=true;setIsRendering(true);setStatus("Generating a downloadable export…");
          const job=exportJobSchema.parse((await exportResponse.json()).job);
          const uploadHeaders={...headers,"content-type":"application/octet-stream","x-export-id":job.jobId,"x-export-token":job.token,"x-source-hash":job.sourceHash};
          try {
            const generated=await generateDownload(job.source,job.format,controller.signal);
            const completed=await fetch(`/v1/projects/${encodeURIComponent(projectId)}/export-jobs/complete`,{method:"POST",signal:controller.signal,headers:uploadHeaders,body:new Uint8Array(generated.bytes)});
            if(!completed.ok) { const failure=await completed.json(); console.error("Export rejected:",failure); throw new Error("Export upload failed."); }
          } catch(error) {
            if(!controller.signal.aborted) await fetch(`/v1/projects/${encodeURIComponent(projectId)}/export-jobs/complete`,{method:"POST",signal:controller.signal,headers:{...uploadHeaders,"x-export-failed":"true"}}).catch(()=>undefined);
            throw error;
          }
          setStatus("Export ready for download.");return;
        }
        if(exportResponse.status!==204)throw new Error("Export delivery unavailable.");
        if (!localEnabled && !remoteEnabled) return;
        const preview = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/preview-jobs/claim`, { method: "POST", headers, signal: controller.signal, cache: "no-store" });
        if (preview.status === 200) {
          pending = true; setIsRendering(true); setStatus("Rendering a PNG preview requested by Codex…");
          const job = previewJobSchema.parse((await preview.json()).job);
          const active = new ActivePreview(controller.signal, async (signal) => {
            const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/preview-jobs/status`, {
              method: "POST", signal, cache: "no-store", headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify({ jobId: job.jobId, token: job.token }),
            });
            if (!response.ok) throw new Error("Preview status is unavailable.");
            return previewStatusSchema.parse(await response.json()).state;
          });
          activePreview = active;
          // Covers deletion between the claim and installing this monitor.
          active.invalidate();
          try { await completeModelPreview(job, sessionId, active.signal, () => active.close()); }
          finally { active.close(); if (activePreview === active) activePreview = undefined; }
          setStatus("PNG preview delivered to Codex.");
        } else if (preview.status !== 204) throw new Error("Preview rendering is unavailable.");
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
    return () => { activePreview?.close(); stopped = true; pumpRef.current = () => undefined; document.removeEventListener("visibilitychange", wake); controller.abort(); };
  }, [projectId, sessionId, localEnabled, remoteEnabled, isAvailable, tryBackground]);
  return { isRendering, status, acquire, release };
}
