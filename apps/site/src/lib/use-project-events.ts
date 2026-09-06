"use client";
import { useEffect, useState } from "react";
import { receiveProjectEvents } from "./project-event-client";

export function useProjectEvents(projectId: string, refreshProject: () => Promise<boolean>) {
  const [presenceWake, setPresenceWake] = useState(0);
  const [renderWake, setRenderWake] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Connecting to project updates…");
  useEffect(() => {
    let stopped = false;
    let connection: AbortController;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const refresh = async () => {
      const active = connection;
      try {
        if (!await refreshProject()) throw new Error("Project refresh failed.");
        if (!stopped && active === connection && !active?.signal.aborted) { attempt = 0; setSyncStatus(""); }
      } catch { active?.abort(); }
    };
    const resync = () => { void refresh(); setRenderWake((value) => value + 1); };
    const connect = async () => {
      connection = new AbortController();
      try {
        const shouldRetry = await receiveProjectEvents(projectId, connection.signal, (event) => {
          if (stopped) return;
          if (event.type === "ready") { setPresenceWake((value) => value + 1); resync(); }
          else if (event.type === "project-updated") void refresh();
          else setRenderWake((value) => value + 1);
        }, () => { if (!stopped) setPresenceWake((value) => value + 1); });
        if (!shouldRetry) {
          if (!stopped) setSyncStatus("Project updates unavailable. Sign in again or reload.");
          return;
        }
      } catch { /* Reconnect and take a fresh snapshot after a transport gap. */ }
      if (stopped) return;
      setSyncStatus("Reconnecting—project may be out of date.");
      retry = setTimeout(() => { void connect(); }, Math.min(30_000, 1_000 * 2 ** Math.min(attempt++, 5)) * (0.8 + Math.random() * 0.2));
    };
    const visible = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", visible);
    void connect();
    return () => { stopped = true; connection?.abort(); clearTimeout(retry); document.removeEventListener("visibilitychange", visible); };
  }, [projectId, refreshProject]);
  return { renderWake, syncStatus, presenceWake };
}
