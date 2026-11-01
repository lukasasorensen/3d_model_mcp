import { useState, useSyncExternalStore } from "react";

export type WorkspaceSection = "model" | "conversation" | "details";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(max-width: 1023px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useWorkspaceSection(chatEnabled: boolean): {
  mobile: boolean;
  section: WorkspaceSection;
  selectSection: (section: WorkspaceSection) => void;
} {
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
  const [selected, selectSection] = useState<WorkspaceSection>("model");
  return {
    mobile,
    section: !chatEnabled && selected === "conversation" ? "model" : selected,
    selectSection,
  };
}
