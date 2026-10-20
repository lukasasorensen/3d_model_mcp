import { CAD_LIMITS, type BrowserRenderCompletion, type Diagnostic, type GeometrySummary, type RemoteMcpBrowserRenderJob, type LocalMcpBrowserRenderJob } from "@theoryfoundry/contracts";
import { summarizeStl, browserRendererProvenance } from "@theoryfoundry/browser-renderer";
import { renderPreview } from "./cad-renderer";
export { renderOpenScad, renderPreview, cachedPreview, generateDownload } from "./cad-renderer";
export { browserRendererProvenance, DOWNLOAD_MIME_TYPES, type DownloadFormat } from "@theoryfoundry/browser-renderer";

async function renderCompletion(request: { source: string; sourceHash: string; token: string }, sessionId: string, signal?: AbortSignal): Promise<BrowserRenderCompletion> {
  let outcome: "VALID" | "REJECTED" | "FAILED" = "VALID";
  let geometry: GeometrySummary | undefined;
  let diagnostics: Diagnostic[] = [];
  try {
    const result = await renderPreview(request.source, request.sourceHash, signal);
    diagnostics = result.diagnostics;
    geometry = summarizeStl(result.bytes);
  } catch (error) {
    if (signal?.aborted) throw error;
    outcome = (error as { failureKind?: string }).failureKind === "model" ? "REJECTED" : "FAILED";
    diagnostics = (error as { diagnostics?: Diagnostic[] }).diagnostics ?? [{ code: "OPENSCAD_FAILED", severity: "error", message: "OpenSCAD rejected the model." }];
  }
  return { token: request.token, sessionId, sourceHash: request.sourceHash, outcome, diagnostics, geometry, provenance: browserRendererProvenance };
}

export async function completeBrowserRender(event: Extract<import("@theoryfoundry/contracts").ChatEvent, { type: "browser_render_request" }>): Promise<void> {
  const completion = await renderCompletion(event, event.sessionId);
  const response = await fetch(`/v1/browser-renders/${encodeURIComponent(event.jobId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-theoryfoundry-session-id": event.sessionId },
    body: JSON.stringify(completion),
  });
  if (!response.ok) throw new Error("The browser render result was not accepted.");
}

export async function completeLocalMcpBrowserRender(job: LocalMcpBrowserRenderJob, sessionId: string, signal?: AbortSignal): Promise<void> {
  const completion = await renderCompletion(job, sessionId, signal);
  const response = await fetch(`/v1/local-mcp/browser-renders/${encodeURIComponent(job.jobId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-theoryfoundry-session-id": sessionId },
    body: JSON.stringify(completion),
  });
  if (!response.ok) throw new Error("The local MCP browser render result was not accepted.");
}


export async function completeRemoteMcpBrowserRender(job: RemoteMcpBrowserRenderJob, sessionId: string, signal?: AbortSignal): Promise<void> {
  const completion = await renderCompletion(job, sessionId, signal);
  const response = await fetch(`/v1/browser-renders/${encodeURIComponent(job.jobId)}`, {
    method: "POST", signal,
    headers: { "content-type": "application/json", "x-theoryfoundry-session-id": sessionId },
    body: JSON.stringify(completion),
  });
  if (!response.ok) throw new Error("The remote MCP render result was not accepted.");
}

function checkedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteLength === 0 || bytes.byteLength > CAD_LIMITS.exportBytes) throw new Error("Generated download exceeds the browser artifact limit.");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function downloadGeneratedBytes(bytes: Uint8Array, mimeType: string, filename: string): void {
  const buffer = checkedArrayBuffer(bytes);
  const objectUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export async function fetchRevisionSource(projectId: string, revisionId: string, expectedHash: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/source`, { cache: "no-store", signal });
  if (!response.ok || response.headers.get("x-theoryfoundry-source-hash") !== expectedHash || response.headers.get("x-theoryfoundry-source-revision") !== revisionId) throw new Error("Revision source failed validation.");
  const source = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedHash) throw new Error("Revision source integrity check failed.");
  return source;
}
