import { browserRendererProvenance } from "@theoryfoundry/browser-renderer";
import {
  createChromiumRenderer,
  startAssetServer,
} from "./infrastructure/renderer/index.js";
import type { WorkerRenderer } from "./domains/compute/index.js";
export function createWorkerRenderer(directory: URL): WorkerRenderer {
  return createChromiumRenderer(directory, browserRendererProvenance, () =>
    startAssetServer(directory),
  );
}
