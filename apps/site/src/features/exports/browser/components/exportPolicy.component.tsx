import type { JSX } from "react";
import type { DownloadFormat } from "@theoryfoundry/browser-renderer";

export function ExportPolicy({
  currentLabel,
  format,
  available,
}: {
  currentLabel: string;
  format: DownloadFormat;
  available: boolean;
}): JSX.Element {
  return (
    <p id="export-help" className="action-help">
      {available ? (
        <>
          {currentLabel} · {format.toUpperCase()} · generated locally in this
          browser. Downloads use the current accepted revision, including its
          saved visibility. Hidden files and objects are excluded from the
          composed model. Display order does not change geometry. Apply changes
          before downloading; inspecting history does not change the download.
        </>
      ) : (
        "A current revision is required for export."
      )}
    </p>
  );
}
