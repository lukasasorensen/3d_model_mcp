"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  applyParameterOperations,
  canonicalModelFiles,
} from "@theoryfoundry/contracts";
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
  const modelFiles = fields.modelFiles ?? base?.objects.modelFiles ?? undefined;
  const filesChanged = useMemo(() => {
    const edited = fields.modelFiles;
    if (!edited) return false;
    const saved = base?.objects.modelFiles;
    return (
      dragging ||
      !saved ||
      JSON.stringify(canonicalModelFiles(edited)) !==
        JSON.stringify(canonicalModelFiles(saved))
    );
  }, [base, dragging, fields.modelFiles]);

  const inputProblem = fields.rename
    ? "Finish or cancel the layer name before saving."
    : Object.keys(fields.numeric).length
      ? "Fix the unfinished transform values before saving."
      : Object.keys(validation.errors).length
        ? "Fix the highlighted parameter values before saving."
        : undefined;
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
  const parameters = useMemo(
    () =>
      applyParameterOperations(
        base?.parameters.parameters ?? [],
        validation.operations,
      ),
    [base, validation.operations],
  );

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
      : parameters,
    validation,
    blocked,
    historical,
    dirty,
    stale,
    showingDraft,
    dragging,
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
