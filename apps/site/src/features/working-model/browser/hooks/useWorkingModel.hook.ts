"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  applyParameterOperations,
  canonicalModelFiles,
  modelFilesPresentation,
  visibleModelObjectIds,
  type ModelFiles,
} from "@theoryfoundry/contracts";
import { ZodError } from "zod/v4";
import {
  parameterDraft,
  validateParameterDraft,
} from "../../../parameter-controls/browser/index";
import type { WorkingModel } from "../../workingModel.schema";
import {
  readWorkingDraft,
  workingDraftKey,
  writeWorkingDraft,
} from "../utils/draftStorage.util";
import {
  emptyWorkingHistory,
  workingHistoryReducer,
} from "../utils/workingHistory.util";
import type {
  WorkingDraftFields,
  WorkingModelOptions,
  WorkingModelView,
} from "../workingDraft.types";
import { useWorkingBase } from "./useWorkingBase.hook";
import { useWorkingPreview } from "./useWorkingPreview.hook";
import { useWorkingSave } from "./useWorkingSave.hook";

function comparableModelFiles(snapshot: ModelFiles): string {
  return JSON.stringify(
    canonicalModelFiles({
      version: 2,
      files: snapshot.files,
      objects: snapshot.objects,
      composition: snapshot.composition,
      presentation: modelFilesPresentation(snapshot),
    }),
  );
}

function modelLayerProblem(files: ModelFiles | undefined): string | undefined {
  if (!files || visibleModelObjectIds(files).length > 0) return undefined;
  return files.composition.operation === "difference"
    ? "Show the first difference operand to preview and save."
    : "Show at least one layer before saving.";
}

export function useWorkingModel(
  options: WorkingModelOptions,
): WorkingModelView {
  const { ownerId, projectId, currentRevision, selectedRevision, revisions } =
    options;
  const [history, update] = useReducer(
    workingHistoryReducer,
    emptyWorkingHistory,
  );
  const [parent, setParent] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string>();
  const [inspecting, setInspecting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageOkay, setStorageOkay] = useState(true);
  const [reload, setReload] = useState(0);
  const [editError, setEditError] = useState<string>();
  const key = ownerId ? workingDraftKey(ownerId, projectId) : undefined;

  useEffect(() => {
    try {
      const saved = key ? readWorkingDraft(key) : undefined;
      if (saved) {
        setParent(saved.parentRevision);
        update({ type: "load", fields: saved.fields });
        setRequestId(saved.requestId);
      }
    } catch {
      setStorageOkay(false);
    } finally {
      setStorageReady(true);
    }
  }, [key]);

  const baseRevision =
    options.hydrated && storageReady ? (parent ?? currentRevision) : null;
  const baseHash = revisions.find(
    (revision) => revision.revisionId === baseRevision,
  )?.sourceHash;
  const baseRead = useWorkingBase(projectId, baseRevision, baseHash, reload);
  const base = baseRead.base;
  const currentRead = useWorkingBase(
    projectId,
    inspecting && selectedRevision !== baseRevision ? selectedRevision : null,
    options.selectedSourceHash,
    reload,
  );
  const initial = useMemo<WorkingDraftFields>(
    () => ({
      parameters: parameterDraft(base?.parameters.parameters ?? []),
      numeric: {},
    }),
    [base],
  );
  const fields = history.fields ?? initial;
  const validation = useMemo(
    () =>
      validateParameterDraft(
        base?.parameters.parameters ?? [],
        fields.parameters,
      ),
    [base, fields.parameters],
  );
  const parameterSnapshot = useMemo(() => {
    const saved = base?.parameters.parameters ?? [];
    if (!validation.operations.length) return { parameters: saved };
    try {
      return {
        parameters: applyParameterOperations(saved, validation.operations),
      };
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      return {
        parameters: saved,
        error: error.issues[0]?.message ?? "The parameter values are invalid.",
      };
    }
  }, [base, validation.operations]);
  const modelFiles = fields.modelFiles ?? base?.objects.modelFiles ?? undefined;
  const layerProblem = useMemo(
    () => modelLayerProblem(modelFiles),
    [modelFiles],
  );
  const filesChanged = useMemo(() => {
    const edited = fields.modelFiles;
    if (!edited) return false;
    const saved = base?.objects.modelFiles;
    return (
      dragging ||
      !saved ||
      comparableModelFiles(edited) !== comparableModelFiles(saved)
    );
  }, [base, dragging, fields.modelFiles]);

  const inputProblem = fields.rename
    ? "Finish or cancel the layer name before saving."
    : Object.keys(fields.numeric).length
      ? "Fix the unfinished transform values before saving."
      : Object.keys(validation.errors).length
        ? "Fix the highlighted parameter values before saving."
        : (parameterSnapshot.error ?? layerProblem);
  const incomplete = Boolean(inputProblem);
  const dirty = Boolean(
    parent &&
    (!base ||
      validation.operations.length > 0 ||
      filesChanged ||
      incomplete ||
      requestId),
  );
  const headChanged = Boolean(dirty && parent !== currentRevision);
  const showingDraft = !inspecting && dirty;
  const historical =
    inspecting && (dirty || selectedRevision !== currentRevision);
  const read =
    inspecting && selectedRevision !== baseRevision ? currentRead : baseRead;

  const model = useMemo<WorkingModel | undefined>(() => {
    if (
      !base ||
      dragging ||
      incomplete ||
      (!filesChanged && validation.operations.length === 0)
    )
      return undefined;
    return {
      parentRevision: base.revision,
      operations: validation.operations,
      ...(filesChanged && modelFiles ? { modelFiles } : {}),
    };
  }, [
    base,
    dragging,
    filesChanged,
    incomplete,
    modelFiles,
    validation.operations,
  ]);
  function reset(): void {
    update({ type: "load" });
    setParent(null);
    setRequestId(undefined);
    setDragging(false);
    setEditError(undefined);
    setInspecting(false);
    options.selectCurrent();
    if (key) setStorageOkay(writeWorkingDraft(key, undefined));
  }

  const saver = useWorkingSave(options, parent, requestId, setRequestId, reset);
  const stale =
    headChanged || Boolean(parent && saver.conflictParent === parent);
  const result = useWorkingPreview(
    projectId,
    dirty,
    showingDraft ? model : undefined,
    options.disabled || saver.saving || dragging,
    options.tryDraftRenderer,
  );

  useEffect(() => {
    if (!storageReady || !key || dragging) return;
    setStorageOkay(
      writeWorkingDraft(
        key,
        dirty && parent
          ? {
              version: 1,
              parentRevision: parent,
              fields,
              requestId,
            }
          : undefined,
      ),
    );
  }, [dirty, dragging, fields, key, parent, requestId, storageReady]);

  useEffect(() => {
    if (!dirty && !saver.saving) return;
    function warn(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener("beforeunload", warn);
    return (): void => window.removeEventListener("beforeunload", warn);
  }, [dirty, saver.saving]);

  useEffect(() => {
    if (parent && base && !dirty && currentRevision !== parent) {
      setParent(null);
      update({ type: "load" });
    }
  }, [base, currentRevision, dirty, parent]);

  const displayedFields: WorkingDraftFields = historical
    ? {
        parameters: parameterDraft(read.base?.parameters.parameters ?? []),
        numeric: {},
      }
    : fields;
  const blocked =
    options.disabled ||
    !base ||
    saver.saving ||
    stale ||
    historical ||
    Boolean(requestId);
  function change(
    edit: (draft: WorkingDraftFields) => WorkingDraftFields,
    group?: string,
  ): void {
    if (blocked || !base) return;
    if (!parent) setParent(base.revision);
    setEditError(undefined);
    saver.clear();
    update({ type: "edit", initial, update: edit, group });
  }

  const canSave = Boolean(
    !options.disabled &&
    !historical &&
    !stale &&
    dirty &&
    !saver.saving &&
    !dragging &&
    (result.ready || requestId) &&
    model &&
    saver.rejected !== model,
  );
  return {
    base: showingDraft ? base : read.base,
    loading: read.loading || !storageReady,
    loadError: read.error,
    reload: () => setReload((value) => value + 1),
    fields: displayedFields,
    modelFiles: historical
      ? (read.base?.objects.modelFiles ?? undefined)
      : modelFiles,
    layersAvailable: historical
      ? Boolean(read.base?.layers.state)
      : filesChanged || Boolean(base?.layers.state),
    parameters: historical
      ? (read.base?.parameters.parameters ?? [])
      : parameterSnapshot.parameters,
    validation,
    blocked,
    historical,
    dirty,
    stale,
    showingDraft,
    dragging,
    hidePreview: showingDraft && Boolean(layerProblem),
    preview:
      showingDraft && result.preview?.model.parentRevision === parent
        ? result.preview
        : undefined,
    inputProblem: showingDraft ? inputProblem : undefined,
    previewError: showingDraft ? result.error : undefined,
    previewPending:
      showingDraft && Boolean(model) && !result.ready && !result.error,
    retryPreview: result.retry,
    canSave,
    saving: saver.saving,
    saveError: saver.error,
    savePhase: saver.phase,
    retryingSave: Boolean(requestId && !saver.saving),
    storageOkay,
    editError,
    setEditError,
    parent,
    canUndo: !blocked && !dragging && history.past.length > 0,
    canRedo: !blocked && !dragging && history.future.length > 0,
    undo: () => update({ type: "undo" }),
    redo: () => update({ type: "redo" }),
    change,
    finish: () => update({ type: "finish" }),
    cancel: (group) => update({ type: "cancel", group }),
    cancelRename: (id) => update({ type: "cancel_rename", id }),
    setDragging,
    inspect: () => setInspecting(true),
    returnToDraft(): void {
      setInspecting(false);
      options.selectCurrent();
    },
    beforeLeave(): boolean {
      if (saver.saving) return false;
      if (!dirty || storageOkay) return true;
      if (
        !window.confirm(
          "This draft could not be stored in this tab. Leave and discard it?",
        )
      )
        return false;
      reset();
      return true;
    },
    save(): void {
      if (canSave && model) void saver.save(model);
    },
    discard(): void {
      if (saver.saving || !window.confirm("Discard the unsaved model changes?"))
        return;
      reset();
      saver.clear();
    },
  };
}
