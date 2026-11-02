"use client";
import { useEffect, useState, type JSX } from "react";

export function WorkspaceStatusToast({
  message,
}: {
  message: string;
}): JSX.Element | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return (): void => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <div className="workspace-toast">
      <span role="status">{message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => setVisible(false)}
      >
        ×
      </button>
    </div>
  );
}
