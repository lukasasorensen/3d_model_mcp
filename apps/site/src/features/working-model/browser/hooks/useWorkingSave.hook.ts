"use client";
import { useEffect, useRef, useState } from "react";
import { streamModelUpdate } from "../../../parameter-controls/browser/index";
import type { WorkingModelOptions } from "../workingDraft.types";
import type { WorkingModel } from "../../workingModel.schema";

export function useWorkingSave(
  options: WorkingModelOptions,
  parent: string | null,
  requestId: string | undefined,
  rememberRequest: (requestId: string | undefined) => void,
  complete: () => void,
): {
  saving: boolean;
  phase: string;
  error: string | undefined;
  rejected: WorkingModel | undefined;
  conflictParent: string | undefined;
  save(model: WorkingModel): Promise<void>;
  clear(): void;
} {
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string>();
  const [rejected, setRejected] = useState<WorkingModel>();
  const [conflictParent, setConflictParent] = useState<string>();
  const abort = useRef<AbortController | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const projectId = options.projectId;
  const latest = useRef({ complete, ...options });
  latest.current = { complete, ...options };

  useEffect(() => (): void => abort.current?.abort(), []);
  useEffect(() => {
    if (!requestId || !parent || saving) return;
    const saved = options.revisions.find(
      (revision) =>
        revision.projectId === projectId &&
        revision.parentRevision === parent &&
        revision.requestId === requestId &&
        revision.toolCallId === requestId,
    );
    if (saved) {
      latest.current.complete();
      setPhase("Revision saved.");
      setError(undefined);
    }
  }, [options.revisions, parent, projectId, requestId, saving]);

  async function save(model: WorkingModel): Promise<void> {
    if (abort.current || !options.sessionId) return;
    const identity = requestId ?? crypto.randomUUID();
    const controller = new AbortController();
    const { signal } = controller;
    abort.current = controller;
    setSaving(true);
    latest.current.onPending(true);
    rememberRequest(identity);
    setError(undefined);
    setPhase("Preparing to save…");
    let acquired = false;
    let confirmed = false;
    let recordRetry = true;
    try {
      acquired = await options.acquire();
      signal.throwIfAborted();
      if (!acquired) throw new Error("The renderer is busy. Try Save again.");
      await streamModelUpdate(
        projectId,
        "draft/save",
        {
          ...model,
          requestId: identity,
          sessionId: options.sessionId,
        },
        signal,
        async (event) => {
          switch (event.type) {
            case "progress":
              setPhase(
                event.stage === "proposing"
                  ? "Preparing to save…"
                  : event.stage === "validating"
                    ? "Validating the working model…"
                    : "Saving the revision…",
              );
              break;
            case "render":
              await options.render(event.job, signal);
              break;
            case "error":
              recordRetry = ![
                "STALE_REVISION",
                "MODEL_REJECTED",
                "INVALID_PARAMETERS",
                "INVALID_MODEL_FILES",
              ].includes(event.error.code);
              if (event.error.code === "MODEL_REJECTED") setRejected(model);
              if (event.error.code === "STALE_REVISION")
                setConflictParent(model.parentRevision);
              setError(event.error.message);
              setPhase("");
              break;
            case "saved":
              confirmed = true;
              setPhase("Revision saved. Refreshing the workspace…");
              break;
          }
        },
      );
    } catch (reason) {
      if (!signal.aborted && !confirmed) {
        setError(
          reason instanceof Error
            ? reason.message
            : "The save outcome could not be confirmed.",
        );
        setPhase("");
      }
    } finally {
      if (acquired) options.release();
      if (!signal.aborted) {
        const refreshed = await options.refresh().catch(() => false);
        if (!signal.aborted) {
          if (confirmed && refreshed) {
            complete();
            setPhase("Revision saved.");
            setError(undefined);
          } else if (confirmed) {
            setError(
              "Revision saved. Reload the workspace to refresh its history.",
            );
          } else if (!recordRetry) {
            rememberRequest(undefined);
          }
          if (!confirmed && !refreshed && recordRetry)
            setError(
              "The save outcome could not be confirmed. Retry the same draft or reload.",
            );
          setSaving(false);
        }
      }
      abort.current = undefined;
      latest.current.onPending(false);
    }
  }

  return {
    saving,
    rejected,
    conflictParent,
    phase,
    error,
    save,
    clear(): void {
      setError(undefined);
      setPhase("");
      setRejected(undefined);
      setConflictParent(undefined);
    },
  };
}
