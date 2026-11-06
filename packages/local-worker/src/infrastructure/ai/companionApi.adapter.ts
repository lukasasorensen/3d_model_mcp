import { AI_LIMITS, AiConnectionError } from "@theoryfoundry/contracts";
import type { CompanionApi } from "../../domains/ai/index.js";

export function createCompanionApi(
  origin: string,
  secret: string,
  token: (signal: AbortSignal) => Promise<string>,
  request: typeof fetch = fetch,
): CompanionApi {
  return {
    async send(action, body, signal): Promise<unknown> {
      const bounded = AbortSignal.any([
        signal,
        AbortSignal.timeout(AI_LIMITS.pollMs + 10_000),
      ]);
      const response = await request(
        new URL(`/v1/ai/companion/${action}`, origin),
        {
          method: "POST",
          redirect: "error",
          signal: bounded,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${await token(bounded)}`,
            "x-theoryfoundry-companion-key": secret,
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new AiConnectionError(
          response.status === 401
            ? "AI_AUTHENTICATION"
            : response.status === 404
              ? "AI_CONFIGURATION"
              : "AI_PROVIDER_FAILURE",
        );
      }
      const reader = response.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (reader) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > AI_LIMITS.invocationBytes + 4096) throw new Error();
          chunks.push(part.value);
        }
      } finally {
        await reader?.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    },
  };
}
