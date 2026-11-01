import { useState, useSyncExternalStore } from "react";

export type WorkspaceSection = "model" | "conversation" | "details";

function focusSection(section: WorkspaceSection): void {
  const control = document.getElementById(`workspace-${section}-button`);
  if (control?.getClientRects().length) control.focus();
  else document.getElementById("model-heading")?.focus();
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(max-width: 1023px)");
  let lastFocus = document.activeElement;
  let frame = 0;
  const rememberFocus = (event: FocusEvent): void => {
    if (event.target instanceof HTMLElement) lastFocus = event.target;
  };
  const resize = (): void => {
    onChange();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (
        lastFocus instanceof HTMLElement &&
        lastFocus.closest('[data-testid="cad-workspace"]') &&
        !lastFocus.getClientRects().length &&
        (document.activeElement === lastFocus ||
          document.activeElement === document.body)
      ) {
        const selected = document.querySelector<HTMLElement>(
          '.workspace-sections [aria-pressed="true"]',
        );
        if (selected?.getClientRects().length) selected.focus();
        else document.getElementById("model-heading")?.focus();
      }
    });
  };
  document.addEventListener("focusin", rememberFocus);
  query.addEventListener("change", resize);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener("focusin", rememberFocus);
    query.removeEventListener("change", resize);
  };
}

export function useWorkspaceSection(chatEnabled: boolean): {
  mobile: boolean;
  section: WorkspaceSection;
  selectSection: (section: WorkspaceSection, restoreFocus?: boolean) => void;
} {
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
  const [selected, setSelected] = useState<WorkspaceSection>("model");
  const selectSection = (
    section: WorkspaceSection,
    restoreFocus = true,
  ): void => {
    setSelected(section);
    if (restoreFocus) requestAnimationFrame(() => focusSection(section));
  };
  return {
    mobile,
    section: !chatEnabled && selected === "conversation" ? "model" : selected,
    selectSection,
  };
}
