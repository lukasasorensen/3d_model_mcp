"use client";
import { useEffect, useRef, useState } from "react";
import {
  copyModelObject,
  pasteModelObject,
  objectTransformSchema,
  type ModelFiles,
  type ModelObjectClipboard,
  type ObjectTransform,
  type RemoteMcpBrowserRenderJob,
} from "@theoryfoundry/contracts";
import {
  OBJECT_EDITING_LIMITS,
  type ObjectEditingSnapshot,
  type ApplyObjectEdit,
} from "../../objectEditing.schema";
import {
  fetchObjects,
  applyObjectEdit,
} from "../services/objectTransport.service";
import {
  selectedObjectSource,
  sameObjectSnapshot,
} from "../utils/objectDraft.util";
import { waitForObjectRefresh } from "../utils/objectRefresh.util";

export interface ObjectEditingOptions {
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
}
type EditMode = "apply" | "undo" | "redo";
interface Attempt {
  input: ApplyObjectEdit;
  previous: ModelFiles;
  mode: EditMode;
}

export function useObjectEditing(options: ObjectEditingOptions): {
  snapshot: ObjectEditingSnapshot | undefined;
  draft: ModelFiles | undefined;
  selectedId: string | null;
  selectedObject: ModelFiles["objects"][number] | undefined;
  selectedSource: string | undefined;
  loading: boolean;
  pending: boolean;
  dirty: boolean;
  historical: boolean;
  stale: boolean;
  message: string;
  error: string | undefined;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  retryOutcome: boolean;
  retry(): Promise<void>;
  select(id: string): void;
  changeTransform(transform: ObjectTransform): void;
  copy(): void;
  paste(): void;
  cancel(): void;
  apply(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  reload(): void;
} {
  const [snapshot, setSnapshot] = useState<ObjectEditingSnapshot>();
  const [draft, setDraft] = useState<ModelFiles>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ModelObjectClipboard>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  const [reloadCount, setReloadCount] = useState(0);
  const [past, setPast] = useState<ModelFiles[]>([]);
  const [future, setFuture] = useState<ModelFiles[]>([]);
  const abort = useRef<AbortController | undefined>(undefined);
  const attempt = useRef<Attempt | undefined>(undefined);
  const mounted = useRef(true);
  const latest = useRef(options);
  latest.current = options;
  const draftDirty = !sameObjectSnapshot(draft, snapshot?.modelFiles);
  const dirty = useRef(draftDirty);
  dirty.current = draftDirty;
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  const historical = options.selectedRevision !== options.currentRevision;
  const stale = Boolean(
    snapshot && snapshot.revision !== options.currentRevision,
  );
  const blocked = options.disabled || pending || loading || historical || stale;
  const selectedObject = draft?.objects.find((item) => item.id === selectedId);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
      abort.current?.abort();
      latest.current.onPending(false);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchObjects(
      options.projectId,
      options.selectedRevision,
      controller.signal,
    )
      .then((accepted) => {
        if (controller.signal.aborted) return;
        if (
          options.selectedSourceHash &&
          accepted.sourceHash !== options.selectedSourceHash
        )
          throw new Error(
            "Objects do not match the displayed revision. Reload the project.",
          );
        if (!dirty.current && !abort.current && !attempt.current) {
          if (currentSnapshot.current?.revision !== accepted.revision) {
            setPast([]);
            setFuture([]);
          }
          setSnapshot(accepted);
          setDraft(accepted.modelFiles ?? undefined);
          setSelectedId((id) =>
            accepted.modelFiles?.objects.some((item) => item.id === id)
              ? id
              : (accepted.modelFiles?.objects[0]?.id ?? null),
          );
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Objects could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return (): void => controller.abort();
  }, [
    options.projectId,
    options.currentRevision,
    options.selectedRevision,
    options.selectedSourceHash,
    reloadCount,
  ]);

  const commit = async (mode: EditMode): Promise<void> => {
    const target =
      mode === "undo" ? past.at(-1) : mode === "redo" ? future.at(-1) : draft;
    const existing = attempt.current;
    const exactRetry = Boolean(
      existing &&
      existing.mode === mode &&
      existing.input.parentRevision === snapshot?.revision &&
      sameObjectSnapshot(existing.input.modelFiles, target),
    );
    if (
      !target ||
      !snapshot?.revision ||
      !snapshot.modelFiles ||
      options.disabled ||
      pending ||
      loading ||
      historical ||
      (stale && !exactRetry) ||
      abort.current ||
      (mode !== "apply" && draftDirty) ||
      (mode === "apply" && !draftDirty)
    )
      return;
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    options.onPending(true);
    setError(undefined);
    if (
      !existing ||
      existing.mode !== mode ||
      existing.input.parentRevision !== snapshot.revision ||
      !sameObjectSnapshot(existing.input.modelFiles, target)
    ) {
      attempt.current = {
        input: {
          parentRevision: snapshot.revision,
          modelFiles: structuredClone(target),
          requestId: crypto.randomUUID(),
          sessionId: options.sessionId,
        },
        previous: structuredClone(snapshot.modelFiles),
        mode,
      };
    }
    const operation = attempt.current!;
    let acquired = false;
    let savedRevision: string | undefined;
    try {
      acquired = await options.acquire();
      controller.signal.throwIfAborted();
      if (!acquired)
        throw new Error("The renderer is busy. Retry when it is available.");
      await applyObjectEdit(
        options.projectId,
        operation.input,
        controller.signal,
        async (event) => {
          if (!mounted.current || controller.signal.aborted) return;
          if (event.type === "render")
            await options.render(event.job, controller.signal);
          else if (event.type === "progress")
            setMessage(
              {
                proposing: "Preparing object changes…",
                validating: "Validating the model…",
                promoting: "Saving the validated model…",
              }[event.stage],
            );
          else if (event.type === "error") {
            setError(event.error.message);
            setMessage("");
          } else {
            savedRevision = event.revision;
            setMessage("Changes saved. Refreshing the model…");
          }
        },
      );
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error && failure.name !== "AbortError"
            ? failure.message
            : "Update interrupted. Refresh or retry to confirm whether it saved.",
        );
        setMessage("");
      }
    }
    if (acquired) options.release();
    const reconciliation = new AbortController();
    abort.current = reconciliation;
    try {
      if (mounted.current) {
        const refreshed = await waitForObjectRefresh(
          options.refresh,
          reconciliation.signal,
        );
        if (!refreshed)
          throw new Error(
            savedRevision
              ? "Changes were saved, but the project could not be refreshed. Reload to display the accepted model."
              : "The outcome could not be confirmed. Your draft is retained; reload or retry the update.",
          );
        if (savedRevision) {
          const accepted = await fetchObjects(
            options.projectId,
            null,
            reconciliation.signal,
          );
          if (
            accepted.revision !== savedRevision ||
            accepted.revision !== latest.current.currentRevision
          )
            throw new Error(
              "The accepted revision changed. Reload the project before making another edit.",
            );
          if (mounted.current) {
            setSnapshot(accepted);
            setDraft(accepted.modelFiles ?? undefined);
            if (mode === "apply") {
              setPast((items) =>
                [...items, operation.previous].slice(
                  -OBJECT_EDITING_LIMITS.history,
                ),
              );
              setFuture([]);
            } else if (mode === "undo") {
              setPast((items) => items.slice(0, -1));
              setFuture((items) => [...items, operation.previous]);
            } else {
              setFuture((items) => items.slice(0, -1));
              setPast((items) => [...items, operation.previous]);
            }
            setSelectedId((id) =>
              accepted.modelFiles?.objects.some((item) => item.id === id)
                ? id
                : (accepted.modelFiles?.objects[0]?.id ?? null),
            );
            attempt.current = undefined;
            setError(undefined);
            setMessage(
              mode === "undo"
                ? "Edit undone."
                : mode === "redo"
                  ? "Edit redone."
                  : "Object changes saved.",
            );
          }
        }
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error ? failure.message : "Refresh failed.",
        );
        setMessage("");
      }
    } finally {
      abort.current = undefined;
      if (mounted.current) {
        setPending(false);
        latest.current.onPending(false);
        setReloadCount((count) => count + 1);
      }
    }
  };
  return {
    snapshot,
    draft,
    selectedId,
    selectedObject,
    selectedSource: selectedObjectSource(
      draft,
      selectedId,
      snapshot?.parameters ?? [],
    ),
    loading,
    pending,
    dirty: draftDirty,
    historical,
    stale,
    message,
    error,
    canUndo: !blocked && !draftDirty && past.length > 0,
    canRedo: !blocked && !draftDirty && future.length > 0,
    canPaste: !blocked && Boolean(clipboard),
    retryOutcome:
      !options.disabled &&
      !pending &&
      !loading &&
      !historical &&
      Boolean(error && attempt.current),
    retry: () =>
      attempt.current ? commit(attempt.current.mode) : Promise.resolve(),
    select(id): void {
      if (
        !pending &&
        (id === "" || draft?.objects.some((item) => item.id === id))
      )
        setSelectedId(id || null);
    },
    changeTransform(transform): void {
      if (blocked || !selectedId) return;
      const parsed = objectTransformSchema.safeParse(transform);
      if (!parsed.success) {
        setError(
          "Use finite positions and angles, and positive supported scales.",
        );
        return;
      }
      setDraft((value) =>
        value
          ? {
              ...value,
              objects: value.objects.map((item) =>
                item.id === selectedId
                  ? { ...item, transform: parsed.data }
                  : item,
              ),
            }
          : value,
      );
      attempt.current = undefined;
      setError(undefined);
      setMessage("Changes staged. Apply to save them.");
    },
    copy(): void {
      if (!draft || !selectedId || blocked) {
        setError("Select an available object before copying.");
        return;
      }
      try {
        setClipboard(
          copyModelObject({
            projectId: options.projectId,
            modelFiles: draft,
            objectId: selectedId,
            parameters: snapshot?.parameters ?? [],
          }),
        );
        setError(undefined);
        setMessage(
          `Copied ${selectedObject?.name ?? "object"} within this project.`,
        );
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The object could not be copied.",
        );
      }
    },
    paste(): void {
      if (blocked || !draft || !clipboard) {
        setError("Copy an object in this project before pasting.");
        return;
      }
      try {
        const objectId = crypto.randomUUID();
        setDraft(
          pasteModelObject({
            projectId: options.projectId,
            modelFiles: draft,
            clipboard,
            objectId,
            fileId: crypto.randomUUID(),
            parameters: snapshot?.parameters ?? [],
          }),
        );
        setSelectedId(objectId);
        attempt.current = undefined;
        setError(undefined);
        setMessage(
          "Independent copy staged. Apply to save it, or Cancel to discard it.",
        );
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The copy could not be pasted.",
        );
      }
    },
    cancel(): void {
      if (pending) return;
      setDraft(snapshot?.modelFiles ?? undefined);
      setError(undefined);
      setMessage("Draft discarded.");
      attempt.current = undefined;
      setSelectedId((id) =>
        snapshot?.modelFiles?.objects.some((item) => item.id === id)
          ? id
          : (snapshot?.modelFiles?.objects[0]?.id ?? null),
      );
    },
    apply: () => commit("apply"),
    undo: () => commit("undo"),
    redo: () => commit("redo"),
    reload(): void {
      if (pending) return;
      dirty.current = false;
      setDraft(undefined);
      setSnapshot(undefined);
      setPast([]);
      setFuture([]);
      attempt.current = undefined;
      setError(undefined);
      void latest.current
        .refresh()
        .catch(() => false)
        .finally(() => {
          if (mounted.current) setReloadCount((count) => count + 1);
        });
    },
  };
}
