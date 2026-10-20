import type { PreviewJob } from "@theoryfoundry/contracts";
import { browserRendererProvenance } from "@theoryfoundry/browser-renderer";
import { renderModelPng } from "./cad-renderer.adapter";

export async function completeModelPreview(job: PreviewJob, sessionId: string, signal: AbortSignal, onRendered: () => void = () => undefined): Promise<void> {
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(), Math.max(0, Date.parse(job.deadline) - Date.now()));
  try {
    let result: { png: string } | { error: "RENDER_FAILED" };
    try { result = { png: await renderModelPng(job, combined) }; }
    catch (error) { if (combined.aborted) throw error; result = { error: "RENDER_FAILED" }; }
    onRendered();
    combined.throwIfAborted();
    const { source: _source, deadline: _deadline, ...binding } = job; void _source; void _deadline;
    const response = await fetch(`/v1/projects/${encodeURIComponent(job.projectId)}/preview-jobs/complete`, {
      method: "POST", signal: combined, headers: { "content-type": "application/json", "x-theoryfoundry-session-id": sessionId },
      body: JSON.stringify({ ...binding, sessionId, provenance: browserRendererProvenance, ...result }),
    });
    if (!response.ok) throw new Error("Preview completion was not accepted.");
  } finally { clearTimeout(timer); }
}
