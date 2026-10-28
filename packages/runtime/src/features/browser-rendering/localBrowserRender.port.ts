import type { LocalMcpBrowserRenderJob } from "@theoryfoundry/contracts";
export interface LocalBrowserRenderer {
  claimNext(
    projectId: string,
    sessionId: string,
  ): Promise<LocalMcpBrowserRenderJob | null>;
  complete(jobId: string, raw: unknown): Promise<void>;
}
