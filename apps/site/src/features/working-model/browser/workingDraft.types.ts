import type {
  ApplyParameterValues,
  GeometrySummary,
  ModelFiles,
  ParameterControlsSnapshot,
  ProjectParameter,
  RemoteMcpBrowserRenderJob,
  RevisionManifest,
} from "@theoryfoundry/contracts";
import type { ObjectEditingSnapshot } from "../../object-editing/browser/index";
import type { ObjectLayersSnapshot } from "../../object-layers/browser/index";
import type { WorkingModel } from "../workingModel.schema";

export type NumericInput = {
  values: string[];
  uniform: string;
  error: string;
};

export interface WorkingDraftFields {
  parameters: Record<string, string | boolean>;
  modelFiles?: ModelFiles | undefined;
  rename?: { id: string; value: string } | undefined;
  numeric: Record<string, NumericInput>;
}

export interface StoredWorkingDraft {
  version: 1;
  parentRevision: string;
  fields: WorkingDraftFields;
  requestId?: string | undefined;
}

export interface WorkingBase {
  revision: string;
  objects: ObjectEditingSnapshot;
  parameters: ParameterControlsSnapshot;
  layers: ObjectLayersSnapshot;
}

export interface WorkingModelOptions {
  projectId: string;
  currentRevision: string | null;
  selectedRevision: string | null;
  selectedSourceHash?: string | undefined;
  sessionId: string;
  disabled: boolean;
  acquire(): Promise<boolean>;
  release(): void;
  render(job: RemoteMcpBrowserRenderJob, signal: AbortSignal): Promise<void>;
  refresh(): Promise<boolean>;
  onPending(value: boolean): void;
  ownerId?: string | undefined;
  revisions: readonly RevisionManifest[];
  hydrated: boolean;
  selectCurrent(): void;
  tryDraftRenderer(cancel: () => void): (() => void) | undefined;
}

export interface WorkingPreview {
  model: WorkingModel;
  bytes: Uint8Array;
  sourceHash: string;
  geometry: GeometrySummary;
}

export interface WorkingModelView {
  base: WorkingBase | undefined;
  loading: boolean;
  loadError: string | undefined;
  reload(): void;
  fields: WorkingDraftFields;
  modelFiles: ModelFiles | undefined;
  layersAvailable: boolean;
  parameters: ProjectParameter[];
  validation: {
    operations: ApplyParameterValues["operations"];
    errors: Record<string, string>;
  };
  blocked: boolean;
  historical: boolean;
  dirty: boolean;
  stale: boolean;
  showingDraft: boolean;
  dragging: boolean;
  preview: WorkingPreview | undefined;
  inputProblem: string | undefined;
  previewError: string | undefined;
  previewPending: boolean;
  retryPreview(): void;
  canSave: boolean;
  saving: boolean;
  saveError: string | undefined;
  savePhase: string;
  retryingSave: boolean;
  storageOkay: boolean;
  editError: string | undefined;
  setEditError(message: string | undefined): void;
  parent: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  change(
    edit: (draft: WorkingDraftFields) => WorkingDraftFields,
    group?: string,
  ): void;
  finish(): void;
  cancel(group?: string): void;
  cancelRename(id: string): void;
  setDragging(value: boolean): void;
  inspect(): void;
  returnToDraft(): void;
  beforeLeave(): boolean;
  save(): void;
  discard(): void;
}
