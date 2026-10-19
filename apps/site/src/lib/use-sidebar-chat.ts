"use client";
import { useEffect, useState } from "react";

export function useSidebarChat(): boolean {
  const [isEnabled, setIsEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch("/v1/features/sidebar-chat", { cache: "no-store", signal: controller.signal });
        const flags: unknown = response.ok ? await response.json() : undefined;
        if (!controller.signal.aborted) setIsEnabled(Boolean(flags && typeof flags === "object" && "isSidebarChatEnabled" in flags && flags.isSidebarChatEnabled === true));
      } catch { if (!controller.signal.aborted) setIsEnabled(false); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 15_000); }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return isEnabled;
}
