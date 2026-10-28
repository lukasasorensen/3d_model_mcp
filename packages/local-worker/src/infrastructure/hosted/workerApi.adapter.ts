import type { HostedWorkerApi } from "../../domains/compute/index.js";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
import * as z from "zod/v4";
const failureSchema = z.object({
  error: z.object({
    code: z.string().max(100),
    message: z.string().max(2000).optional(),
  }),
});
export function createHostedWorkerApi(
  origin: string,
  request: typeof fetch,
): HostedWorkerApi {
  async function send(
    path: string,
    body: string | FormData,
    signal: AbortSignal,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const response = await request(new URL(`/v1/worker/${path}`, origin), {
      method: "POST",
      body,
      signal,
      headers,
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const parsed = failureSchema.safeParse(value);
      if (parsed.success)
        throw new LocalWorkerError(
          parsed.data.error.code,
          parsed.data.error.message ??
            `Hosted worker request failed (${response.status}); check authentication and worker enablement.`,
        );
      throw new LocalWorkerError(
        "HOSTED_REQUEST_FAILED",
        `Hosted worker request failed (${response.status}).`,
      );
    }
    return value;
  }
  return {
    json: (path, body, signal) =>
      send(path, JSON.stringify(body), signal, {
        "content-type": "application/json",
      }),
    upload: (metadata, bytes, signal): Promise<unknown> => {
      const form = new FormData();
      form.set("metadata", JSON.stringify(metadata));
      form.set(
        "artifact",
        new Blob([new Uint8Array(bytes)], {
          type: metadata.format === "stl" ? "model/stl" : "model/3mf",
        }),
        `model.${metadata.format}`,
      );
      return send("exports/complete", form, signal);
    },
  };
}
