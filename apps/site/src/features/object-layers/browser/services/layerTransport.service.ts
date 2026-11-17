import {
  objectLayersSnapshotSchema,
  type ObjectLayersSnapshot,
  type ApplyObjectLayers,
} from "../../objectLayers.schema";
import {
  parameterControlsEventSchema,
  type ParameterControlsEvent,
} from "@theoryfoundry/contracts";

export async function fetchLayers(
  projectId: string,
  revision: string | null,
  signal: AbortSignal,
): Promise<ObjectLayersSnapshot> {
  const response = await fetch(
    `/v1/projects/${encodeURIComponent(projectId)}/layers${revision ? `?revision=${encodeURIComponent(revision)}` : ""}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(
      "Layers could not be loaded. Retry to refresh the saved values.",
    );
  const result = objectLayersSnapshotSchema.parse(await response.json());
  if (revision && result.revision !== revision)
    throw new Error("Layer revision mismatch.");
  return result;
}

export async function applyObjectLayers(
  projectId: string,
  input: ApplyObjectLayers,
  signal: AbortSignal,
  receive: (event: ParameterControlsEvent) => Promise<void> | void,
): Promise<void> {
  const response = await fetch(
    `/v1/projects/${encodeURIComponent(projectId)}/layers`,
    {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-theoryfoundry-session-id": input.sessionId,
      },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok || !response.body)
    throw new Error(
      "The update could not be started. Refresh or retry your draft.",
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let sequence = 0;
  let terminal = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 2_000_000)
        throw new Error("Layer stream exceeded its limit.");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const event = parameterControlsEventSchema.parse(JSON.parse(line));
        if (
          terminal ||
          event.sequence !== sequence++ ||
          event.sessionId !== input.sessionId ||
          event.requestId !== input.requestId
        )
          throw new Error("Parameter response identity mismatch.");
        terminal = event.type === "saved" || event.type === "error";
        await receive(event);
      }
      if (chunk.done) break;
    }
    if (!terminal || buffer.trim())
      throw new Error(
        "The update outcome could not be confirmed. Refresh or retry the same draft.",
      );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
