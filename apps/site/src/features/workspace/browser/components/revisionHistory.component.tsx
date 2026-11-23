"use client";
import { Button } from "../../../../shared/controls/index";
import type { JSX } from "react";

import type { RevisionManifest } from "@theoryfoundry/contracts";
import { revisionLabel } from "../utils/workspaceRevision.util";

export function RevisionHistory({
  revisions,
  currentRevision,
  selectedRevision,
  disabled,
  restoreUnavailable = false,
  inspectUnavailable = false,
  onSelect,
  onRestore,
}: {
  revisions: RevisionManifest[];
  currentRevision: string | null;
  selectedRevision: string | null;
  disabled: boolean;
  restoreUnavailable?: boolean;
  inspectUnavailable?: boolean;
  onSelect: (revisionId: string) => void;
  onRestore: (revisionId: string) => void;
}): JSX.Element {
  return (
    <details className="revision-history" data-testid="revision-history">
      <summary>
        Revision history <span>{revisions.length}</span>
      </summary>
      {revisions.length === 0 ? (
        <p>No promoted revisions yet.</p>
      ) : (
        <>
          <p className="action-help">
            {restoreUnavailable
              ? "Save or discard the draft before restoring a revision."
              : "Restoring creates a new current revision."}
          </p>
          <ol>
            {revisions.map((revision) => {
              const label = revisionLabel(revisions, revision.revisionId);
              const current = revision.revisionId === currentRevision;
              const selected = revision.revisionId === selectedRevision;
              let status = "Historical revision";
              if (current) status = "Current revision";
              else if (selected) status = "Selected for inspection";
              return (
                <li
                  key={revision.revisionId}
                  className={selected ? "revision-selected" : ""}
                >
                  <button
                    type="button"
                    className="revision-select"
                    onClick={() => onSelect(revision.revisionId)}
                    aria-pressed={selected}
                    disabled={inspectUnavailable}
                  >
                    <strong>{label}</strong>
                    <span>{status}</span>
                    <code title={revision.revisionId}>
                      {revision.revisionId}
                    </code>
                  </button>
                  {!current && (
                    <Button
                      className="restore-button"
                      accessibleLabel={`Restore ${label} as a new revision`}
                      onClick={() => onRestore(revision.revisionId)}
                      disabled={disabled || restoreUnavailable}
                    >
                      Restore
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </details>
  );
}
