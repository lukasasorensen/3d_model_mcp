import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
export type AccessTokenProvider = (signal: AbortSignal) => Promise<string>;
const endpoints = new Set([
  "/mcp",
  ...["validation", "exports"].flatMap((kind) =>
    ["begin", "status", "complete", "cancel"].map(
      (action) => `/v1/worker/${kind}/${action}`,
    ),
  ),
  "/v1/worker/preview/source",
]);
export function createAuthorizedFetch(
  origin: string,
  token: AccessTokenProvider,
): typeof fetch {
  const server = new URL(origin);
  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      url.origin !== server.origin ||
      !endpoints.has(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new LocalWorkerError(
        "INVALID_ENDPOINT",
        "Worker attempted an unsupported hosted endpoint.",
      );
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(90_000),
    ]);
    signal.throwIfAborted();
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${await token(signal)}`);
    const response = await fetch(request, {
      headers,
      redirect: "error",
      signal,
    });
    // The hosted MCP endpoint uses bounded JSON responses, never an event stream.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (reader) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2 * 1024 * 1024)
          throw new LocalWorkerError(
            "HOSTED_RESPONSE_TOO_LARGE",
            "Hosted response exceeds its byte limit.",
          );
        chunks.push(part.value);
      }
    } finally {
      await reader?.cancel().catch(() => undefined);
    }
    return new Response(
      response.status === 204 ||
        response.status === 205 ||
        response.status === 304
        ? null
        : Buffer.concat(chunks),
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  };
}
