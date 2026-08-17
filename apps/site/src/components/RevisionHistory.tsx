"use client";

import type { RevisionManifest } from "@rjls/contracts";
import { revisionLabel } from "@/lib/workspace-state";

export function RevisionHistory({ revisions, currentRevision, selectedRevision, disabled, onSelect, onRestore }: {
  revisions: RevisionManifest[];
  currentRevision: string | null;
  selectedRevision: string | null;
  disabled: boolean;
  onSelect: (revisionId: string) => void;
  onRestore: (revisionId: string) => void;
}) {
  return (
    <details className="revision-history" data-testid="revision-history">
      <summary>Revision history <span>{revisions.length}</span></summary>
      {revisions.length === 0 ? <p>No promoted revisions yet.</p> : (
        <ol>
          {revisions.map((revision) => {
            const current = revision.revisionId === currentRevision;
            const selected = revision.revisionId === selectedRevision;
            let status = "Historical revision";
            if (current) status = "Current revision";
            else if (selected) status = "Selected for inspection";
            return (
              <li key={revision.revisionId} className={selected ? "revision-selected" : ""}>
                <button type="button" className="revision-select" onClick={() => onSelect(revision.revisionId)} aria-pressed={selected}>
                  <strong>{revisionLabel(revisions, revision.revisionId)}</strong>
                  <span>{status}</span>
                  <code title={revision.revisionId}>{revision.revisionId}</code>
                </button>
                {!current && <button type="button" className="restore-button" onClick={() => onRestore(revision.revisionId)} disabled={disabled}>Restore as a new revision</button>}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
