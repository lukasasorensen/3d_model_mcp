"use client";
import { useEffect, useRef, type JSX } from "react";

export function DeleteProjectDialog({
  name,
  pending,
  error,
  onCancel,
  onDelete,
}: {
  name: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onDelete: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return (): void => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="project-delete-dialog"
      aria-labelledby="delete-project-title"
      aria-describedby="delete-project-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id="delete-project-title">Delete {name}?</h2>
      <p id="delete-project-description">
        This permanently deletes the project, its history, and its hosted
        exports. You cannot restore it.
      </p>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <div className="project-actions">
        <button type="button" autoFocus disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="project-delete"
          disabled={pending}
          onClick={onDelete}
        >
          {pending ? "Deleting…" : "Delete project"}
        </button>
      </div>
    </dialog>
  );
}
