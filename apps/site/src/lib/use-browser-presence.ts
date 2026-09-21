"use client";
import { useEffect, useRef } from "react";

/** Coalesce state changes and SSE acknowledgements without a polling timer. */
export function useBrowserPresence(options: { projectId: string; sessionId: string; ready: boolean; busy: boolean; localEnabled: boolean; remoteEnabled: boolean; presenceWake: number }) {
  const tabId = useRef<string | undefined>(undefined);
  const latest = useRef(options); latest.current = options;
  const wake = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!options.sessionId) return;
    tabId.current ??= crypto.randomUUID();
    const controller = new AbortController(); let running = false; let pending = false;
    const send = async () => {
      pending = true; if (running) return; running = true;
      try {
        while (pending && !controller.signal.aborted) {
          pending = false;
          const { projectId, sessionId, ready, busy, localEnabled, remoteEnabled } = latest.current;
          const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/preview-presence`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", "x-rjls-session-id": sessionId }, body: JSON.stringify({ sessionId, tabId: tabId.current, visible: document.visibilityState === "visible", ready, busy, localEnabled, remoteEnabled }) });
          if (!response.ok) break;
        }
      } catch { /* The next SSE heartbeat retries; stale presence expires server-side. */ }
      finally { running = false; }
    };
    const notify = () => { void send(); }; wake.current = notify;
    document.addEventListener("visibilitychange", notify); notify();
    return () => { wake.current = () => undefined; controller.abort(); document.removeEventListener("visibilitychange", notify); };
  }, [options.projectId, options.sessionId, options.localEnabled, options.remoteEnabled]);
  useEffect(() => { wake.current(); }, [options.ready, options.busy, options.presenceWake]);
}
