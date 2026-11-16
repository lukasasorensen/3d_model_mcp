"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ApplyParameterValues,
  ParameterControlsError,
  ParameterControlsSnapshot,
  RemoteMcpBrowserRenderJob,
} from "@theoryfoundry/contracts";
import {
  fetchParameters,
  applyParameterValues,
} from "../services/parameterTransport.service";
import {
  parameterDraft,
  validateParameterDraft,
  reapplyParameterDraft,
  type ParameterDraft,
} from "../utils/parameterDraft.util";

export interface ParameterControlsOptions {
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

export function useParameterControls(options: ParameterControlsOptions): {
  current: ParameterControlsSnapshot | undefined;
  view: ParameterControlsSnapshot | undefined;
  base: ParameterControlsSnapshot | undefined;
  draft: ParameterDraft;
  validation: ReturnType<typeof validateParameterDraft>;
  loading: boolean;
  pending: boolean;
  message: string;
  error: ParameterControlsError | undefined;
  historical: boolean;
  stale: boolean;
  reviewConflicts: string[];
  retryOutcome: boolean;
  change(id: string, value: string | boolean): void;
  reset(defaults?: boolean): void;
  reapply(): void;
  apply(retry?: boolean): Promise<void>;
  acknowledgeConflicts(): void;
  cancel(): void;
  reload(): void;
} {
  const [current, setCurrent] = useState<ParameterControlsSnapshot>();
  const [view, setView] = useState<ParameterControlsSnapshot>();
  const [base, setBase] = useState<ParameterControlsSnapshot>();
  const [draft, setDraft] = useState<ParameterDraft>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ParameterControlsError>();
  const [reload, setReload] = useState(0);
  const [reviewConflicts, setReviewConflicts] = useState<string[]>([]);
  const abort = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const request = useRef<{ payload: string; requestId: string } | undefined>(
    undefined,
  );
  const latest = useRef(options);
  latest.current = options;
  const validation = validateParameterDraft(base?.parameters ?? [], draft);
  const dirtyRef = useRef(false);
  dirtyRef.current = validation.dirty;
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
      fetchParameters(
        options.projectId,
        options.currentRevision,
        controller.signal,
      ),
      historical
        ? fetchParameters(
            options.projectId,
            options.selectedRevision,
            controller.signal,
          )
        : Promise.resolve(undefined),
    ])
      .then(([accepted, selected]) => {
        if (controller.signal.aborted) return;
        const display = selected ?? accepted;
        if (
          options.selectedSourceHash &&
          display.sourceHash !== options.selectedSourceHash
        )
          throw new Error("Parameters do not match the displayed revision.");
        setCurrent(accepted);
        setView(display);
        if (!dirtyRef.current && !abort.current) {
          setBase(accepted);
          setDraft(parameterDraft(accepted.parameters));
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError({
            code: "PARAMETERS_UNAVAILABLE",
            message:
              failure instanceof Error
                ? failure.message
                : "Parameters could not be loaded.",
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

  const reset = (defaults = false): void => {
    if (!current || pending) return;
    setBase(current);
    setDraft(parameterDraft(current.parameters, defaults));
    setError(undefined);
    setReviewConflicts([]);
    request.current = undefined;
    setMessage(
      defaults
        ? "Defaults staged. Apply changes to save them."
        : "Draft discarded.",
    );
  };
  const reapply = (): void => {
    if (!base || !current || pending) return;
    const result = reapplyParameterDraft(
      base.parameters,
      draft,
      current.parameters,
    );
    setBase(current);
    setDraft(result.draft);
    setReviewConflicts(result.conflicts);
    request.current = undefined;
    setError(undefined);
    setMessage(
      "Review the draft against the latest accepted values before applying.",
    );
  };
  const apply = async (retry = false): Promise<void> => {
    if (
      !base?.revision ||
      !base.editable ||
      options.disabled ||
      pending ||
      abort.current ||
      (stale && !retry) ||
      historical ||
      reviewConflicts.length ||
      loading ||
      !validation.operations.length ||
      Object.keys(validation.errors).length
    )
      return;
    if (
      retry &&
      request.current?.payload !==
        JSON.stringify({
          parentRevision: base.revision,
          operations: validation.operations,
        })
    )
      return;
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
        throw new Error("The renderer is busy. Retry when it is available.");
      const payload = JSON.stringify({
        parentRevision: base.revision,
        operations: validation.operations,
      });
      if (request.current?.payload !== payload)
        request.current = { payload, requestId: crypto.randomUUID() };
      const input: ApplyParameterValues = {
        parentRevision: base.revision,
        operations: validation.operations,
        sessionId: options.sessionId,
        requestId: request.current!.requestId,
      };
      await applyParameterValues(
        options.projectId,
        input,
        controller.signal,
        async (event) => {
          if (!mounted.current || controller.signal.aborted) return;
          if (event.type === "render")
            await options.render(event.job, controller.signal);
          else if (event.type === "progress")
            setMessage(
              {
                proposing: "Preparing changes…",
                validating: "Validating the model…",
                promoting: "Saving the validated model…",
              }[event.stage],
            );
          else if (event.type === "error") {
            setError(event.error);
            setMessage("");
          } else {
            saved = true;
            setMessage("Changes saved. Refreshing the accepted model…");
          }
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
      // Reconcile after every outcome, including transport loss and cancellation races.
      await options.refresh().catch(() => false);
      if (mounted.current) {
        if (saved) {
          try {
            const accepted = await fetchParameters(
              options.projectId,
              null,
              AbortSignal.timeout(15_000),
            );
            if (
              mounted.current &&
              accepted.revision !== latest.current.currentRevision
            ) {
              setError({
                code: "REFRESH_FAILED",
                message:
                  "Changes were saved. Refresh the project to display the accepted model and values together.",
              });
            } else if (mounted.current) {
              setCurrent(accepted);
              setBase(accepted);
              setDraft(parameterDraft(accepted.parameters));
              setError(undefined);
              request.current = undefined;
              setMessage("Changes saved.");
            }
          } catch {
            setError({
              code: "REFRESH_FAILED",
              message:
                "Changes were saved, but values could not be refreshed. Retry loading the project.",
            });
          }
        }
        setPending(false);
        latest.current.onPending(false);
        setReload((n) => n + 1);
      }
      abort.current = undefined;
    }
  };
  return {
    current,
    view,
    base,
    draft,
    validation,
    loading,
    pending,
    message,
    error,
    historical,
    stale,
    reviewConflicts,
    change(id: string, value: string | boolean): void {
      setDraft((previous) => ({ ...previous, [id]: value }));
      setError(undefined);
      setMessage("");
    },
    reset,
    reapply,
    apply,
    retryOutcome:
      error?.code === "UPDATE_INTERRUPTED" && Boolean(request.current),
    acknowledgeConflicts(): void {
      setReviewConflicts([]);
    },
    cancel(): void {
      abort.current?.abort();
    },
    reload(): void {
      setError(undefined);
      void latest.current
        .refresh()
        .catch(() => false)
        .finally(() => {
          if (mounted.current) setReload((n) => n + 1);
        });
    },
  };
}
