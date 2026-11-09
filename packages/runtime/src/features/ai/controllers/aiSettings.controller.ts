import { readAiJson } from "../utils/aiRequest.util.js";
import * as z from "zod/v4";
import {
  aiConnectionInputSchema,
  modelIdSchema,
  safeAiError,
} from "@theoryfoundry/contracts";
import type { AiConnectionsStore } from "../../../domains/ai/index.js";
import type { AiConnectionsWorkflow } from "../workflows/aiConnections.workflow.js";

export async function handleAiSettings(
  request: Request,
  owner: string,
  parts: string[],
  dependencies: { store: AiConnectionsStore; workflow: AiConnectionsWorkflow },
): Promise<Response> {
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  const json = (data: unknown, status = 200): Response =>
    Response.json(data, { status, headers });
  try {
    if (parts[0] !== "connections")
      return json({ error: { message: "Not found." } }, 404);
    const id = parts[1];
    if (!id && request.method === "GET")
      return json(await dependencies.store.list(owner));
    if (id && !z.uuid().safeParse(id).success)
      return json({ error: { message: "Invalid connection." } }, 400);
    if (id && parts.length === 2 && request.method === "DELETE") {
      await dependencies.store.remove(owner, id);
      return json({ ok: true });
    }
    if (!["POST", "PUT"].includes(request.method))
      return json({ error: { message: "Method not allowed." } }, 405);
    const raw = await readAiJson(request, 16 * 1024);
    if (
      (!id && request.method === "POST") ||
      (id && parts.length === 2 && request.method === "PUT")
    ) {
      const parsed = aiConnectionInputSchema.safeParse(raw);
      if (!parsed.success)
        return json(
          {
            error: {
              message: parsed.error.issues[0]?.message ?? "Invalid connection.",
            },
          },
          400,
        );
      if (id) await dependencies.store.read(owner, id);
      return json({
        id: await dependencies.store.save(owner, parsed.data, id),
      });
    }
    const body = z
      .object({ model: modelIdSchema.optional() })
      .strict()
      .safeParse(raw);
    if (!id || !body.success || parts.length !== 3)
      return json({ error: { message: "Invalid request." } }, 400);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(120_000),
    ]);
    if (parts[2] === "test") {
      await dependencies.workflow.test(owner, id, body.data.model, signal);
      return json({ ok: true });
    }
    if (parts[2] === "models")
      return json({
        models: await dependencies.workflow.listModels(owner, id, signal),
      });
    return json({ error: { message: "Not found." } }, 404);
  } catch (error) {
    if (error instanceof RangeError || error instanceof SyntaxError)
      return json({ error: { message: "Invalid or oversized request." } }, 400);
    const safe = safeAiError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.code === "AI_CONFIGURATION" ? 409 : 503,
    );
  }
}
