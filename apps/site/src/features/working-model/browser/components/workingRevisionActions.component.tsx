"use client";
import type { JSX } from "react";
import { Button } from "../../../../shared/controls/index";
import type { WorkingModelView } from "../workingDraft.types";

export function WorkingRevisionActions({
  draft,
}: {
  draft: WorkingModelView;
}): JSX.Element {
  return (
    <div
      className="working-revision-actions"
      role="group"
      aria-label="Working revision"
    >
      <div className="working-revision-buttons">
        {draft.dirty && !draft.showingDraft ? (
          <Button onClick={draft.returnToDraft}>Return to draft</Button>
        ) : !draft.historical ? (
          <>
            <Button
              className="editor-apply"
              disabled={!draft.canSave}
              onClick={draft.save}
            >
              {draft.saving
                ? "Saving…"
                : draft.retryingSave && !draft.stale
                  ? "Retry save"
                  : "Save new revision"}
            </Button>
            <Button disabled={!draft.canUndo} onClick={draft.undo}>
              Undo
            </Button>
            <Button disabled={!draft.canRedo} onClick={draft.redo}>
              Redo
            </Button>
            {draft.dirty && (
              <Button disabled={draft.saving} onClick={draft.discard}>
                {draft.stale
                  ? "Discard draft and open latest"
                  : "Discard draft"}
              </Button>
            )}
          </>
        ) : null}
      </div>
      <p role="status" aria-live="polite">
        {draft.savePhase ||
          (draft.stale
            ? "A newer revision is current. This draft is read-only."
            : draft.dirty
              ? draft.previewPending
                ? "Unsaved changes · Updating preview…"
                : (draft.inputProblem ?? "Unsaved changes")
              : "")}
      </p>
      {draft.loadError && (
        <p role="alert">
          {draft.loadError} <Button onClick={draft.reload}>Retry</Button>
        </p>
      )}
      {draft.previewError && (
        <p role="alert">
          Showing the last usable preview. {draft.previewError}{" "}
          <Button onClick={draft.retryPreview}>Retry preview</Button>
        </p>
      )}
      {draft.saveError && <p role="alert">{draft.saveError}</p>}
      {draft.editError && <p role="alert">{draft.editError}</p>}
      {draft.dirty && !draft.storageOkay && (
        <p role="alert">
          This tab could not store your draft. Save it before leaving to keep
          your changes.
        </p>
      )}
    </div>
  );
}
