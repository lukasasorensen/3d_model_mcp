import { timingSafeEqual, createHash } from "node:crypto";
import * as z from "zod/v4";
import type { LocalSetupService } from "../services/localSetup.service.js";
const inputSchema = z
  .object({
    email: z.string().email().max(254),
    name: z.string().trim().min(1).max(200),
    password: z.string().min(12).max(256),
  })
  .strict();
export function localSetupHandler(
  origin: string | undefined,
  token: string | undefined,
  service: Pick<LocalSetupService, "create">,
): (request: Request) => Promise<Response> {
  return async (request): Promise<Response> => {
    const fail = (code: string, status: number): Response =>
      Response.json(
        { error: { code } },
        { status, headers: { "cache-control": "no-store" } },
      );
    if (!origin || !token) return fail("NOT_FOUND", 404);
    if (
      request.headers.get("origin") !== origin ||
      (request.headers.get("host") ?? new URL(request.url).host) !==
        new URL(origin).host
    )
      return fail("ORIGIN_DENIED", 403);
    const supplied = request.headers.get("x-theoryfoundry-setup") ?? "";
    const hash = (value: string): Buffer =>
      createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(supplied), hash(token)))
      return fail("SETUP_DENIED", 403);
    try {
      const reader = request.body?.getReader();
      if (!reader) return fail("INVALID_INPUT", 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            return fail("INVALID_INPUT", 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const input = inputSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      const response = await service.create(input);
      response.headers.set("cache-control", "no-store");
      return response;
    } catch {
      return fail("SETUP_UNAVAILABLE", 400);
    }
  };
}
