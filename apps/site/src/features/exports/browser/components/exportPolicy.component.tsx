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
          Apply changes before downloading.
        </>
      ) : (
        "A current revision is required for export."
      )}
    </p>
  );
}
