import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { browserRendererProvenance } from "@theoryfoundry/browser-renderer";
import type { WorkerRenderer } from "./domains/compute/index.js";
import type { AssetCache } from "./infrastructure/installation/index.js";
import { createWorkerRenderer } from "./renderer.composition.js";
export function createCachedRenderer(cache: AssetCache): WorkerRenderer {
  let renderer: WorkerRenderer | undefined;
  return {
    provenance: browserRendererProvenance,
    available: () =>
      cache.available() &&
      existsSync(chromium.executablePath()) &&
      (renderer?.available() ?? true),
    render: async (input, signal): ReturnType<WorkerRenderer["render"]> => {
      const directory = await cache.verify(signal);
      signal.throwIfAborted();
      renderer ??= createWorkerRenderer(directory);
      return renderer.render(input, signal);
    },
    close: async (): Promise<void> => {
      await renderer?.close();
      renderer = undefined;
    },
  };
}
