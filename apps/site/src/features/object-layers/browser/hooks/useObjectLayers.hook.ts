"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ParameterControlsError,
  RemoteMcpBrowserRenderJob,
} from "@theoryfoundry/contracts";
import type { ObjectLayersSnapshot } from "../../objectLayers.schema";
import {
  fetchLayers,
  applyObjectLayers,
} from "../services/layerTransport.service";
import {
  layerDraft,
  layerOperations,
  layerDraftProblem,
  type LayerDraft,
} from "../utils/layerDraft.util";
import { waitForLayerRefresh } from "../utils/layerRefresh.util";
export interface ObjectLayersOptions {
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
export function useObjectLayers(options: ObjectLayersOptions): {
  view: ObjectLayersSnapshot | undefined;
  base: ObjectLayersSnapshot | undefined;
  draft: LayerDraft;
  selected: string | undefined;
  loading: boolean;
  pending: boolean;
  message: string;
  error: ParameterControlsError | undefined;
  historical: boolean;
  stale: boolean;
  dirty: boolean;
  problem: string;
  retryOutcome: boolean;
  select(id: string): void;
  reset(): void;
  apply(retry?: boolean): Promise<void>;
  toggle(id: string): void;
  showFile(id: string): void;
  move(id: string, offset: number): void;
  cancel(): void;
  reload(): void;
} {
  const [current, setCurrent] = useState<ObjectLayersSnapshot>();
  const [view, setView] = useState<ObjectLayersSnapshot>();
  const [base, setBase] = useState<ObjectLayersSnapshot>();
  const [draft, setDraft] = useState<LayerDraft>({
    order: [],
    hidden: [],
    hiddenFiles: [],
  });
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ParameterControlsError>();
  const [reload, setReload] = useState(0);
  const abort = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const latest = useRef(options);
  latest.current = options;
  const request = useRef<{ payload: string; requestId: string } | undefined>(
    undefined,
  );
  const operations = layerOperations(base, draft);
  const dirty = operations.length > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const historical = options.selectedRevision !== options.currentRevision;
  const stale = Boolean(base && base.revision !== options.currentRevision);
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
    setView(undefined);
    void Promise.all([
      fetchLayers(
        options.projectId,
        options.currentRevision,
        controller.signal,
      ),
      historical
        ? fetchLayers(
            options.projectId,
            options.selectedRevision,
            controller.signal,
          )
        : Promise.resolve(undefined),
    ])
      .then(([accepted, history]) => {
        if (controller.signal.aborted) return;
        const display = history ?? accepted;
        if (
          options.selectedSourceHash &&
          display.sourceHash !== options.selectedSourceHash
        )
          throw new Error("Layers do not match the displayed revision.");
        setCurrent(accepted);
        setView(display);
        if (!dirtyRef.current && !abort.current) {
          setBase(accepted);
          setDraft(layerDraft(accepted));
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError({
            code: "LAYERS_UNAVAILABLE",
            message:
              failure instanceof Error
                ? failure.message
                : "Layers could not be loaded.",
          });
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
    historical,
    reload,
  ]);
  const reset = (): void => {
    if (!current || pending) return;
    setBase(current);
    setDraft(layerDraft(current));
    setError(undefined);
    request.current = undefined;
    setMessage("Layer draft discarded.");
  };
  const apply = async (retry = false): Promise<void> => {
    if (
      !base?.revision ||
      !base.state ||
      options.disabled ||
      pending ||
      abort.current ||
      historical ||
      loading ||
      refreshing ||
      !operations.length ||
      (!retry && stale) ||
      layerDraftProblem(base, draft)
    )
      return;
    const payload = JSON.stringify({
      parentRevision: base.revision,
      operations,
    });
    if (retry && request.current?.payload !== payload) return;
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    options.onPending(true);
    setError(undefined);
    let acquired = false;
    let saved = false;
    try {
      acquired = await options.acquire();
      controller.signal.throwIfAborted();
      if (!acquired)
        throw new Error("The renderer is busy. Retry when available.");
      if (request.current?.payload !== payload)
        request.current = { payload, requestId: crypto.randomUUID() };
      await applyObjectLayers(
        options.projectId,
        {
          parentRevision: base.revision,
          operations,
          sessionId: options.sessionId,
          requestId: request.current!.requestId,
        },
        controller.signal,
        async (event) => {
          if (!mounted.current || controller.signal.aborted) return;
          if (event.type === "render")
            await options.render(event.job, controller.signal);
          else if (event.type === "error") {
            setError(event.error);
            setMessage("");
          } else if (event.type === "saved") {
            saved = true;
            setMessage("Layers saved. Refreshing the accepted model…");
          } else
            setMessage(
              {
                proposing: "Preparing layer changes…",
                validating: "Validating the visible model…",
                promoting: "Saving the validated layers…",
              }[event.stage],
            );
        },
      );
    } catch (failure) {
      controller.abort();
      if (mounted.current)
        setError({
          code: "UPDATE_INTERRUPTED",
          message:
            failure instanceof Error && failure.name !== "AbortError"
              ? failure.message
              : "Update cancelled. Checking the saved revision; a completed save may already have committed.",
        });
    } finally {
      if (acquired) options.release();
      const reconciliation = new AbortController();
      abort.current = reconciliation;
      const reportRefreshFailure = (): void => {
        if (mounted.current) {
          setMessage("");
          setError({
            code: saved ? "REFRESH_FAILED" : "UPDATE_INTERRUPTED",
            message: saved
              ? "Layers were saved, but the accepted model could not be refreshed. Refresh saved layers."
              : "The saved outcome could not be confirmed. Your draft is retained; refresh or retry the interrupted update.",
          });
        }
      };
      try {
        if (mounted.current) {
          const refreshed = await waitForLayerRefresh(
            options.refresh,
            reconciliation.signal,
          );
          if (!refreshed) reportRefreshFailure();
          else if (saved) {
            const accepted = await fetchLayers(
              options.projectId,
              null,
              AbortSignal.any([
                reconciliation.signal,
                AbortSignal.timeout(15_000),
              ]),
            );
            if (accepted.revision !== latest.current.currentRevision)
              reportRefreshFailure();
            else if (mounted.current) {
              setCurrent(accepted);
              setBase(accepted);
              setDraft(layerDraft(accepted));
              setError(undefined);
              request.current = undefined;
              setMessage("Layers saved.");
            }
          }
        }
      } catch {
        reportRefreshFailure();
      } finally {
        abort.current = undefined;
        if (mounted.current) {
          setPending(false);
          latest.current.onPending(false);
          setReload((n) => n + 1);
        }
      }
    }
  };
  return {
    view,
    base,
    draft,
    selected,
    loading: loading || refreshing,
    pending,
    message,
    error,
    historical,
    stale,
    dirty,
    problem: layerDraftProblem(base, draft),
    retryOutcome:
      error?.code === "UPDATE_INTERRUPTED" && Boolean(request.current),
    select: setSelected,
    reset,
    apply,
    showFile(id: string): void {
      setDraft((previous) => ({
        ...previous,
        hiddenFiles: previous.hiddenFiles.filter((value) => value !== id),
      }));
      setError(undefined);
      setMessage(
        "Source file visibility staged for all its objects. Individually hidden objects stay hidden.",
      );
    },
    toggle(id: string): void {
      setDraft((previous) => ({
        ...previous,
        hidden: previous.hidden.includes(id)
          ? previous.hidden.filter((value) => value !== id)
          : [...previous.hidden, id],
      }));
      setError(undefined);
      setMessage("");
    },
    move(id: string, offset: number): void {
      setDraft((previous) => {
        const order = [...previous.order];
        const from = order.indexOf(id);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= order.length) return previous;
        order.splice(from, 1);
        order.splice(to, 0, id);
        return { ...previous, order };
      });
      setError(undefined);
      setMessage("Layer order staged. Boolean composition is unchanged.");
    },
    cancel(): void {
      abort.current?.abort();
    },
    reload(): void {
      if (refreshing || pending) return;
      setRefreshing(true);
      const controller = new AbortController();
      void waitForLayerRefresh(latest.current.refresh, controller.signal)
        .then((refreshed) => {
          if (!mounted.current) return;
          if (!refreshed) {
            setError((previous) => ({
              code: previous?.code ?? "REFRESH_FAILED",
              message:
                "The saved layers could not be refreshed within 15 seconds. Your draft and last preview are retained. Retry refreshing when the project connection recovers.",
            }));
            return;
          }
          setError(undefined);
          setReload((n) => n + 1);
        })
        .finally(() => {
          if (mounted.current) setRefreshing(false);
        });
    },
  };
}
