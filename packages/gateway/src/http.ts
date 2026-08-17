import { CHAT_LIMITS, chatRequestSchema, type ChatRequest } from "@rjls/contracts";

import type { ChatOrchestratorOptions } from "./orchestrator.js";
import { streamCadChat } from "./orchestrator.js";

export interface ChatRouteOptions {
  allowedOrigin: string;
  getOrchestrator(request: ChatRequest): Promise<ChatOrchestratorOptions>;
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function readBoundedBody(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > CHAT_LIMITS.requestBytes)) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let part = await reader.read();
  while (!part.done) {
    bytes += part.value.byteLength;
    if (bytes > CHAT_LIMITS.requestBytes) {
      await reader.cancel();
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(part.value);
    part = await reader.read();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new Error("INVALID_JSON"); }
}

export function createChatRouteHandler(options: ChatRouteOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.headers.get("origin") !== options.allowedOrigin) return jsonError(403, "ORIGIN_DENIED", "The request origin is not allowed.");
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return jsonError(415, "INVALID_REQUEST", "Expected an application/json request.");
    let raw: unknown;
    try { raw = await readBoundedBody(request); }
    catch (error) { return jsonError(error instanceof Error && error.message === "REQUEST_TOO_LARGE" ? 413 : 400, "INVALID_REQUEST", "The chat request is invalid."); }
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) return jsonError(400, "INVALID_REQUEST", "The chat request is invalid.");
    if (request.headers.get("x-rjls-session-id") !== parsed.data.sessionId) return jsonError(409, "SESSION_MISMATCH", "The chat session does not match.");
    const orchestrator = await options.getOrchestrator(parsed.data).catch(() => undefined);
    if (!orchestrator) return jsonError(503, "INTERNAL_ERROR", "The local CAD runtime is unavailable.");
    const encoder = new TextEncoder();
    const responseAbort = new AbortController();
    const streamSignal = AbortSignal.any([request.signal, responseAbort.signal]);
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of streamCadChat(parsed.data, orchestrator, streamSignal)) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          controller.close();
        } catch {
          if (!responseAbort.signal.aborted) controller.error(new Error("The chat stream failed safely."));
        }
      },
      cancel() { responseAbort.abort(); },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  };
}
