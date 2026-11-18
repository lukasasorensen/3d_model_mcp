"use client";
import { useEffect, useState } from "react";
import { fetchObjects } from "../../../object-editing/browser/index";
import { fetchLayers } from "../../../object-layers/browser/index";
import { fetchParameters } from "../../../parameter-controls/browser/index";
import type { WorkingBase } from "../workingDraft.types";

async function loadWorkingBase(
  projectId: string,
  revision: string,
  expectedHash: string | undefined,
  signal: AbortSignal,
): Promise<WorkingBase> {
  const [objects, layers, parameters] = await Promise.all([
    fetchObjects(projectId, revision, signal),
    fetchLayers(projectId, revision, signal),
    fetchParameters(projectId, revision, signal),
  ]);
  if (
    [objects, layers, parameters].some(
      (snapshot) =>
        snapshot.revision !== revision ||
        snapshot.sourceHash !== objects.sourceHash ||
        (expectedHash !== undefined && snapshot.sourceHash !== expectedHash),
    )
  )
    throw new Error("Editor data does not match the saved revision.");
  return { revision, objects, parameters, layers };
}
export function useWorkingBase(
  projectId: string,
  revision: string | null,
  sourceHash: string | undefined,
  retry: number,
): {
  base: WorkingBase | undefined;
  error: string | undefined;
  loading: boolean;
} {
  const [result, setResult] = useState<{
    revision: string;
    base?: WorkingBase;
    error?: string;
  }>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!revision) return;
    const controller = new AbortController();
    setPending(true);
    void loadWorkingBase(projectId, revision, sourceHash, controller.signal)
      .then((base) => {
        if (!controller.signal.aborted) setResult({ revision, base });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            revision,
            error:
              reason instanceof Error
                ? reason.message
                : "Editor data could not be loaded.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return (): void => controller.abort();
  }, [projectId, revision, sourceHash, retry]);

  return {
    base: result?.revision === revision ? result.base : undefined,
    error: result?.revision === revision ? result.error : undefined,
    loading: Boolean(revision && (pending || result?.revision !== revision)),
  };
}
