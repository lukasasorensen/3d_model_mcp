"use client";
import { CloseIcon, IconButton } from "../../../../shared/icons/index";
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
      <IconButton
        icon={CloseIcon}
        label="Dismiss notification"
        onClick={() => setVisible(false)}
      />
    </div>
  );
}
