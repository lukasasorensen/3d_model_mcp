"use client";
import { useEffect, useRef, useState } from "react";
import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { summarizeStl } from "@theoryfoundry/browser-renderer";
import { useBrowserRenderer } from "../../../browser-rendering/browser/index";
import { prepareWorkingPreview } from "../services/workingModelTransport.service";
import type { WorkingModel } from "../../workingModel.schema";
import type {
  WorkingModelOptions,
  WorkingPreview,
} from "../workingDraft.types";

const INPUT_SETTLE_MS = 200;

export function useWorkingPreview(
  projectId: string,
  model: WorkingModel | undefined,
  paused: boolean,
  tryRenderer: WorkingModelOptions["tryDraftRenderer"],
): {
  preview: WorkingPreview | undefined;
  ready: boolean;
  error: string | undefined;
  retry(): void;
} {
  const { renderPreview } = useBrowserRenderer();
  const acquire = useRef(tryRenderer);
  acquire.current = tryRenderer;
  const [result, setResult] = useState<WorkingPreview>();
  const [failure, setFailure] = useState<{
    model: WorkingModel;
    message: string;
  }>();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!model || paused) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer = window.setTimeout(() => void render(), INPUT_SETTLE_MS);

    async function render(): Promise<void> {
      if (signal.aborted || !model) return;
      const renderAbort = new AbortController();
      const release = acquire.current(() => renderAbort.abort());
      if (!release) {
        timer = window.setTimeout(() => void render(), INPUT_SETTLE_MS);
        return;
      }
      const combined = AbortSignal.any([signal, renderAbort.signal]);
      try {
        const source = await prepareWorkingPreview(projectId, model, combined);
        const rendered = await renderPreview(
          source.source,
          source.sourceHash,
          combined,
        );
        combined.throwIfAborted();
        const geometry = summarizeStl(rendered.bytes);
        if (geometry.triangleCount > CAD_LIMITS.previewTriangles)
          throw new Error(
            "The working model exceeds the preview triangle limit.",
          );
        setResult({
          model,
          bytes: rendered.bytes,
          sourceHash: source.sourceHash,
          geometry,
        });
        setFailure(undefined);
      } catch (error) {
        if (signal.aborted) return;
        if (renderAbort.signal.aborted) {
          timer = window.setTimeout(() => void render(), INPUT_SETTLE_MS);
        } else {
          setFailure({
            model,
            message:
              error instanceof Error
                ? error.message
                : "The working model could not be previewed.",
          });
        }
      } finally {
        release();
      }
    }
    return (): void => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [model, paused, projectId, renderPreview, retryCount]);

  return {
    preview: result,
    ready: Boolean(
      model && result?.model === model && failure?.model !== model,
    ),
    error: model && failure?.model === model ? failure.message : undefined,
    retry(): void {
      setFailure(undefined);
      setRetryCount((value) => value + 1);
    },
  };
}
