import type { CadRenderer } from "@theoryfoundry/contracts";
import type { BrowserRenderRequest } from "./browserRender.types.js";
export interface PostgresBrowserRenderCoordinator extends CadRenderer {
  subscribe(
    candidateId: string,
    sessionId: string,
    callback: (request: BrowserRenderRequest) => void,
  ): () => void;
  complete(jobId: string, raw: unknown): Promise<void>;
}
