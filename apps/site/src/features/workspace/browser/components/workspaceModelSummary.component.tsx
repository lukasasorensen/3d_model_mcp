"use client";
import type { JSX } from "react";
import { Button } from "../../../../shared/controls/index";
import { DownloadIcon } from "../../../../shared/icons/index";
import {
  ExportPolicy,
  type DownloadFormat,
} from "../../../exports/browser/index";
import { previewStatusLabel } from "../utils/workspacePresentation.util";
import type { WorkspaceView } from "../workspaceView.types";

type SummaryView = Pick<
  WorkspaceView,
  | "dimensions"
  | "previewLoadState"
  | "parameterPending"
  | "isMcpRendering"
  | "selectedLabel"
  | "currentLabel"
  | "exportFormat"
  | "exportState"
  | "setExportFormat"
  | "setExportState"
  | "exportCurrent"
>;

export function WorkspaceModelSummary({
  dimensions,
  previewLoadState,
  parameterPending,
  isMcpRendering,
  selectedLabel,
  currentLabel,
  exportFormat,
  exportState,
  setExportFormat,
  setExportState,
  exportCurrent,
  hasCurrent,
  hasModel,
  active,
}: SummaryView & {
  hasCurrent: boolean;
  hasModel: boolean;
  active: boolean;
}): JSX.Element {
  const exportFormatLabel = exportFormat.toUpperCase();
  return (
    <section className="model-summary" aria-label="Model summary and downloads">
      <div className="model-facts" aria-label="Model facts">
        <div>
          <span>Revision</span>
          <strong>{selectedLabel}</strong>
        </div>
        <div>
          <span>Dimensions · mm</span>
          <strong>{dimensions}</strong>
        </div>
        <div>
          <span>Preview</span>
          <strong>{previewStatusLabel(hasModel, previewLoadState)}</strong>
        </div>
      </div>
      <div className="model-actions">
        <div className="export-controls">
          <label htmlFor="export-format">Download format</label>
          <select
            id="export-format"
            value={exportFormat}
            onChange={(event) => {
              setExportFormat(event.target.value as DownloadFormat);
              setExportState("idle");
            }}
            disabled={
              parameterPending ||
              isMcpRendering ||
              !hasCurrent ||
              active ||
              exportState === "preparing"
            }
          >
            <option value="stl">STL</option>
            <option value="glb">GLB</option>
            <option value="3mf">3MF</option>
          </select>
          <Button
            className="export-button"
            icon={<DownloadIcon size="1em" focusable="false" />}
            accessibleLabel={
              exportState === "preparing"
                ? `Preparing ${exportFormatLabel} download · ${currentLabel}`
                : `Download ${exportFormatLabel} · ${currentLabel}`
            }
            onClick={() => void exportCurrent()}
            disabled={
              parameterPending ||
              isMcpRendering ||
              !hasCurrent ||
              active ||
              exportState === "preparing"
            }
            aria-describedby="export-help"
          >
            {exportState === "preparing"
              ? `Preparing ${exportFormatLabel}…`
              : exportFormatLabel}
          </Button>
        </div>
      </div>
      <ExportPolicy currentLabel={currentLabel} available={hasCurrent} />
    </section>
  );
}
