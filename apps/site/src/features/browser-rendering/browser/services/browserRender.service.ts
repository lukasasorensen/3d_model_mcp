import {
  browserRendererProvenance,
  summarizeStl,
} from "@theoryfoundry/browser-renderer";
import {
  type BrowserRenderCompletion,
  type Diagnostic,
  type ChatEvent,
  type GeometrySummary,
  type LocalMcpBrowserRenderJob,
  type RemoteMcpBrowserRenderJob,
} from "@theoryfoundry/contracts";
import type { BrowserRenderer } from "../browserRenderer.port";
export {
  browserRendererProvenance,
  DOWNLOAD_MIME_TYPES,
  type DownloadFormat,
} from "@theoryfoundry/browser-renderer";

async function renderCompletion(
  renderPreview: BrowserRenderer["renderPreview"],
  request: { source: string; sourceHash: string; token: string },
  sessionId: string,
  signal?: AbortSignal,
): Promise<BrowserRenderCompletion> {
  let outcome: "VALID" | "REJECTED" | "FAILED" = "VALID";
  let geometry: GeometrySummary | undefined;
  let diagnostics: Diagnostic[];
  try {
    const result = await renderPreview(
      request.source,
      request.sourceHash,
      signal,
    );
    diagnostics = result.diagnostics;
    geometry = summarizeStl(result.bytes);
  } catch (error) {
    if (signal?.aborted) throw error;
    outcome =
      (error as { failureKind?: string }).failureKind === "model"
        ? "REJECTED"
        : "FAILED";
    diagnostics = (error as { diagnostics?: Diagnostic[] }).diagnostics ?? [
      {
        code: "OPENSCAD_FAILED",
        severity: "error",
        message: "OpenSCAD rejected the model.",
      },
    ];
  }
  return {
    token: request.token,
    sessionId,
    sourceHash: request.sourceHash,
    outcome,
    diagnostics,
    geometry,
    provenance: browserRendererProvenance,
  };
}

export async function completeBrowserRender(
  renderPreview: BrowserRenderer["renderPreview"],
  event: Extract<ChatEvent, { type: "browser_render_request" }>,
): Promise<void> {
  const completion = await renderCompletion(
    renderPreview,
    event,
    event.sessionId,
  );
  const response = await fetch(
    `/v1/browser-renders/${encodeURIComponent(event.jobId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-theoryfoundry-session-id": event.sessionId,
      },
      body: JSON.stringify(completion),
    },
  );
  if (!response.ok)
    throw new Error("The browser render result was not accepted.");
}

export async function completeLocalMcpBrowserRender(
  renderPreview: BrowserRenderer["renderPreview"],
  job: LocalMcpBrowserRenderJob,
  sessionId: string,
  signal?: AbortSignal,
): Promise<void> {
  const completion = await renderCompletion(
    renderPreview,
    job,
    sessionId,
    signal,
  );
  const response = await fetch(
    `/v1/local-mcp/browser-renders/${encodeURIComponent(job.jobId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-theoryfoundry-session-id": sessionId,
      },
      body: JSON.stringify(completion),
    },
  );
  if (!response.ok)
    throw new Error("The local MCP browser render result was not accepted.");
}

export async function completeRemoteMcpBrowserRender(
  renderPreview: BrowserRenderer["renderPreview"],
  job: RemoteMcpBrowserRenderJob,
  sessionId: string,
  signal?: AbortSignal,
): Promise<void> {
  const completion = await renderCompletion(
    renderPreview,
    job,
    sessionId,
    signal,
  );
  const response = await fetch(
    `/v1/browser-renders/${encodeURIComponent(job.jobId)}`,
    {
      method: "POST",
      ...(signal ? { signal } : {}),
      headers: {
        "content-type": "application/json",
        "x-theoryfoundry-session-id": sessionId,
      },
      body: JSON.stringify(completion),
    },
  );
  if (!response.ok)
    throw new Error("The remote MCP render result was not accepted.");
}
