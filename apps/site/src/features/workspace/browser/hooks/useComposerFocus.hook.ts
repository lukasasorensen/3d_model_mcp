import { useLayoutEffect, useRef, type RefObject } from "react";
import { shouldRestoreComposerFocus } from "../utils/workspacePresentation.util";

export function useComposerFocus(
  active: boolean,
  available: boolean,
  composerRef: RefObject<HTMLTextAreaElement | null>,
): void {
  const wasActive = useRef(false);
  useLayoutEffect(() => {
    const composer = composerRef.current;
    const visible = Boolean(composer?.getClientRects().length);
    const focusUnclaimed =
      document.activeElement === document.body ||
      document.activeElement === composer;
    if (
      shouldRestoreComposerFocus(
        wasActive.current,
        active,
        available && visible && !composer?.disabled,
        focusUnclaimed,
      )
    )
      composer?.focus();
    wasActive.current = active;
  }, [active, available, composerRef]);
}
