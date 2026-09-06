import { projectEventSchema, type ProjectEvent } from "@rjls/contracts";

/** One connection attempt; callers own retry policy and lifecycle. */
export async function receiveProjectEvents(projectId: string, signal: AbortSignal, receive: (event: ProjectEvent) => void, heartbeat: () => void = () => undefined): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const touch = () => { clearTimeout(watchdog); watchdog = setTimeout(abort, 45_000); };
  try {
    touch();
    const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/events`, { signal: controller.signal, cache: "no-store", headers: { accept: "text/event-stream" } });
    if ([401, 403, 404].includes(response.status)) return false;
    if (!response.ok || !response.body) throw new Error("Project events unavailable.");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      touch(); buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 64 * 1024) throw new Error("Project event exceeds size limit.");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const json = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (frame.split("\n").some((line) => line === ": heartbeat")) heartbeat();
        if (json) receive(projectEventSchema.parse(JSON.parse(json)));
      }
    }
  } finally {
    clearTimeout(watchdog); signal.removeEventListener("abort", abort);
    await reader?.cancel().catch(() => undefined);
    controller.abort();
  }
}
