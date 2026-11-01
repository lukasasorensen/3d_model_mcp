"use client";
import { useId, useState, type JSX } from "react";

export function SetupCommand({
  label,
  value,
  rows = 5,
}: {
  label: string;
  value: string;
  rows?: number;
}): JSX.Element {
  const id = useId();
  const [notice, setNotice] = useState("");
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(
        `Clipboard unavailable. Select and copy the ${label.toLowerCase()} manually.`,
      );
    }
  }
  return (
    <div className="setup-command">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} readOnly value={value} rows={rows} spellCheck={false} />
      <button
        type="button"
        className="button-primary"
        onClick={() => void copy()}
      >
        Copy {label.toLowerCase()}
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
