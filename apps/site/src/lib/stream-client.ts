import { chatEventSchema, type ChatEvent, type ChatRequest } from "@rjls/contracts";

export class StreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamProtocolError";
  }
}

export async function* parseChatStream(
  body: ReadableStream<Uint8Array>,
  expectedSessionId: string,
): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let expectedSequence = 0;
  let terminalSeen = false;
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done });
      if (buffer.length > 1_000_000) throw new StreamProtocolError("The event stream exceeded its safe line limit.");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let raw: unknown;
        try { raw = JSON.parse(line); }
        catch { throw new StreamProtocolError("The event stream contained invalid JSON."); }
        const parsed = chatEventSchema.safeParse(raw);
        if (!parsed.success || parsed.data.sessionId !== expectedSessionId || parsed.data.sequence !== expectedSequence) {
          throw new StreamProtocolError("The event stream failed sequence or session validation.");
        }
        if (terminalSeen) throw new StreamProtocolError("The event stream continued after its terminal event.");
        expectedSequence += 1;
        terminalSeen = parsed.data.type === "done";
        yield parsed.data;
      }
      if (part.done) break;
    }
    if (buffer.trim()) throw new StreamProtocolError("The event stream ended with an incomplete event.");
    if (!terminalSeen) throw new StreamProtocolError("The event stream ended without a terminal event.");
  } finally {
    reader.releaseLock();
  }
}

export async function streamChat(
  request: ChatRequest,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void | Promise<void>,
): Promise<void> {
  const response = await fetch("/v1/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-rjls-session-id": request.sessionId },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) {
    const unavailable = response.status === 503;
    throw new Error(unavailable ? "The local CAD runtime is unavailable." : "The request could not be started safely.");
  }
  for await (const event of parseChatStream(response.body, request.sessionId)) await onEvent(event);
}
