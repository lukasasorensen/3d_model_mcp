import type { JSX } from "react";

export function ExportPolicy({
  currentLabel,
  available,
}: {
  currentLabel: string;
  available: boolean;
}): JSX.Element {
  return (
    <p id="export-help" className="action-help">
      {available ? (
        <>
          Downloads use the saved model and visible layers in {currentLabel}.
          Save a new revision to include unsaved edits.
        </>
      ) : (
        "A current revision is required for export."
      )}
    </p>
  );
}
