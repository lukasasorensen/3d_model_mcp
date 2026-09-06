import type { ProjectEvent } from "@rjls/contracts";
import type { getProjectDatabase } from "@rjls/runtime";

type ChangeSource = ReturnType<typeof getProjectDatabase>["notifications"];

export async function createProjectEventStream(options: {
  request: Request; ownerId: string; projectId: string; changes: Pick<ChangeSource, "subscribe">;
  authorize: () => Promise<void>;
}): Promise<Response> {
  const encoder = new TextEncoder();
  const pending = new Set<ProjectEvent["type"]>();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let draining = false;
  let subscribed = false;
  let checkingHeartbeat = false;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const close = () => {
    if (closed) return;
    closed = true; unsubscribe?.(); clearInterval(heartbeat);
    options.request.signal.removeEventListener("abort", close);
    try { controller.close(); } catch { /* The consumer may already have cancelled. */ }
  };
  const drain = async () => {
    if (closed || draining) return;
    draining = true;
    try {
      while (!closed && pending.size) {
        await options.authorize();
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) { close(); return; }
        const events = [...pending]; pending.clear();
        controller.enqueue(encoder.encode(events.map((type) => `data: ${JSON.stringify({ type })}\n\n`).join("")));
      }
    } catch { close(); }
    finally { draining = false; }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { close(); },
  });
  try {
    unsubscribe = await options.changes.subscribe((event) => {
      if (!event && subscribed) { close(); return; }
      if (event && (event.ownerId !== options.ownerId || event.projectId !== options.projectId)) return;
      pending.add(event ? event.kind === "project" ? "project-updated" : event.kind === "preview" ? "preview-jobs-available" : "render-jobs-available" : "ready");
      void drain();
    });
    subscribed = true;
    if (closed) unsubscribe();
    pending.add("ready"); void drain();
    if (!closed) heartbeat = setInterval(() => {
      if (draining || checkingHeartbeat) return;
      checkingHeartbeat = true;
      void options.authorize().then(() => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) { close(); return; }
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }).catch(close).finally(() => { checkingHeartbeat = false; });
    }, 15_000);
    options.request.signal.addEventListener("abort", close, { once: true });
    if (options.request.signal.aborted) close();
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", "x-content-type-options": "nosniff" } });
  } catch (error) { close(); throw error; }
}
