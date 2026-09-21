import { summarizeStl } from "./mesh-summary";
import { BROWSER_RENDERER, CAD_LIMITS, type BrowserRenderCompletion, type Diagnostic, type GeometrySummary, type RemoteMcpBrowserRenderJob, type LocalMcpBrowserRenderJob } from "@rjls/contracts";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { Group, Mesh, MeshStandardMaterial } from "three";

const previewCache = new Map<string, Uint8Array>();

export type DownloadFormat = "stl" | "3mf" | "glb";

export const DOWNLOAD_MIME_TYPES: Readonly<Record<DownloadFormat, string>> = Object.freeze({
  stl: "model/stl",
  "3mf": "model/3mf",
  glb: "model/gltf-binary",
});

export const browserRendererProvenance = Object.freeze({
  profile: "browser-wasm" as const,
  renderer: "openscad-wasm" as const,
  rendererVersion: "1.0.0",
  openscadVersion: BROWSER_RENDERER.openscadVersion,
  openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
  openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
  bosl2Version: BROWSER_RENDERER.bosl2Version,
  bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}` as const,
  backend: BROWSER_RENDERER.backend,
  commandPolicyVersion: "openscad-browser-manifold-v1",
  validationPolicyVersion: "cad-validation-v1",
});

function diagnosticsFrom(lines: string[], failed: boolean): Diagnostic[] {
  const bounded = lines.slice(-CAD_LIMITS.diagnosticCount).map((message) => ({
    code: failed ? "OPENSCAD_ERROR" as const : "OPENSCAD_MESSAGE" as const,
    severity: failed ? "error" as const : "info" as const,
    message: message.slice(0, CAD_LIMITS.diagnosticMessageCharacters),
  }));
  return failed && bounded.length === 0 ? [{ code: "OPENSCAD_FAILED", severity: "error", message: "OpenSCAD did not produce a usable model." }] : bounded;
}

export async function renderOpenScad(source: string, format: "stl" | "3mf", signal?: AbortSignal): Promise<{ bytes: Uint8Array; diagnostics: Diagnostic[] }> {
  signal?.throwIfAborted();
  const worker = new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module", name: "openscad-render" });
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Browser rendering timed out."))), BROWSER_RENDERER.timeoutMs);
    const abort = () => finish(() => reject(new DOMException("Rendering was cancelled.", "AbortError")));
    const finish = (complete: () => void) => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      complete();
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(() => reject(new Error("The browser OpenSCAD worker failed.")));
    worker.onmessage = (event: MessageEvent<{ ok: boolean; bytes?: Uint8Array; diagnostics?: string[]; message?: string; failureKind?: "operational" | "model" }>) => {
      const diagnostics = diagnosticsFrom(event.data.diagnostics ?? [], !event.data.ok);
      if (!event.data.ok || !event.data.bytes) finish(() => reject(Object.assign(new Error(event.data.message ?? "OpenSCAD rejected the model."), { diagnostics, failureKind: event.data.failureKind ?? "operational" })));
      else {
        const limit = format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
        if (event.data.bytes.byteLength > limit) finish(() => reject(new Error("Rendered output exceeds the browser artifact limit.")));
        else finish(() => resolve({ bytes: event.data.bytes!, diagnostics }));
      }
    };
    worker.postMessage({ source, format, origin: window.location.origin });
  });
}

export function cachedPreview(sourceHash: string): Uint8Array | undefined { return previewCache.get(sourceHash); }

export async function renderPreview(source: string, sourceHash: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; diagnostics: Diagnostic[] }> {
  const cached = previewCache.get(sourceHash);
  if (cached) return { bytes: cached, diagnostics: [] };
  const result = await renderOpenScad(source, "stl", signal);
  previewCache.set(sourceHash, result.bytes);
  return result;
}

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

export async function completeBrowserRender(event: Extract<import("@rjls/contracts").ChatEvent, { type: "browser_render_request" }>): Promise<void> {
  const completion = await renderCompletion(event, event.sessionId);
  const response = await fetch(`/v1/browser-renders/${encodeURIComponent(event.jobId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rjls-session-id": event.sessionId },
    body: JSON.stringify(completion),
  });
  if (!response.ok) throw new Error("The browser render result was not accepted.");
}

export async function completeLocalMcpBrowserRender(job: LocalMcpBrowserRenderJob, sessionId: string, signal?: AbortSignal): Promise<void> {
  const completion = await renderCompletion(job, sessionId, signal);
  const response = await fetch(`/v1/local-mcp/browser-renders/${encodeURIComponent(job.jobId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rjls-session-id": sessionId },
    body: JSON.stringify(completion),
  });
  if (!response.ok) throw new Error("The local MCP browser render result was not accepted.");
}


export async function completeRemoteMcpBrowserRender(job: RemoteMcpBrowserRenderJob, sessionId: string, signal?: AbortSignal): Promise<void> {
  const completion = await renderCompletion(job, sessionId, signal);
  const response = await fetch(`/v1/browser-renders/${encodeURIComponent(job.jobId)}`, {
    method: "POST", signal,
    headers: { "content-type": "application/json", "x-rjls-session-id": sessionId },
    body: JSON.stringify(completion),
  });
  if (!response.ok) throw new Error("The remote MCP render result was not accepted.");
}

function checkedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteLength === 0 || bytes.byteLength > CAD_LIMITS.exportBytes) throw new Error("Generated download exceeds the browser artifact limit.");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function convertStlToGlb(stl: Uint8Array): Promise<Uint8Array> {
  const geometry = new STLLoader().parse(checkedArrayBuffer(stl));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ color: "#dde5dd", roughness: 0.72, metalness: 0.05 });
  const mesh = new Mesh(geometry, material);
  const scene = new Group();
  scene.rotation.x = -Math.PI / 2;
  scene.scale.setScalar(0.001);
  scene.add(mesh);
  try {
    const output = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
    if (!(output instanceof ArrayBuffer)) throw new Error("GLB generation returned an unexpected result.");
    return new Uint8Array(output);
  } finally {
    geometry.dispose();
    material.dispose();
  }
}

export async function generateDownload(source: string, format: DownloadFormat, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mimeType: string; extension: DownloadFormat }> {
  if (format === "3mf") {
    const result = await renderOpenScad(source, "3mf", signal);
    checkedArrayBuffer(result.bytes);
    return { bytes: result.bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
  }
  const result = await renderOpenScad(source, "stl", signal);
  if (format === "stl") {
    checkedArrayBuffer(result.bytes);
    return { bytes: result.bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
  }
  const bytes = await convertStlToGlb(result.bytes);
  checkedArrayBuffer(bytes);
  return { bytes, mimeType: DOWNLOAD_MIME_TYPES[format], extension: format };
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
  if (!response.ok || response.headers.get("x-rjls-source-hash") !== expectedHash || response.headers.get("x-rjls-source-revision") !== revisionId) throw new Error("Revision source failed validation.");
  const source = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const actual = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedHash) throw new Error("Revision source integrity check failed.");
  return source;
}
