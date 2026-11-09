import { Agent, fetch as request } from "undici";
import { AI_LIMITS, AiConnectionError } from "@theoryfoundry/contracts";
import { resolvePublicAiEndpoint } from "../../shared/utils/publicAiEndpoint.util.js";

export function createPublicAiFetch(endpoint: string): typeof fetch {
  return (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const outbound = new Request(input, init);
    const target = new URL(outbound.url);
    const configured = new URL(endpoint);
    if (target.origin !== configured.origin)
      throw new AiConnectionError("AI_CONFIGURATION");
    const { addresses } = await resolvePublicAiEndpoint(endpoint);
    const selected = addresses[0]!;
    const agent = new Agent({
      connect: {
        lookup: (_hostname, options, callback): void => {
          if (options.all) callback(null, addresses);
          else callback(null, selected.address, selected.family);
        },
      },
    });
    try {
      const response = await request(target, {
        method: outbound.method,
        headers: Object.fromEntries(outbound.headers.entries()),
        ...(outbound.body ? { body: outbound.body, duplex: "half" } : {}),
        signal: outbound.signal,
        redirect: "manual",
        dispatcher: agent,
      } as Parameters<typeof request>[1]);
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new AiConnectionError("AI_CONFIGURATION");
      }
      // undici has decoded compression before the bounded reader counts bytes.
      return await boundedAiResponse(
        new Response(response.body, {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
        }),
        { complete: () => agent.close(), abort: () => agent.destroy() },
      );
    } catch (error) {
      await agent.destroy();
      throw error;
    }
  }) as typeof fetch;
}

export async function boundedAiResponse(
  response: Response,
  lifetime: { complete(): Promise<void>; abort(): Promise<void> },
): Promise<Response> {
  const reader = response.body?.getReader();
  if (!reader) {
    await lifetime.complete();
    return response;
  }
  // SSE framing has overhead beyond model content; both limits count decoded bytes.
  const limit =
    response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() === "text/event-stream"
      ? AI_LIMITS.providerStreamBytes
      : AI_LIMITS.resultBytes;
  let bytes = 0;
  let released = false;
  const dispose = async (aborted: boolean): Promise<void> => {
    if (released) return;
    released = true;
    if (aborted) {
      try {
        await reader.cancel();
      } finally {
        await lifetime.abort();
      }
    } else {
      try {
        await lifetime.complete();
      } catch (error) {
        await lifetime.abort();
        throw error;
      }
    }
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      try {
        const part = await reader.read();
        if (part.done) {
          controller.close();
          await dispose(false);
          return;
        }
        bytes += part.value.byteLength;
        if (bytes > limit) throw new AiConnectionError("AI_RESPONSE_TOO_LARGE");
        controller.enqueue(part.value);
      } catch (error) {
        controller.error(error);
        await dispose(true);
      }
    },
    async cancel(): Promise<void> {
      await dispose(true);
    },
  });
  return new Response(body, {
    status: response.status,
    headers: response.headers,
  });
}
