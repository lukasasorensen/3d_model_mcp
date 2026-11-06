import { Agent, fetch as request } from "undici";
import { AiConnectionError } from "@theoryfoundry/contracts";
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
      // Keep streaming and its cancellation tied to the per-request dispatcher.
      const reader = response.body?.getReader();
      const body = reader
        ? new ReadableStream<Uint8Array>({
            async pull(controller): Promise<void> {
              try {
                const part = await reader.read();
                if (part.done) {
                  controller.close();
                  await agent.close();
                } else controller.enqueue(part.value);
              } catch (error) {
                controller.error(error);
                await agent.destroy();
              }
            },
            async cancel(): Promise<void> {
              await reader.cancel();
              await agent.destroy();
            },
          })
        : null;
      if (!reader) await agent.close();
      return new Response(body, {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error) {
      await agent.destroy();
      throw error;
    }
  }) as typeof fetch;
}
